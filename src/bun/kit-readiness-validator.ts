// Kit Readiness Validator
// Pre-deployment validation suite mirroring AutoNet's validate-kit.sh
// Checks 6 critical areas: PKI, SSH keys, addressing, vault, Ansible reqs, FIPS

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export type CheckStatus = "pass" | "warn" | "fail";

export interface ReadinessCheck {
  id: string;
  group: string;
  name: string;
  status: CheckStatus;
  message: string;
  details: string | null;
  fixCommand: string | null;
}

export interface KitReadinessReport {
  kitId: string;
  kitName: string;
  missionId: number;
  checkedAt: Date;
  overallScore: number; // 0-100
  overallStatus: CheckStatus;
  checks: ReadinessCheck[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failures: number;
  };
}

export interface PreFieldChecklist {
  kitId: string;
  kitName: string;
  generatedAt: Date;
  markdown: string;
}

export class KitReadinessValidator {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async validateKit(kitName: string): Promise<KitReadinessReport | null> {
    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (!existsSync(hostVarsDir)) return null;

    // Find the host folder matching kitName
    const hosts = readdirSync(hostVarsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    const hostFolder = hosts.find((h) => {
      const varsPath = join(hostVarsDir, h, "vars.yml");
      if (!existsSync(varsPath)) return false;
      try {
        const vars = parse(readFileSync(varsPath, "utf8")) as Record<string, unknown>;
        return String(vars["kit_name"] || h) === kitName || h === kitName;
      } catch {
        return h === kitName;
      }
    });

    if (!hostFolder) return null;
    return this.runValidation(hostFolder);
  }

  async getReadinessScore(kitName: string): Promise<number> {
    const report = await this.validateKit(kitName);
    return report?.overallScore ?? 0;
  }

  async generatePreFieldChecklist(kitName: string): Promise<PreFieldChecklist | null> {
    const report = await this.validateKit(kitName);
    if (!report) return null;

    const lines: string[] = [];
    lines.push(`# Pre-Field Deployment Checklist`);
    lines.push(`## Kit: ${report.kitName} (${report.kitId})`);
    lines.push(`## Mission: ${report.missionId}`);
    lines.push(`## Generated: ${report.checkedAt.toISOString()}`);
    lines.push(`## Readiness Score: ${report.overallScore}/100 (${report.overallStatus.toUpperCase()})`);
    lines.push("");
    lines.push(`### Summary`);
    lines.push(`- Total checks: ${report.summary.total}`);
    lines.push(`- Passed: ${report.summary.passed}`);
    lines.push(`- Warnings: ${report.summary.warnings}`);
    lines.push(`- Failures: ${report.summary.failures}`);
    lines.push("");

    // Group checks by group
    const groups = new Map<string, ReadinessCheck[]>();
    for (const check of report.checks) {
      const group = groups.get(check.group) || [];
      group.push(check);
      groups.set(check.group, group);
    }

    for (const [groupName, checks] of groups) {
      const groupPassed = checks.every((c) => c.status === "pass");
      const statusIcon = groupPassed ? "[PASS]" : checks.some((c) => c.status === "fail") ? "[FAIL]" : "[WARN]";
      lines.push(`### ${statusIcon} ${groupName}`);
      lines.push("");

      for (const check of checks) {
        const icon =
          check.status === "pass" ? "- [x]" : check.status === "warn" ? "- [~]" : "- [ ]";
        lines.push(`${icon} **${check.name}**: ${check.message}`);
        if (check.details) {
          lines.push(`  - ${check.details}`);
        }
        if (check.fixCommand && check.status !== "pass") {
          lines.push(`  - Fix: \`${check.fixCommand}\``);
        }
      }
      lines.push("");
    }

    // Add action items section
    const failures = report.checks.filter((c) => c.status === "fail");
    const warnings = report.checks.filter((c) => c.status === "warn");

    if (failures.length > 0 || warnings.length > 0) {
      lines.push("### Action Items (must resolve before deployment)");
      lines.push("");
      for (const f of failures) {
        lines.push(`1. **[CRITICAL]** ${f.name}: ${f.message}`);
        if (f.fixCommand) lines.push(`   - Run: \`${f.fixCommand}\``);
      }
      for (const w of warnings) {
        lines.push(`1. **[WARNING]** ${w.name}: ${w.message}`);
        if (w.fixCommand) lines.push(`   - Run: \`${w.fixCommand}\``);
      }
    } else {
      lines.push("### All Checks Passed");
      lines.push("");
      lines.push("Kit is cleared for field deployment.");
    }

    return {
      kitId: report.kitId,
      kitName: report.kitName,
      generatedAt: report.checkedAt,
      markdown: lines.join("\n"),
    };
  }

  async validateAllKits(): Promise<KitReadinessReport[]> {
    const reports: KitReadinessReport[] = [];
    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (!existsSync(hostVarsDir)) return reports;

    const hosts = readdirSync(hostVarsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const host of hosts) {
      const report = await this.runValidation(host);
      if (report) reports.push(report);
    }

    return reports.sort((a, b) => a.overallScore - b.overallScore);
  }

  // --- Private validation logic ---

  private async runValidation(hostFolder: string): Promise<KitReadinessReport | null> {
    const varsPath = join(this.rootPath, "inventory/host_vars", hostFolder, "vars.yml");
    if (!existsSync(varsPath)) return null;

    let vars: Record<string, unknown> = {};
    try {
      vars = parse(readFileSync(varsPath, "utf8")) as Record<string, unknown>;
    } catch {
      return null;
    }

    const mission = Number(vars["kit_mission"] || 1);
    const kitId = Number(vars["kit_id"] || 1);
    const kitName = String(vars["kit_name"] || hostFolder);
    const kitIdentifier = `m${String(mission).padStart(2, "0")}-k${String(kitId).padStart(2, "0")}`;

    const checks: ReadinessCheck[] = [];

    // Group 1: PKI Material Staged
    checks.push(...this.checkPKI(hostFolder, kitIdentifier));

    // Group 2: SSH Keys Generated
    checks.push(...this.checkSSHKeys(hostFolder, kitIdentifier));

    // Group 3: Addressing Plan Valid
    checks.push(...this.checkAddressing(vars, kitIdentifier, mission, kitId));

    // Group 4: Vault Secrets Populated
    checks.push(...this.checkVault(hostFolder, vars, kitIdentifier));

    // Group 5: Ansible Requirements Installed
    checks.push(...this.checkAnsibleRequirements(kitIdentifier));

    // Group 6: FIPS Compliance Readiness
    checks.push(...this.checkFIPSCompliance(vars, kitIdentifier));

    // Calculate scores
    const passed = checks.filter((c) => c.status === "pass").length;
    const warnings = checks.filter((c) => c.status === "warn").length;
    const failures = checks.filter((c) => c.status === "fail").length;

    // Score: pass=full points, warn=half points, fail=0
    const maxScore = checks.length;
    const rawScore = passed + warnings * 0.5;
    const overallScore = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;

    let overallStatus: CheckStatus = "pass";
    if (failures > 0) overallStatus = "fail";
    else if (warnings > 0) overallStatus = "warn";

    return {
      kitId: kitIdentifier,
      kitName,
      missionId: mission,
      checkedAt: new Date(),
      overallScore,
      overallStatus,
      checks,
      summary: {
        total: checks.length,
        passed,
        warnings,
        failures,
      },
    };
  }

  private checkPKI(hostFolder: string, kitId: string): ReadinessCheck[] {
    const checks: ReadinessCheck[] = [];
    const pkiDir = join(this.rootPath, "files/pki");
    const hostPkiDir = join(this.rootPath, "inventory/host_vars", hostFolder, "files/pki");

    // Check global PKI directory exists
    if (existsSync(pkiDir)) {
      const entries = readdirSync(pkiDir, { withFileTypes: true });
      const certFiles = entries.filter(
        (e) => e.isFile() && (e.name.endsWith(".crt") || e.name.endsWith(".cert") || e.name.endsWith(".pem")),
      );

      // Root CA cert
      const hasRootCA = certFiles.some((f) => f.name.includes("root") || f.name.includes("ca"));
      checks.push({
        id: `${kitId}-pki-root-ca`,
        group: "PKI Material",
        name: "Root CA Certificate",
        status: hasRootCA ? "pass" : "fail",
        message: hasRootCA ? "Root CA certificate found in files/pki/" : "Root CA certificate missing",
        details: hasRootCA ? null : "Required for trust chain establishment",
        fixCommand: hasRootCA ? null : "cp /path/to/autonet-root-ca.crt files/pki/",
      });

      // Intermediate CA
      const hasIntermediate = certFiles.some(
        (f) => f.name.includes("intermediate") || f.name.includes("signing"),
      );
      checks.push({
        id: `${kitId}-pki-intermediate`,
        group: "PKI Material",
        name: "Intermediate CA Certificate",
        status: hasIntermediate ? "pass" : "warn",
        message: hasIntermediate
          ? "Intermediate CA certificate found"
          : "Intermediate CA certificate not found (may use root-signed certs)",
        details: null,
        fixCommand: hasIntermediate ? null : "scripts/generate-pki.sh intermediate",
      });
    } else {
      checks.push({
        id: `${kitId}-pki-dir`,
        group: "PKI Material",
        name: "PKI Directory",
        status: "fail",
        message: "files/pki/ directory does not exist",
        details: "No PKI material has been staged for this deployment",
        fixCommand: "mkdir -p files/pki && scripts/generate-pki.sh",
      });
    }

    // Host-specific PKI
    if (existsSync(hostPkiDir)) {
      const entries = readdirSync(hostPkiDir, { withFileTypes: true });
      const jwtFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".jwt"));
      const certFiles = entries.filter(
        (e) => e.isFile() && (e.name.endsWith(".crt") || e.name.endsWith(".cert")),
      );

      checks.push({
        id: `${kitId}-pki-host-certs`,
        group: "PKI Material",
        name: "Host PKI Material",
        status: certFiles.length > 0 || jwtFiles.length > 0 ? "pass" : "warn",
        message:
          certFiles.length > 0 || jwtFiles.length > 0
            ? `${certFiles.length} cert(s), ${jwtFiles.length} JWT enrollment token(s) staged`
            : "No host-specific PKI material found",
        details: null,
        fixCommand: null,
      });
    } else {
      checks.push({
        id: `${kitId}-pki-host-dir`,
        group: "PKI Material",
        name: "Host PKI Directory",
        status: "warn",
        message: "No host-specific PKI directory",
        details: "Host may use shared PKI from files/pki/",
        fixCommand: null,
      });
    }

    return checks;
  }

  private checkSSHKeys(hostFolder: string, kitId: string): ReadinessCheck[] {
    const checks: ReadinessCheck[] = [];
    const sshKeysDir = join(this.rootPath, "files/ssh_keys");

    if (existsSync(sshKeysDir)) {
      const entries = readdirSync(sshKeysDir, { withFileTypes: true }).filter((e) => e.isFile());

      // Check for deploy key
      const hasDeployKey = entries.some(
        (e) => e.name.includes(hostFolder) && e.name.includes("deploy"),
      );
      checks.push({
        id: `${kitId}-ssh-deploy`,
        group: "SSH Keys",
        name: "Deploy SSH Key",
        status: hasDeployKey ? "pass" : "fail",
        message: hasDeployKey ? "Deploy SSH key found" : "Deploy SSH key missing",
        details: hasDeployKey ? null : "Required for Ansible playbook execution",
        fixCommand: hasDeployKey ? null : `scripts/generate-keys.sh ${hostFolder}`,
      });

      // Check for backup key
      const hasBackupKey = entries.some(
        (e) => e.name.includes(hostFolder) && e.name.includes("backup"),
      );
      checks.push({
        id: `${kitId}-ssh-backup`,
        group: "SSH Keys",
        name: "Backup SSH Key",
        status: hasBackupKey ? "pass" : "warn",
        message: hasBackupKey ? "Backup SSH key found" : "Backup SSH key not generated",
        details: hasBackupKey ? null : "Recommended for emergency access",
        fixCommand: hasBackupKey ? null : `scripts/generate-keys.sh ${hostFolder}`,
      });

      // Check key permissions (simulated since we can't always stat remote files)
      const anyKey = entries.find((e) => e.name.includes(hostFolder) && !e.name.endsWith(".pub"));
      if (anyKey) {
        try {
          const stat = statSync(join(sshKeysDir, anyKey.name));
          const mode = stat.mode & 0o777;
          const permOk = mode === 0o600 || mode === 0o400;
          checks.push({
            id: `${kitId}-ssh-perms`,
            group: "SSH Keys",
            name: "SSH Key Permissions",
            status: permOk ? "pass" : "warn",
            message: permOk
              ? `Key permissions are ${mode.toString(8)} (secure)`
              : `Key permissions are ${mode.toString(8)}, should be 600 or 400`,
            details: null,
            fixCommand: permOk ? null : `chmod 600 files/ssh_keys/${anyKey.name}`,
          });
        } catch {
          // Cannot stat, skip permission check
        }
      }
    } else {
      checks.push({
        id: `${kitId}-ssh-dir`,
        group: "SSH Keys",
        name: "SSH Keys Directory",
        status: "fail",
        message: "files/ssh_keys/ directory does not exist",
        details: "No SSH keys have been generated",
        fixCommand: "mkdir -p files/ssh_keys && scripts/generate-keys.sh",
      });
    }

    return checks;
  }

  private checkAddressing(
    vars: Record<string, unknown>,
    kitId: string,
    missionId: number,
    kitNum: number,
  ): ReadinessCheck[] {
    const checks: ReadinessCheck[] = [];
    const kitLanBase = String(vars["kit_lan_base"] || "10");

    // Validate LAN addressing: 10.{mission}.{kit}.0/24
    const expectedLan = `${kitLanBase}.${missionId}.${kitNum}.0/24`;
    const configuredLan = String(vars["kit_lan_subnet"] || expectedLan);

    checks.push({
      id: `${kitId}-addr-lan`,
      group: "Addressing Plan",
      name: "LAN Subnet Formula",
      status: configuredLan === expectedLan || !vars["kit_lan_subnet"] ? "pass" : "warn",
      message:
        configuredLan === expectedLan || !vars["kit_lan_subnet"]
          ? `LAN: ${expectedLan} (formula-compliant)`
          : `LAN: ${configuredLan} (expected ${expectedLan})`,
      details: `Formula: ${kitLanBase}.{mission}.{kit}.0/24`,
      fixCommand: null,
    });

    // Validate WireGuard addressing: 10.255.{mission}.{kit}/16
    const kitWgBase = String(vars["kit_wg_base"] || "10.255");
    const expectedWg = `${kitWgBase}.${missionId}.${kitNum}`;
    const configuredWg = String(vars["wg_address"] || expectedWg);

    checks.push({
      id: `${kitId}-addr-wg`,
      group: "Addressing Plan",
      name: "WireGuard Address Formula",
      status: configuredWg === expectedWg || !vars["wg_address"] ? "pass" : "warn",
      message:
        configuredWg === expectedWg || !vars["wg_address"]
          ? `WG: ${expectedWg} (formula-compliant)`
          : `WG: ${configuredWg} (expected ${expectedWg})`,
      details: `Formula: ${kitWgBase}.{mission}.{kit}`,
      fixCommand: null,
    });

    // Validate BGP AS number: 4200000000 + (mission * 1000) + kit_id
    const expectedAS = 4200000000 + missionId * 1000 + kitNum;
    const configuredAS = Number(vars["bgp_as"] || expectedAS);

    checks.push({
      id: `${kitId}-addr-bgp`,
      group: "Addressing Plan",
      name: "BGP AS Number Formula",
      status: configuredAS === expectedAS ? "pass" : "fail",
      message:
        configuredAS === expectedAS
          ? `AS${expectedAS} (formula-compliant)`
          : `AS${configuredAS} (expected AS${expectedAS})`,
      details: `Formula: 4200000000 + (mission * 1000) + kit_id`,
      fixCommand:
        configuredAS !== expectedAS
          ? `Set bgp_as: ${expectedAS} in vars.yml`
          : null,
    });

    // Check mission and kit ID are set
    checks.push({
      id: `${kitId}-addr-ids`,
      group: "Addressing Plan",
      name: "Mission & Kit ID Set",
      status: vars["kit_mission"] !== undefined && vars["kit_id"] !== undefined ? "pass" : "fail",
      message:
        vars["kit_mission"] !== undefined && vars["kit_id"] !== undefined
          ? `Mission=${missionId}, Kit=${kitNum}`
          : "kit_mission or kit_id not defined in vars.yml",
      details: null,
      fixCommand: "Set kit_mission and kit_id in vars.yml",
    });

    return checks;
  }

  private checkVault(
    hostFolder: string,
    vars: Record<string, unknown>,
    kitId: string,
  ): ReadinessCheck[] {
    const checks: ReadinessCheck[] = [];

    // Host vault.yml
    const vaultPath = join(this.rootPath, "inventory/host_vars", hostFolder, "vault.yml");
    if (existsSync(vaultPath)) {
      const content = readFileSync(vaultPath, "utf8");
      const isEncrypted = content.includes("$ANSIBLE_VAULT");

      checks.push({
        id: `${kitId}-vault-exists`,
        group: "Vault Secrets",
        name: "Host Vault File",
        status: isEncrypted ? "pass" : "fail",
        message: isEncrypted
          ? "vault.yml exists and is encrypted"
          : "vault.yml exists but is NOT encrypted",
        details: isEncrypted ? null : "Secrets are stored in plaintext",
        fixCommand: isEncrypted ? null : `ansible-vault encrypt ${vaultPath}`,
      });
    } else {
      checks.push({
        id: `${kitId}-vault-exists`,
        group: "Vault Secrets",
        name: "Host Vault File",
        status: "fail",
        message: "vault.yml does not exist",
        details: "Vault secrets have not been provisioned for this kit",
        fixCommand: `ansible-vault create ${vaultPath}`,
      });
    }

    // Group vault
    const groupVaultPath = join(this.rootPath, "group_vars/all/vault.yml");
    if (existsSync(groupVaultPath)) {
      const content = readFileSync(groupVaultPath, "utf8");
      const isEncrypted = content.includes("$ANSIBLE_VAULT");

      checks.push({
        id: `${kitId}-vault-group`,
        group: "Vault Secrets",
        name: "Group Vault File",
        status: isEncrypted ? "pass" : "fail",
        message: isEncrypted
          ? "group_vars/all/vault.yml is encrypted"
          : "group_vars/all/vault.yml is NOT encrypted",
        details: null,
        fixCommand: isEncrypted ? null : `ansible-vault encrypt ${groupVaultPath}`,
      });
    } else {
      checks.push({
        id: `${kitId}-vault-group`,
        group: "Vault Secrets",
        name: "Group Vault File",
        status: "warn",
        message: "group_vars/all/vault.yml not found",
        details: "Shared secrets may not be provisioned",
        fixCommand: null,
      });
    }

    // Check for CHANGEME placeholders in vars
    let placeholderCount = 0;
    for (const [_key, value] of Object.entries(vars)) {
      if (typeof value === "string" && value.includes("CHANGEME")) {
        placeholderCount++;
      }
    }

    checks.push({
      id: `${kitId}-vault-placeholders`,
      group: "Vault Secrets",
      name: "Secret Placeholders Resolved",
      status: placeholderCount === 0 ? "pass" : "fail",
      message:
        placeholderCount === 0
          ? "No CHANGEME placeholders found in vars.yml"
          : `${placeholderCount} CHANGEME placeholder(s) still present in vars.yml`,
      details: placeholderCount > 0 ? "Replace with actual values and encrypt with ansible-vault" : null,
      fixCommand: null,
    });

    return checks;
  }

  private checkAnsibleRequirements(kitId: string): ReadinessCheck[] {
    const checks: ReadinessCheck[] = [];

    // Check requirements.yml
    const reqPath = join(this.rootPath, "requirements.yml");
    if (existsSync(reqPath)) {
      try {
        const content = readFileSync(reqPath, "utf8");
        const reqs = parse(content) as unknown;

        // Check that it parses and has roles/collections
        const hasContent = Array.isArray(reqs) || (typeof reqs === "object" && reqs !== null);
        checks.push({
          id: `${kitId}-ansible-reqs`,
          group: "Ansible Requirements",
          name: "requirements.yml",
          status: hasContent ? "pass" : "warn",
          message: hasContent
            ? "requirements.yml parsed successfully"
            : "requirements.yml is empty or malformed",
          details: null,
          fixCommand: null,
        });
      } catch {
        checks.push({
          id: `${kitId}-ansible-reqs`,
          group: "Ansible Requirements",
          name: "requirements.yml",
          status: "fail",
          message: "requirements.yml failed to parse",
          details: "YAML syntax error in requirements file",
          fixCommand: "yamllint requirements.yml",
        });
      }
    } else {
      checks.push({
        id: `${kitId}-ansible-reqs`,
        group: "Ansible Requirements",
        name: "requirements.yml",
        status: "warn",
        message: "requirements.yml not found at inventory root",
        details: "Galaxy roles/collections may not be installed",
        fixCommand: null,
      });
    }

    // Check for ansible.cfg
    const cfgPath = join(this.rootPath, "ansible.cfg");
    checks.push({
      id: `${kitId}-ansible-cfg`,
      group: "Ansible Requirements",
      name: "ansible.cfg",
      status: existsSync(cfgPath) ? "pass" : "warn",
      message: existsSync(cfgPath)
        ? "ansible.cfg found"
        : "ansible.cfg not found — using defaults",
      details: null,
      fixCommand: null,
    });

    // Check for site.yml or main playbook
    const sitePlaybook = join(this.rootPath, "site.yml");
    const deployPlaybook = join(this.rootPath, "deploy.yml");
    const hasPlaybook = existsSync(sitePlaybook) || existsSync(deployPlaybook);
    checks.push({
      id: `${kitId}-ansible-playbook`,
      group: "Ansible Requirements",
      name: "Main Playbook",
      status: hasPlaybook ? "pass" : "warn",
      message: hasPlaybook
        ? "Main playbook found"
        : "No site.yml or deploy.yml found at inventory root",
      details: null,
      fixCommand: null,
    });

    return checks;
  }

  private checkFIPSCompliance(
    vars: Record<string, unknown>,
    kitId: string,
  ): ReadinessCheck[] {
    const checks: ReadinessCheck[] = [];

    // Check FIPS mode configuration
    const fipsEnabled = vars["fips_enabled"] || vars["enable_fips"];
    checks.push({
      id: `${kitId}-fips-config`,
      group: "FIPS Compliance",
      name: "FIPS Mode Configured",
      status: fipsEnabled ? "pass" : "warn",
      message: fipsEnabled
        ? "FIPS mode is enabled in configuration"
        : "FIPS mode is not explicitly configured",
      details: "FIPS 140-2/140-3 may be required for government deployments",
      fixCommand: fipsEnabled ? null : "Set fips_enabled: true in vars.yml",
    });

    // Check crypto algorithm compliance
    const sshCiphers = String(vars["ssh_ciphers"] || "");
    const hasFIPSCiphers =
      sshCiphers.includes("aes256-gcm") ||
      sshCiphers.includes("aes128-gcm") ||
      sshCiphers === ""; // Empty means not overridden, may default to FIPS-approved

    checks.push({
      id: `${kitId}-fips-ciphers`,
      group: "FIPS Compliance",
      name: "SSH Cipher Compliance",
      status: sshCiphers === "" ? "warn" : hasFIPSCiphers ? "pass" : "fail",
      message:
        sshCiphers === ""
          ? "SSH ciphers not explicitly configured (relies on system defaults)"
          : hasFIPSCiphers
            ? "SSH ciphers include FIPS-approved algorithms"
            : "SSH ciphers may include non-FIPS-approved algorithms",
      details: "FIPS requires AES-128/256-GCM or AES-128/256-CTR",
      fixCommand: null,
    });

    // Check TLS version requirement
    const tlsMinVersion = String(vars["tls_min_version"] || "");
    const hasTLS12Plus = tlsMinVersion === "1.2" || tlsMinVersion === "1.3";
    checks.push({
      id: `${kitId}-fips-tls`,
      group: "FIPS Compliance",
      name: "TLS Minimum Version",
      status: hasTLS12Plus ? "pass" : tlsMinVersion === "" ? "warn" : "fail",
      message: hasTLS12Plus
        ? `TLS minimum version set to ${tlsMinVersion}`
        : tlsMinVersion === ""
          ? "TLS minimum version not explicitly configured"
          : `TLS minimum version ${tlsMinVersion} may not meet FIPS requirements`,
      details: "FIPS requires TLS 1.2 or higher",
      fixCommand: hasTLS12Plus ? null : "Set tls_min_version: '1.2' in vars.yml",
    });

    // Check key sizes
    const rsaKeySize = Number(vars["rsa_key_size"] || 0);
    checks.push({
      id: `${kitId}-fips-keysize`,
      group: "FIPS Compliance",
      name: "RSA Key Size",
      status: rsaKeySize >= 2048 ? "pass" : rsaKeySize === 0 ? "warn" : "fail",
      message:
        rsaKeySize >= 2048
          ? `RSA key size ${rsaKeySize} meets FIPS requirements`
          : rsaKeySize === 0
            ? "RSA key size not explicitly configured"
            : `RSA key size ${rsaKeySize} is below FIPS minimum of 2048`,
      details: "FIPS requires RSA key size >= 2048 bits",
      fixCommand: rsaKeySize > 0 && rsaKeySize < 2048 ? "Set rsa_key_size: 4096 in vars.yml" : null,
    });

    return checks;
  }
}
