// Ziti Identity Manager
// Manages OpenZiti identity enrollment and lifecycle without CLI access

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export interface ZitiIdentity {
  id: string;
  name: string;
  kitId: string;
  role: string;
  enrolled: boolean;
  enrollmentToken?: string;
  createdAt: Date;
}

export interface ZitiIdentityReport {
  kitId: string;
  controllerReachable: boolean;
  identities: ZitiIdentity[];
  enrollmentTokens: Array<{ name: string; path: string; createdAt: Date }>;
}

export class ZitiIdentityManager {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async scanAllKits(): Promise<ZitiIdentityReport[]> {
    const reports: ZitiIdentityReport[] = [];
    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (!existsSync(hostVarsDir)) return reports;

    const hosts = readdirSync(hostVarsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const host of hosts) {
      const report = await this.scanKit(host);
      if (report) reports.push(report);
    }

    return reports;
  }

  async scanKit(hostFolder: string): Promise<ZitiIdentityReport | null> {
    const varsPath = join(this.rootPath, "inventory/host_vars", hostFolder, "vars.yml");
    if (!existsSync(varsPath)) return null;

    let vars: Record<string, unknown> = {};
    try {
      vars = parse(readFileSync(varsPath, "utf8")) as Record<string, unknown>;
    } catch { return null; }

    const mission = Number(vars["kit_mission"] || 1);
    const kitId = Number(vars["kit_id"] || 1);
    const kitName = String(vars["kit_name"] || hostFolder);
    const kitLanBase = String(vars["kit_lan_base"] || "10");
    const kitIdentifier = `m${String(mission).padStart(2, "0")}-k${String(kitId).padStart(2, "0")}`;
    const controllerIp = `${kitLanBase}.${mission}.${kitId}.20`;

    // Check controller reachability
    const controllerReachable = await this.probeController(controllerIp);

    const identities: ZitiIdentity[] = [];
    const enrollmentTokens: Array<{ name: string; path: string; createdAt: Date }> = [];

    // Scan for JWT enrollment tokens
    const pkiDir = join(this.rootPath, "files/pki");
    if (existsSync(pkiDir)) {
      const entries = readdirSync(pkiDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".jwt")) {
          const stat = existsSync(join(pkiDir, entry.name)) ? readFileSync(join(pkiDir, entry.name)) : null;
          // Just record presence - we can't parse JWT without lib
          enrollmentTokens.push({
            name: entry.name,
            path: join(pkiDir, entry.name),
            createdAt: new Date(), // We could stat the file for real date
          });
        }
      }
    }

    // Also check host-specific PKI
    const hostPkiDir = join(this.rootPath, "inventory/host_vars", hostFolder, "files/pki");
    if (existsSync(hostPkiDir)) {
      const entries = readdirSync(hostPkiDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".jwt")) {
          enrollmentTokens.push({
            name: entry.name,
            path: join(hostPkiDir, entry.name),
            createdAt: new Date(),
          });
        }
      }
    }

    // Infer identities from router definitions
    const routers = (vars["ziti_routers"] as Array<{ name: string; type: string; label: string }>) || [];
    for (const router of routers) {
      const hasJwt = enrollmentTokens.some((t) => t.name.includes(router.name) || t.name.includes(kitName));
      identities.push({
        id: `${kitIdentifier}-${router.name}`,
        name: `${kitName}-ziti-${router.label || router.name}`,
        kitId: kitIdentifier,
        role: router.type,
        enrolled: !hasJwt, // If no JWT exists, assume enrolled
        enrollmentToken: hasJwt ? "pending" : undefined,
        createdAt: new Date(),
      });
    }

    return {
      kitId: kitIdentifier,
      controllerReachable,
      identities,
      enrollmentTokens,
    };
  }

  private async probeController(ip: string): Promise<boolean> {
    try {
      const proc = Bun.spawn(["nc", "-z", "-w", "2", ip, "1280"], { stdout: "pipe", stderr: "pipe" });
      await proc.exited;
      return proc.exitCode === 0;
    } catch {
      return false;
    }
  }
}
