// File Watcher - Monitors AutoNet repo for changes
import { existsSync, statSync, readFileSync } from "fs";
import { resolve, join, relative } from "path";

export interface FileChangeEvent {
  path: string;
  relativePath: string;
  type: "added" | "modified" | "deleted";
  timestamp: Date;
  size?: number;
}

export interface RepoSnapshot {
  path: string;
  scannedAt: Date;
  files: Map<string, { mtime: number; size: number; hash: string }>;
}

export class AutonetFileWatcher {
  private rootPath: string;
  private lastSnapshot: RepoSnapshot | null = null;
  private watchIntervalMs = 30000;
  private timer: Timer | null = null;
  private changeHandlers: Array<(changes: FileChangeEvent[]) => void> = [];

  constructor(rootPath: string) {
    this.rootPath = resolve(rootPath);
  }

  startWatching(): void {
    if (this.timer) return;
    this.scan(); // Initial scan
    this.timer = setInterval(() => this.scan(), this.watchIntervalMs);
  }

  stopWatching(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onChange(handler: (changes: FileChangeEvent[]) => void): () => void {
    this.changeHandlers.push(handler);
    return () => {
      const idx = this.changeHandlers.indexOf(handler);
      if (idx > -1) this.changeHandlers.splice(idx, 1);
    };
  }

  getLastSnapshot(): RepoSnapshot | null {
    return this.lastSnapshot;
  }

  scan(): FileChangeEvent[] {
    if (!existsSync(this.rootPath)) {
      return [];
    }

    const changes: FileChangeEvent[] = [];
    const currentFiles = new Map<string, { mtime: number; size: number; hash: string }>();

    // Scan critical files only for performance
    const criticalPaths = [
      "group_vars/all/vars.yml",
      "group_vars/all/vault.yml",
      "inventory/inventory.yml",
    ];

    for (const cp of criticalPaths) {
      const fullPath = join(this.rootPath, cp);
      if (existsSync(fullPath)) {
        const stat = statSync(fullPath);
        const hash = this.quickHash(readFileSync(fullPath, "utf8"));
        currentFiles.set(cp, { mtime: stat.mtimeMs, size: stat.size, hash });

        if (this.lastSnapshot) {
          const previous = this.lastSnapshot.files.get(cp);
          if (!previous) {
            changes.push({ path: fullPath, relativePath: cp, type: "added", timestamp: new Date(), size: stat.size });
          } else if (previous.hash !== hash) {
            changes.push({ path: fullPath, relativePath: cp, type: "modified", timestamp: new Date(), size: stat.size });
          }
        }
      } else if (this.lastSnapshot?.files.has(cp)) {
        changes.push({ path: fullPath, relativePath: cp, type: "deleted", timestamp: new Date() });
      }
    }

    // Scan host_vars
    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (existsSync(hostVarsDir)) {
      const hosts = this.listDirectories(hostVarsDir);
      for (const host of hosts) {
        const varsPath = `inventory/host_vars/${host}/vars.yml`;
        const fullPath = join(this.rootPath, varsPath);
        if (existsSync(fullPath)) {
          const stat = statSync(fullPath);
          const hash = this.quickHash(readFileSync(fullPath, "utf8"));
          currentFiles.set(varsPath, { mtime: stat.mtimeMs, size: stat.size, hash });

          if (this.lastSnapshot) {
            const previous = this.lastSnapshot.files.get(varsPath);
            if (!previous) {
              changes.push({ path: fullPath, relativePath: varsPath, type: "added", timestamp: new Date(), size: stat.size });
            } else if (previous.hash !== hash) {
              changes.push({ path: fullPath, relativePath: varsPath, type: "modified", timestamp: new Date(), size: stat.size });
            }
          }
        }
      }
    }

    // Scan playbooks
    const playbooks = ["site.yml", "destroy.yml", "modify.yml", "peer-exchange.yml", "emergency-rebuild.yml", "update.yml"];
    for (const pb of playbooks) {
      const fullPath = join(this.rootPath, pb);
      if (existsSync(fullPath)) {
        const stat = statSync(fullPath);
        const hash = this.quickHash(readFileSync(fullPath, "utf8"));
        currentFiles.set(pb, { mtime: stat.mtimeMs, size: stat.size, hash });

        if (this.lastSnapshot) {
          const previous = this.lastSnapshot.files.get(pb);
          if (!previous) {
            changes.push({ path: fullPath, relativePath: pb, type: "added", timestamp: new Date(), size: stat.size });
          } else if (previous.hash !== hash) {
            changes.push({ path: fullPath, relativePath: pb, type: "modified", timestamp: new Date(), size: stat.size });
          }
        }
      }
    }

    this.lastSnapshot = {
      path: this.rootPath,
      scannedAt: new Date(),
      files: currentFiles,
    };

    if (changes.length > 0) {
      for (const handler of this.changeHandlers) {
        try {
          handler(changes);
        } catch (e) {
          console.error("Change handler error:", e);
        }
      }
    }

    return changes;
  }

  private listDirectories(dir: string): string[] {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  private quickHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return hash.toString(16);
  }
}
