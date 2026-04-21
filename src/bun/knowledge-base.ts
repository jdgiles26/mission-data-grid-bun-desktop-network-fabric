// Knowledge Base Engine
// Offline-first embedded documentation and troubleshooting runbooks

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

export interface KnowledgeArticle {
  id: string;
  title: string;
  category: string;
  tags: string[];
  content: string;
  sourceFile: string;
}

export interface TroubleshootingTree {
  id: string;
  title: string;
  steps: Array<{
    question: string;
    check: string;
    yesNext: string | null;
    noNext: string | null;
    action?: string;
  }>;
}

export class KnowledgeBaseEngine {
  private rootPath: string;
  private articles: KnowledgeArticle[] = [];
  private trees: TroubleshootingTree[] = [];

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.indexDocs();
    this.buildTroubleshootingTrees();
  }

  private indexDocs(): void {
    const docsDir = join(this.rootPath, "docs");
    if (!existsSync(docsDir)) return;

    const files = this.listFilesRecursive(docsDir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      try {
        const content = readFileSync(file, "utf8");
        const title = content.match(/^#\s+(.+)/m)?.[1] || file.split("/").pop() || "Untitled";
        const category = this.inferCategory(file);
        const tags = this.extractTags(content);

        this.articles.push({
          id: this.slugify(title),
          title,
          category,
          tags,
          content,
          sourceFile: file,
        });
      } catch { /* skip unreadable */ }
    }
  }

  private buildTroubleshootingTrees(): void {
    this.trees = [
      {
        id: "wg-tunnel-down",
        title: "WireGuard Tunnel Down",
        steps: [
          { question: "Can you ping the edge gateway (.1)?", check: "ping -c 3 <kit-lan>.1", yesNext: "step-2", noNext: "step-power" },
          { question: "Is WireGuard interface up?", check: "ip link show wg0", yesNext: "step-3", noNext: "action-wg-up" },
          { question: "Is MTU set to 1300?", check: "ip link show wg0 | grep mtu", yesNext: "step-4", noNext: "action-mtu" },
          { question: "Can you reach HQ (.0.1)?", check: "ping -c 3 10.255.0.1", yesNext: null, noNext: "action-hq-failover" },
          { question: "Is the kit powered on?", check: "Physical power LED", yesNext: "step-2", noNext: "action-power", action: "Check power supply and UPS status" },
        ],
      },
      {
        id: "ziti-enroll-fail",
        title: "Ziti Enrollment Failed",
        steps: [
          { question: "Is controller reachable on port 1280?", check: "nc -z <ctrl-ip> 1280", yesNext: "step-2", noNext: "action-ctrl-check" },
          { question: "Is JWT token still valid (not expired)?", check: "openssl jwt -in <token.jwt>", yesNext: "step-3", noNext: "action-regen-jwt" },
          { question: "Does router have valid PKI cert chain?", check: "openssl verify -CAfile ca.crt router.crt", yesNext: null, noNext: "action-pki-fix" },
        ],
      },
      {
        id: "bgp-no-routes",
        title: "BGP Not Advertising Routes",
        steps: [
          { question: "Is BIRD daemon running?", check: "systemctl status bird", yesNext: "step-2", noNext: "action-bird-start" },
          { question: "Are BGP sessions established?", check: "birdc show protocols", yesNext: "step-3", noNext: "action-bgp-peer" },
          { question: "Are routes in the kernel?", check: "ip route show", yesNext: null, noNext: "action-route-export" },
        ],
      },
    ];
  }

  search(query: string): KnowledgeArticle[] {
    const lower = query.toLowerCase();
    return this.articles
      .filter((a) =>
        a.title.toLowerCase().includes(lower) ||
        a.content.toLowerCase().includes(lower) ||
        a.tags.some((t) => t.toLowerCase().includes(lower)),
      )
      .slice(0, 20);
  }

  getCategories(): string[] {
    const cats = new Set(this.articles.map((a) => a.category));
    return Array.from(cats).sort();
  }

  getArticlesByCategory(category: string): KnowledgeArticle[] {
    return this.articles.filter((a) => a.category === category);
  }

  getArticle(id: string): KnowledgeArticle | null {
    return this.articles.find((a) => a.id === id) || null;
  }

  getTroubleshootingTrees(): TroubleshootingTree[] {
    return this.trees;
  }

  getTree(id: string): TroubleshootingTree | null {
    return this.trees.find((t) => t.id === id) || null;
  }

  private inferCategory(filePath: string): string {
    if (filePath.includes("Build")) return "Build Guides";
    if (filePath.includes("Topology") || filePath.includes("topology")) return "Network Topology";
    if (filePath.includes("Address")) return "Addressing";
    if (filePath.includes("runbook") || filePath.includes("Runbook")) return "Runbooks";
    return "Documentation";
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const tagMatches = content.matchAll(/`(\w+)`/g);
    for (const match of tagMatches) {
      if (match[1].length > 3) tags.push(match[1]);
    }
    return [...new Set(tags)].slice(0, 10);
  }

  private slugify(text: string): string {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  private listFilesRecursive(dir: string): string[] {
    const results: string[] = [];
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this.listFilesRecursive(fullPath));
        } else {
          results.push(fullPath);
        }
      }
    } catch { /* ignore */ }
    return results;
  }
}
