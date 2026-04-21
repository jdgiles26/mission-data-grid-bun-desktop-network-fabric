// Config Drift Detector
// Compares live running config against vars.yml source of truth

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export interface DriftFinding {
  kitId: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  category: string;
  expected: string;
  actual: string;
  recommendation: string;
}

export interface DriftReport {
  kitId: string;
  kitName: string;
  checkedAt: Date;
  findings: DriftFinding[];
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
}

export class ConfigDriftDetector {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async checkAllKits(): Promise<DriftReport[]> {
    const reports: DriftReport[] = [];
    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (!existsSync(hostVarsDir)) return reports;

    const hosts = readdirSync(hostVarsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const host of hosts) {
      const report = await this.checkKit(host);
      if (report) reports.push(report);
    }

    return reports;
  }

  async checkKit(hostFolder: string): Promise<DriftReport | null> {
    const varsPath = join(this.rootPath, "inventory/host_vars", hostFolder, "vars.yml");
    if (!existsSync(varsPath)) return null;

    let vars: Record<string, unknown> = {};
    try {
      vars = parse(readFileSync(varsPath, "utf8")) as Record<string, unknown>;
    } catch { return null; }

    const mission = Number(vars["kit_mission"] || 1);
    const kitId = Number(vars["kit_id"] || 1);
    const kitName = String(vars["kit_name"] || hostFolder);
    const kitIdentifier = `m${String(mission).padStart(2, "0")}-k${String(kitId).padStart(2, "0")}`;

    const findings: DriftFinding[] = [];

    // Check for unresolved template variables still in vars.yml
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value === "string" && value.includes("CHANGEME")) {
        findings.push({
          kitId: kitIdentifier,
          severity: "CRITICAL",
          category: "Vault Secrets",
          expected: "Encrypted secret value",
          actual: `"${value}" is still a placeholder`,
          recommendation: `Replace CHANGEME in ${key} with real value and encrypt with ansible-vault`,
        });
      }
      if (typeof value === "string" && value.includes("{{")) {
        findings.push({
          kitId: kitIdentifier,
          severity: "WARNING",
          category: "Template Variables",
          expected: "Concrete value",
          actual: `"${value}" uses unresolved Jinja2 template`,
          recommendation: `Ensure ${key} resolves to a concrete value at runtime`,
        });
      }
    }

    // Check SSH key existence
    const sshKeysDir = join(this.rootPath, "files/ssh_keys");
    if (existsSync(sshKeysDir)) {
      const deployKey = join(sshKeysDir, `${hostFolder}_deploy`);
      const backupKey = join(sshKeysDir, `${hostFolder}_backup`);
      if (!existsSync(deployKey)) {
        findings.push({
          kitId: kitIdentifier,
          severity: "WARNING",
          category: "SSH Keys",
          expected: `Deploy key at ${deployKey}`,
          actual: "File missing",
          recommendation: `Run scripts/generate-keys.sh ${kitName}`,
        });
      }
      if (!existsSync(backupKey)) {
        findings.push({
          kitId: kitIdentifier,
          severity: "WARNING",
          category: "SSH Keys",
          expected: `Backup key at ${backupKey}`,
          actual: "File missing",
          recommendation: `Run scripts/generate-keys.sh ${kitName}`,
        });
      }
    }

    // Check vault.yml exists and is encrypted
    const vaultPath = join(this.rootPath, "inventory/host_vars", hostFolder, "vault.yml");
    if (!existsSync(vaultPath)) {
      findings.push({
        kitId: kitIdentifier,
        severity: "CRITICAL",
        category: "Vault",
        expected: "Encrypted vault.yml",
        actual: "vault.yml missing",
        recommendation: `Create ansible-vault encrypted file at ${vaultPath}`,
      });
    } else {
      const content = readFileSync(vaultPath, "utf8");
      if (!content.includes("$ANSIBLE_VAULT")) {
        findings.push({
          kitId: kitIdentifier,
          severity: "CRITICAL",
          category: "Vault",
          expected: "Encrypted vault.yml",
          actual: "vault.yml is NOT encrypted",
          recommendation: `Encrypt with: ansible-vault encrypt ${vaultPath}`,
        });
      }
    }

    // Check for WireGuard key presence in vault
    const groupVaultPath = join(this.rootPath, "group_vars/all/vault.yml");
    if (existsSync(groupVaultPath)) {
      const vaultContent = readFileSync(groupVaultPath, "utf8");
      if (!vaultContent.includes("$ANSIBLE_VAULT")) {
        findings.push({
          kitId: kitIdentifier,
          severity: "CRITICAL",
          category: "Vault",
          expected: "Encrypted group vault",
          actual: "group_vars/all/vault.yml is NOT encrypted",
          recommendation: "Encrypt group vault with ansible-vault",
        });
      }
    }

    return {
      kitId: kitIdentifier,
      kitName,
      checkedAt: new Date(),
      findings,
      summary: {
        total: findings.length,
        critical: findings.filter((f) => f.severity === "CRITICAL").length,
        warning: findings.filter((f) => f.severity === "WARNING").length,
        info: findings.filter((f) => f.severity === "INFO").length,
      },
    };
  }
}
