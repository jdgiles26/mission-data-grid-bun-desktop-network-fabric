// AutoNet Config Validator
// Validates YAML configurations, addresses, and playbook syntax

import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { parse } from "yaml";

export interface ValidationIssue {
  severity: "ERROR" | "WARNING" | "INFO";
  file: string;
  line?: number;
  message: string;
  recommendation: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  summary: {
    kitsFound: number;
    hostsFound: number;
    playbooksFound: number;
    variablesDefined: number;
    stagedPeers: number;
  };
  checkedAt: Date;
}

export class AutonetConfigValidator {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = resolve(rootPath);
  }

  async validate(): Promise<ConfigValidationResult> {
    const issues: ValidationIssue[] = [];
    const summary = {
      kitsFound: 0,
      hostsFound: 0,
      playbooksFound: 0,
      variablesDefined: 0,
      stagedPeers: 0,
    };

    if (!existsSync(this.rootPath)) {
      issues.push({
        severity: "ERROR",
        file: this.rootPath,
        message: "AutoNet root directory does not exist",
        recommendation: "Verify the AutoNet project path in Settings",
      });
      return { valid: false, issues, summary, checkedAt: new Date() };
    }

    // Check required directories
    const requiredDirs = ["inventory", "inventory/host_vars", "group_vars", "roles"];
    for (const dir of requiredDirs) {
      const fullPath = join(this.rootPath, dir);
      if (!existsSync(fullPath)) {
        issues.push({
          severity: "ERROR",
          file: dir,
          message: `Required directory missing: ${dir}`,
          recommendation: `Ensure the AutoNet repository is complete and includes ${dir}`,
        });
      }
    }

    // Validate group_vars/all/vars.yml
    const groupVarsPath = join(this.rootPath, "group_vars/all/vars.yml");
    if (existsSync(groupVarsPath)) {
      try {
        const content = readFileSync(groupVarsPath, "utf8");
        const parsed = parse(content) as Record<string, unknown>;
        if (parsed) {
          summary.variablesDefined += Object.keys(parsed).length;
          this.validateGroupVars(parsed, issues);
        }
      } catch (e) {
        issues.push({
          severity: "ERROR",
          file: groupVarsPath,
          message: `Failed to parse group vars: ${e}`,
          recommendation: "Fix YAML syntax errors in group_vars/all/vars.yml",
        });
      }
    }

    // Validate inventory
    const inventoryPath = join(this.rootPath, "inventory/inventory.yml");
    if (existsSync(inventoryPath)) {
      try {
        const content = readFileSync(inventoryPath, "utf8");
        const parsed = parse(content) as Record<string, unknown>;
        if (parsed) {
          summary.hostsFound += this.countInventoryHosts(parsed);
        }
      } catch (e) {
        issues.push({
          severity: "ERROR",
          file: inventoryPath,
          message: `Failed to parse inventory: ${e}`,
          recommendation: "Fix YAML syntax in inventory/inventory.yml",
        });
      }
    }

    // Validate host_vars
    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (existsSync(hostVarsDir)) {
      const hosts = readdirSync(hostVarsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

      summary.kitsFound = hosts.length;

      const seenMissions = new Map<number, Set<number>>();
      const seenAddresses = new Set<string>();

      for (const host of hosts) {
        const varsPath = join(hostVarsDir, host, "vars.yml");
        if (!existsSync(varsPath)) {
          issues.push({
            severity: "WARNING",
            file: `inventory/host_vars/${host}`,
            message: `Host ${host} is missing vars.yml`,
            recommendation: "Run the new-kit.sh script or create vars.yml manually",
          });
          continue;
        }

        try {
          const content = readFileSync(varsPath, "utf8");
          const parsed = parse(content) as Record<string, unknown>;
          if (parsed) {
            this.validateHostVars(host, parsed, issues, seenMissions, seenAddresses, summary);
          }
        } catch (e) {
          issues.push({
            severity: "ERROR",
            file: varsPath,
            message: `Failed to parse host vars for ${host}: ${e}`,
            recommendation: "Fix YAML syntax errors",
          });
        }
      }
    }

    // Validate playbooks
    const playbookFiles = ["site.yml", "destroy.yml", "modify.yml", "peer-exchange.yml", "emergency-rebuild.yml"];
    for (const pb of playbookFiles) {
      const pbPath = join(this.rootPath, pb);
      if (existsSync(pbPath)) {
        summary.playbooksFound++;
        try {
          const content = readFileSync(pbPath, "utf8");
          parse(content); // Just validate YAML parseability
        } catch (e) {
          issues.push({
            severity: "ERROR",
            file: pbPath,
            message: `Playbook ${pb} has YAML syntax errors: ${e}`,
            recommendation: "Fix YAML syntax before running ansible-playbook",
          });
        }
      }
    }

    // Check for vault files
    const vaultPath = join(this.rootPath, "group_vars/all/vault.yml");
    if (!existsSync(vaultPath)) {
      issues.push({
        severity: "WARNING",
        file: "group_vars/all/vault.yml",
        message: "Vault file not found - sensitive variables may be unencrypted",
        recommendation: "Create ansible-vault encrypted file for secrets",
      });
    }

    const hasErrors = issues.some((i) => i.severity === "ERROR");

    return {
      valid: !hasErrors,
      issues: issues.sort((a, b) => this.severityWeight(b.severity) - this.severityWeight(a.severity)),
      summary,
      checkedAt: new Date(),
    };
  }

  private validateGroupVars(vars: Record<string, unknown>, issues: ValidationIssue[]): void {
    const required = ["kit_lan_base", "kit_wg_base"];
    for (const key of required) {
      if (!(key in vars)) {
        issues.push({
          severity: "WARNING",
          file: "group_vars/all/vars.yml",
          message: `Recommended global default missing: ${key}`,
          recommendation: `Define ${key} to ensure consistent addressing`,
        });
      }
    }

    const lanBase = vars["kit_lan_base"];
    if (typeof lanBase === "string" && !/^10(\.\d{1,3}){0,2}$/.test(lanBase)) {
      issues.push({
        severity: "WARNING",
        file: "group_vars/all/vars.yml",
        message: `kit_lan_base "${lanBase}" does not follow RFC 1918 10.x recommendation`,
        recommendation: "Use 10.x base for mission LAN addressing",
      });
    }
  }

  private validateHostVars(
    host: string,
    vars: Record<string, unknown>,
    issues: ValidationIssue[],
    seenMissions: Map<number, Set<number>>,
    seenAddresses: Set<string>,
    summary: { stagedPeers: number },
  ): void {
    const mission = Number(vars["kit_mission"]);
    const kitId = Number(vars["kit_id"]);
    const kitName = String(vars["kit_name"] || "");

    if (!Number.isFinite(mission) || mission <= 0) {
      issues.push({
        severity: "ERROR",
        file: `inventory/host_vars/${host}/vars.yml`,
        message: `Invalid or missing kit_mission for ${host}`,
        recommendation: "Set kit_mission to a positive integer",
      });
    }

    if (!Number.isFinite(kitId) || kitId <= 0) {
      issues.push({
        severity: "ERROR",
        file: `inventory/host_vars/${host}/vars.yml`,
        message: `Invalid or missing kit_id for ${host}`,
        recommendation: "Set kit_id to a positive integer",
      });
    }

    if (!kitName || kitName.includes("{{")) {
      issues.push({
        severity: "WARNING",
        file: `inventory/host_vars/${host}/vars.yml`,
        message: `kit_name is undefined or uses unresolved template for ${host}`,
        recommendation: "Set kit_name to a concrete string (e.g., 'nc', 'ca')",
      });
    }

    // Check for duplicate mission+kit combos
    if (Number.isFinite(mission) && Number.isFinite(kitId)) {
      const existing = seenMissions.get(mission);
      if (existing) {
        if (existing.has(kitId)) {
          issues.push({
            severity: "ERROR",
            file: `inventory/host_vars/${host}/vars.yml`,
            message: `Duplicate mission ${mission} kit ${kitId} detected`,
            recommendation: "Each kit_id must be unique within a mission",
          });
        }
        existing.add(kitId);
      } else {
        seenMissions.set(mission, new Set([kitId]));
      }
    }

    // Validate IP addresses
    const ipFields = ["ip_proxmox", "ip_edge_gw", "ip_ziti_ctrl", "ip_nebula", "ip_monitor"];
    for (const field of ipFields) {
      const ip = vars[field];
      if (typeof ip === "string" && ip.includes("{{")) continue; // Template, skip
      if (typeof ip === "string" && ip) {
        if (!this.isValidIP(ip)) {
          issues.push({
            severity: "ERROR",
            file: `inventory/host_vars/${host}/vars.yml`,
            message: `Invalid IP address in ${field}: ${ip}`,
            recommendation: "Use dotted-decimal IPv4 format",
          });
        } else if (seenAddresses.has(ip)) {
          issues.push({
            severity: "ERROR",
            file: `inventory/host_vars/${host}/vars.yml`,
            message: `Duplicate IP address detected: ${ip} in ${field}`,
            recommendation: "Each VM must have a unique IP address",
          });
        } else {
          seenAddresses.add(ip);
        }
      }
    }

    // Validate router definitions
    const routers = vars["ziti_routers"];
    if (Array.isArray(routers)) {
      const routerNames = new Set<string>();
      for (const r of routers) {
        const name = String((r as Record<string, unknown>)?.["name"] || "");
        if (!name || name.includes("{{")) {
          issues.push({
            severity: "WARNING",
            file: `inventory/host_vars/${host}/vars.yml`,
            message: `Router with missing name in ${host}`,
            recommendation: "Each ziti_routers entry must have a concrete name",
          });
        } else if (routerNames.has(name)) {
          issues.push({
            severity: "ERROR",
            file: `inventory/host_vars/${host}/vars.yml`,
            message: `Duplicate router name "${name}" in ${host}`,
            recommendation: "Router names must be unique per kit",
          });
        } else {
          routerNames.add(name);
        }
      }
    }

    // Check for staged peers
    const missionKits = vars["mission_kits"];
    if (Array.isArray(missionKits)) {
      for (const mk of missionKits) {
        const wgIp = String((mk as Record<string, unknown>)?.["wg_public_ip"] || "");
        if (wgIp.toUpperCase() === "STAGED") {
          summary.stagedPeers++;
        }
      }
    }

    // Check SSH keys exist
    const sshKeysDir = join(this.rootPath, "files/ssh_keys");
    if (existsSync(sshKeysDir)) {
      const deployKey = join(sshKeysDir, `${host}_deploy`);
      if (!existsSync(deployKey)) {
        issues.push({
          severity: "WARNING",
          file: `files/ssh_keys/`,
          message: `Deploy SSH key missing for ${host}`,
          recommendation: "Run scripts/generate-keys.sh to create per-VM SSH keypairs",
        });
      }
    }
  }

  private isValidIP(ip: string): boolean {
    const parts = ip.split(".");
    if (parts.length !== 4) return false;
    return parts.every((p) => {
      const n = parseInt(p, 10);
      return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
    });
  }

  private countInventoryHosts(inventory: Record<string, unknown>): number {
    let count = 0;
    const traverse = (obj: unknown) => {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        for (const item of obj) traverse(item);
        return;
      }
      for (const [key, value] of Object.entries(obj)) {
        if (key === "hosts" && value && typeof value === "object") {
          count += Object.keys(value).length;
        } else {
          traverse(value);
        }
      }
    };
    traverse(inventory);
    return count;
  }

  private severityWeight(s: ValidationIssue["severity"]): number {
    return { ERROR: 3, WARNING: 2, INFO: 1 }[s];
  }
}
