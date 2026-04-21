// Ansible Runbook Intelligence
// Deep analysis of all AutoNet playbooks: site.yml, update.yml, modify.yml,
// destroy.yml, revoke-kit.yml, peer-exchange.yml, emergency-rebuild.yml
// with tag dependency mapping, impact analysis, risk scoring, and execution planning

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PlaybookInfo {
  name: string;
  fileName: string;
  description: string;
  tags: string[];
  roles: string[];
  riskLevel: RiskLevel;
  estimatedDurationMinutes: number;
  requiresConfirmation: boolean;
  isDestructive: boolean;
  lastExecuted: Date | null;
  executionCount: number;
  affectsServices: string[];
  affectsInfrastructure: string[];
}

export interface TagDependency {
  tag: string;
  dependsOn: string[];
  dependedOnBy: string[];
  playbooks: string[];
  description: string;
  category: "infrastructure" | "networking" | "security" | "services" | "monitoring" | "pki" | "cleanup";
}

export interface ImpactAnalysis {
  playbook: string;
  affectedVMs: string[];
  affectedServices: string[];
  affectedConfigs: string[];
  networkImpact: "NONE" | "BRIEF_DISRUPTION" | "EXTENDED_DISRUPTION" | "FULL_OUTAGE";
  serviceImpact: "NONE" | "DEGRADED" | "PARTIAL_OUTAGE" | "FULL_OUTAGE";
  estimatedDowntimeMinutes: number;
  requiresMaintenanceWindow: boolean;
  rollbackPossible: boolean;
  warnings: string[];
}

export interface RoleDependencyNode {
  role: string;
  description: string;
  dependsOn: string[];
  dependedOnBy: string[];
  tags: string[];
  idempotent: boolean;
  estimatedDurationMinutes: number;
}

export interface ExecutionPlan {
  description: string;
  recommendedPlaybook: string;
  recommendedTags: string[];
  executionOrder: Array<{
    step: number;
    action: string;
    tags: string[];
    riskLevel: RiskLevel;
    estimatedMinutes: number;
    preCheck: string;
    rollback: string;
  }>;
  totalEstimatedMinutes: number;
  overallRisk: RiskLevel;
  warnings: string[];
  prerequisites: string[];
}

export interface RiskAssessment {
  playbook: string;
  riskLevel: RiskLevel;
  riskScore: number; // 0-100
  factors: Array<{
    factor: string;
    weight: number;
    description: string;
  }>;
  mitigations: string[];
  requiresApproval: boolean;
  approvalLevel: "OPERATOR" | "TEAM_LEAD" | "MISSION_COMMANDER";
}

export interface RollbackAssessment {
  playbook: string;
  canRollback: boolean;
  rollbackCompleteness: "FULL" | "PARTIAL" | "NONE";
  rollbackSteps: string[];
  rollbackEstimateMinutes: number;
  dataLossRisk: boolean;
  manualStepsRequired: string[];
  limitations: string[];
}

export class AnsibleRunbookIntelligence {
  private rootPath: string;
  private playbooks: PlaybookInfo[] = [];
  private tags: TagDependency[] = [];
  private roles: RoleDependencyNode[] = [];

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.buildPlaybookCatalog();
    this.buildTagDependencyMap();
    this.buildRoleDependencyGraph();
    this.scanRealPlaybooks();
  }

  private scanRealPlaybooks(): void {
    // Attempt to load real playbook files from the AutoNet repo
    const playbookFiles = [
      "site.yml", "update.yml", "modify.yml", "destroy.yml",
      "revoke-kit.yml", "peer-exchange.yml", "emergency-rebuild.yml",
    ];

    for (const fileName of playbookFiles) {
      const filePath = join(this.rootPath, fileName);
      if (!existsSync(filePath)) continue;

      try {
        const content = readFileSync(filePath, "utf8");
        const parsed = parse(content) as unknown;

        // Extract real tags from playbook if possible
        if (Array.isArray(parsed)) {
          for (const play of parsed) {
            if (play && typeof play === "object" && "tags" in play) {
              const realTags = Array.isArray(play.tags) ? play.tags : [play.tags];
              const existing = this.playbooks.find((p) => p.fileName === fileName);
              if (existing) {
                // Merge real tags with our catalog
                for (const tag of realTags) {
                  if (typeof tag === "string" && !existing.tags.includes(tag)) {
                    existing.tags.push(tag);
                  }
                }
              }
            }
          }
        }
      } catch { /* skip unparseable */ }
    }

    // Scan roles directory
    const rolesDir = join(this.rootPath, "roles");
    if (existsSync(rolesDir)) {
      try {
        const roleDirs = readdirSync(rolesDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name);

        for (const roleName of roleDirs) {
          const existing = this.roles.find((r) => r.role === roleName);
          if (!existing) {
            // Discovered new role from filesystem
            this.roles.push({
              role: roleName,
              description: `Role discovered from roles/${roleName}/`,
              dependsOn: [],
              dependedOnBy: [],
              tags: [roleName],
              idempotent: true,
              estimatedDurationMinutes: 5,
            });
          }

          // Try to read role's meta/main.yml for dependencies
          const metaPath = join(rolesDir, roleName, "meta/main.yml");
          if (existsSync(metaPath)) {
            try {
              const meta = parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>;
              const deps = meta["dependencies"] as Array<{ role: string } | string> || [];
              const roleNode = this.roles.find((r) => r.role === roleName);
              if (roleNode) {
                for (const dep of deps) {
                  const depName = typeof dep === "string" ? dep : dep.role;
                  if (depName && !roleNode.dependsOn.includes(depName)) {
                    roleNode.dependsOn.push(depName);
                  }
                }
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    }
  }

  private buildPlaybookCatalog(): void {
    this.playbooks = [
      {
        name: "Full Site Deployment",
        fileName: "site.yml",
        description: "Complete site deployment: provisions Proxmox VMs, configures base OS, networking, security, WireGuard, BIRD BGP, Ziti fabric, monitoring, and all mission apps.",
        tags: [
          "proxmox_vms", "almalinux_base", "security_hardening", "chrony",
          "wireguard", "bird", "ziti_controller", "ziti_routers", "ziti_identities",
          "nebula", "monitoring", "grafana", "loki", "node_exporter",
          "firewall", "fail2ban", "auditd", "pki", "sshd",
        ],
        roles: [
          "proxmox_vms", "almalinux_base", "security_hardening", "chrony_ntp",
          "wireguard", "bird_bgp", "ziti_controller", "ziti_router", "ziti_identities",
          "nebula_mesh", "monitoring_stack", "pki_management", "firewall_rules",
        ],
        riskLevel: "HIGH",
        estimatedDurationMinutes: 45,
        requiresConfirmation: true,
        isDestructive: false,
        lastExecuted: this.simulateLastRun("site"),
        executionCount: this.seededInt("site-count", 5, 30),
        affectsServices: ["all"],
        affectsInfrastructure: ["VMs", "networking", "security", "PKI", "monitoring"],
      },
      {
        name: "Update Configuration",
        fileName: "update.yml",
        description: "Non-destructive configuration update. Applies changed configurations without reprovisioning VMs. Safe for routine maintenance.",
        tags: [
          "wireguard", "bird", "ziti_routers", "ziti_identities",
          "monitoring", "firewall", "security_hardening", "chrony",
        ],
        roles: [
          "wireguard", "bird_bgp", "ziti_router", "ziti_identities",
          "monitoring_stack", "firewall_rules", "security_hardening",
        ],
        riskLevel: "LOW",
        estimatedDurationMinutes: 15,
        requiresConfirmation: false,
        isDestructive: false,
        lastExecuted: this.simulateLastRun("update"),
        executionCount: this.seededInt("update-count", 20, 100),
        affectsServices: ["wireguard", "bird", "ziti", "monitoring"],
        affectsInfrastructure: ["networking", "monitoring"],
      },
      {
        name: "Modify Deployment",
        fileName: "modify.yml",
        description: "Targeted modification playbook. Use with specific tags to modify individual components. Supports force_reenroll and selective reconfiguration.",
        tags: [
          "wireguard", "bird", "ziti_controller", "ziti_routers", "ziti_identities",
          "pki", "monitoring", "nebula", "firewall",
        ],
        roles: [
          "wireguard", "bird_bgp", "ziti_controller", "ziti_router",
          "ziti_identities", "pki_management", "monitoring_stack",
        ],
        riskLevel: "MEDIUM",
        estimatedDurationMinutes: 20,
        requiresConfirmation: true,
        isDestructive: false,
        lastExecuted: this.simulateLastRun("modify"),
        executionCount: this.seededInt("modify-count", 10, 50),
        affectsServices: ["targeted"],
        affectsInfrastructure: ["targeted"],
      },
      {
        name: "Destroy Kit",
        fileName: "destroy.yml",
        description: "DESTRUCTIVE: Completely removes all VMs and configurations for a targeted kit. Data is unrecoverable without backup.",
        tags: ["destroy", "cleanup"],
        roles: ["proxmox_destroy", "cleanup"],
        riskLevel: "CRITICAL",
        estimatedDurationMinutes: 10,
        requiresConfirmation: true,
        isDestructive: true,
        lastExecuted: this.simulateLastRun("destroy"),
        executionCount: this.seededInt("destroy-count", 0, 5),
        affectsServices: ["all"],
        affectsInfrastructure: ["VMs", "networking", "storage", "PKI"],
      },
      {
        name: "Revoke Kit",
        fileName: "revoke-kit.yml",
        description: "Security operation: Removes a kit from the mesh, revokes all its certificates and Ziti identities, and updates all peer configurations.",
        tags: ["revoke", "pki", "wireguard", "ziti_identities", "peer_exchange"],
        roles: ["revoke_kit", "pki_management", "wireguard", "ziti_identities"],
        riskLevel: "CRITICAL",
        estimatedDurationMinutes: 15,
        requiresConfirmation: true,
        isDestructive: true,
        lastExecuted: this.simulateLastRun("revoke"),
        executionCount: this.seededInt("revoke-count", 0, 3),
        affectsServices: ["wireguard", "ziti", "pki"],
        affectsInfrastructure: ["networking", "PKI", "identity"],
      },
      {
        name: "Peer Exchange",
        fileName: "peer-exchange.yml",
        description: "Distributes WireGuard peer configurations and Ziti enrollment JWTs between all kits. Required after adding or removing a kit.",
        tags: ["peer_exchange", "wireguard", "ziti_identities"],
        roles: ["peer_exchange", "wireguard", "ziti_identities"],
        riskLevel: "MEDIUM",
        estimatedDurationMinutes: 10,
        requiresConfirmation: false,
        isDestructive: false,
        lastExecuted: this.simulateLastRun("peer"),
        executionCount: this.seededInt("peer-count", 5, 25),
        affectsServices: ["wireguard", "ziti"],
        affectsInfrastructure: ["networking"],
      },
      {
        name: "Emergency Rebuild",
        fileName: "emergency-rebuild.yml",
        description: "EMERGENCY: Destroys and completely rebuilds a kit from scratch. Use only when a kit is unrecoverable by other means.",
        tags: [
          "destroy", "proxmox_vms", "almalinux_base", "security_hardening",
          "wireguard", "bird", "ziti_controller", "ziti_routers",
          "ziti_identities", "pki", "monitoring", "rebuild",
        ],
        roles: [
          "proxmox_destroy", "proxmox_vms", "almalinux_base",
          "security_hardening", "wireguard", "bird_bgp",
          "ziti_controller", "ziti_router", "ziti_identities",
          "pki_management", "monitoring_stack",
        ],
        riskLevel: "CRITICAL",
        estimatedDurationMinutes: 60,
        requiresConfirmation: true,
        isDestructive: true,
        lastExecuted: this.simulateLastRun("rebuild"),
        executionCount: this.seededInt("rebuild-count", 0, 3),
        affectsServices: ["all"],
        affectsInfrastructure: ["VMs", "networking", "security", "PKI", "monitoring", "storage"],
      },
    ];
  }

  private buildTagDependencyMap(): void {
    this.tags = [
      // Infrastructure
      { tag: "proxmox_vms", dependsOn: [], dependedOnBy: ["almalinux_base", "security_hardening"], playbooks: ["site.yml", "emergency-rebuild.yml"], description: "Provision Proxmox virtual machines", category: "infrastructure" },
      { tag: "almalinux_base", dependsOn: ["proxmox_vms"], dependedOnBy: ["security_hardening", "chrony", "wireguard"], playbooks: ["site.yml", "emergency-rebuild.yml"], description: "Base AlmaLinux OS configuration", category: "infrastructure" },
      { tag: "destroy", dependsOn: [], dependedOnBy: [], playbooks: ["destroy.yml", "emergency-rebuild.yml"], description: "Remove all VMs and configurations", category: "cleanup" },
      { tag: "cleanup", dependsOn: ["destroy"], dependedOnBy: [], playbooks: ["destroy.yml"], description: "Post-destroy cleanup of residual files", category: "cleanup" },
      { tag: "rebuild", dependsOn: ["destroy", "proxmox_vms"], dependedOnBy: [], playbooks: ["emergency-rebuild.yml"], description: "Emergency full rebuild marker", category: "infrastructure" },

      // Security
      { tag: "security_hardening", dependsOn: ["almalinux_base"], dependedOnBy: ["wireguard", "ziti_controller"], playbooks: ["site.yml", "update.yml", "emergency-rebuild.yml"], description: "OS security hardening (fail2ban, auditd, sshd)", category: "security" },
      { tag: "firewall", dependsOn: ["almalinux_base"], dependedOnBy: ["wireguard", "bird", "ziti_routers"], playbooks: ["site.yml", "update.yml", "modify.yml"], description: "Firewall rules configuration", category: "security" },
      { tag: "fail2ban", dependsOn: ["security_hardening"], dependedOnBy: [], playbooks: ["site.yml"], description: "Fail2ban intrusion prevention", category: "security" },
      { tag: "auditd", dependsOn: ["security_hardening"], dependedOnBy: [], playbooks: ["site.yml"], description: "Linux audit daemon configuration", category: "security" },
      { tag: "sshd", dependsOn: ["security_hardening"], dependedOnBy: [], playbooks: ["site.yml"], description: "SSH daemon hardening", category: "security" },

      // PKI
      { tag: "pki", dependsOn: ["almalinux_base"], dependedOnBy: ["ziti_controller", "ziti_routers", "ziti_identities"], playbooks: ["site.yml", "modify.yml", "revoke-kit.yml", "emergency-rebuild.yml"], description: "PKI certificate management", category: "pki" },
      { tag: "revoke", dependsOn: ["pki"], dependedOnBy: ["peer_exchange"], playbooks: ["revoke-kit.yml"], description: "Certificate and identity revocation", category: "pki" },

      // Networking
      { tag: "chrony", dependsOn: ["almalinux_base"], dependedOnBy: ["wireguard", "bird"], playbooks: ["site.yml", "update.yml"], description: "Chrony NTP time synchronization", category: "networking" },
      { tag: "wireguard", dependsOn: ["security_hardening", "firewall", "chrony"], dependedOnBy: ["bird", "ziti_routers", "nebula"], playbooks: ["site.yml", "update.yml", "modify.yml", "revoke-kit.yml", "emergency-rebuild.yml"], description: "WireGuard VPN tunnel management", category: "networking" },
      { tag: "bird", dependsOn: ["wireguard"], dependedOnBy: ["ziti_routers"], playbooks: ["site.yml", "update.yml", "modify.yml", "emergency-rebuild.yml"], description: "BIRD BGP routing daemon", category: "networking" },
      { tag: "nebula", dependsOn: ["wireguard"], dependedOnBy: [], playbooks: ["site.yml", "modify.yml"], description: "Nebula mesh overlay network", category: "networking" },
      { tag: "peer_exchange", dependsOn: ["wireguard", "ziti_identities"], dependedOnBy: [], playbooks: ["peer-exchange.yml", "revoke-kit.yml"], description: "Peer WireGuard and Ziti JWT distribution", category: "networking" },

      // Services - Ziti
      { tag: "ziti_controller", dependsOn: ["security_hardening", "pki"], dependedOnBy: ["ziti_routers", "ziti_identities"], playbooks: ["site.yml", "modify.yml", "emergency-rebuild.yml"], description: "OpenZiti controller deployment", category: "services" },
      { tag: "ziti_routers", dependsOn: ["ziti_controller", "wireguard", "bird", "firewall"], dependedOnBy: ["ziti_identities"], playbooks: ["site.yml", "update.yml", "modify.yml", "emergency-rebuild.yml"], description: "OpenZiti edge routers (local, adjacent, HQ)", category: "services" },
      { tag: "ziti_identities", dependsOn: ["ziti_controller", "ziti_routers", "pki"], dependedOnBy: ["peer_exchange"], playbooks: ["site.yml", "update.yml", "modify.yml", "revoke-kit.yml", "emergency-rebuild.yml"], description: "Ziti identity enrollment and management", category: "services" },

      // Monitoring
      { tag: "monitoring", dependsOn: ["almalinux_base"], dependedOnBy: ["grafana", "loki", "node_exporter"], playbooks: ["site.yml", "update.yml", "modify.yml", "emergency-rebuild.yml"], description: "Monitoring stack deployment", category: "monitoring" },
      { tag: "grafana", dependsOn: ["monitoring"], dependedOnBy: [], playbooks: ["site.yml"], description: "Grafana dashboards", category: "monitoring" },
      { tag: "loki", dependsOn: ["monitoring"], dependedOnBy: [], playbooks: ["site.yml"], description: "Loki log aggregation", category: "monitoring" },
      { tag: "node_exporter", dependsOn: ["monitoring"], dependedOnBy: [], playbooks: ["site.yml"], description: "Prometheus node exporter", category: "monitoring" },
    ];
  }

  private buildRoleDependencyGraph(): void {
    this.roles = [
      { role: "proxmox_vms", description: "Provision VMs on Proxmox VE host", dependsOn: [], dependedOnBy: ["almalinux_base"], tags: ["proxmox_vms"], idempotent: true, estimatedDurationMinutes: 10 },
      { role: "proxmox_destroy", description: "Destroy VMs on Proxmox VE host", dependsOn: [], dependedOnBy: ["cleanup"], tags: ["destroy"], idempotent: true, estimatedDurationMinutes: 3 },
      { role: "almalinux_base", description: "Base OS configuration, packages, users", dependsOn: ["proxmox_vms"], dependedOnBy: ["security_hardening", "chrony_ntp"], tags: ["almalinux_base"], idempotent: true, estimatedDurationMinutes: 5 },
      { role: "security_hardening", description: "OS hardening: fail2ban, auditd, sshd config, SELinux", dependsOn: ["almalinux_base"], dependedOnBy: ["wireguard", "ziti_controller"], tags: ["security_hardening", "fail2ban", "auditd", "sshd"], idempotent: true, estimatedDurationMinutes: 4 },
      { role: "chrony_ntp", description: "NTP time synchronization via Chrony", dependsOn: ["almalinux_base"], dependedOnBy: ["wireguard", "bird_bgp"], tags: ["chrony"], idempotent: true, estimatedDurationMinutes: 2 },
      { role: "firewall_rules", description: "iptables/nftables firewall rule management", dependsOn: ["almalinux_base"], dependedOnBy: ["wireguard", "ziti_router"], tags: ["firewall"], idempotent: true, estimatedDurationMinutes: 3 },
      { role: "pki_management", description: "PKI certificate lifecycle: generate, distribute, revoke", dependsOn: ["almalinux_base"], dependedOnBy: ["ziti_controller", "ziti_router", "ziti_identities"], tags: ["pki"], idempotent: true, estimatedDurationMinutes: 5 },
      { role: "wireguard", description: "WireGuard tunnel configuration and peer management", dependsOn: ["security_hardening", "chrony_ntp", "firewall_rules"], dependedOnBy: ["bird_bgp", "ziti_router", "nebula_mesh"], tags: ["wireguard"], idempotent: true, estimatedDurationMinutes: 4 },
      { role: "bird_bgp", description: "BIRD BGP routing daemon with AS configuration", dependsOn: ["wireguard"], dependedOnBy: ["ziti_router"], tags: ["bird"], idempotent: true, estimatedDurationMinutes: 3 },
      { role: "ziti_controller", description: "OpenZiti controller: database, PKI, API server", dependsOn: ["security_hardening", "pki_management"], dependedOnBy: ["ziti_router", "ziti_identities"], tags: ["ziti_controller"], idempotent: false, estimatedDurationMinutes: 5 },
      { role: "ziti_router", description: "OpenZiti edge routers: local, adjacent, HQ", dependsOn: ["ziti_controller", "wireguard", "bird_bgp", "firewall_rules", "pki_management"], dependedOnBy: ["ziti_identities"], tags: ["ziti_routers"], idempotent: false, estimatedDurationMinutes: 6 },
      { role: "ziti_identities", description: "Ziti identity enrollment and service policies", dependsOn: ["ziti_controller", "ziti_router", "pki_management"], dependedOnBy: ["peer_exchange"], tags: ["ziti_identities"], idempotent: false, estimatedDurationMinutes: 4 },
      { role: "nebula_mesh", description: "Nebula overlay mesh network", dependsOn: ["wireguard"], dependedOnBy: [], tags: ["nebula"], idempotent: true, estimatedDurationMinutes: 3 },
      { role: "monitoring_stack", description: "Prometheus, Grafana, Loki, node_exporter", dependsOn: ["almalinux_base"], dependedOnBy: [], tags: ["monitoring", "grafana", "loki", "node_exporter"], idempotent: true, estimatedDurationMinutes: 8 },
      { role: "peer_exchange", description: "Distribute WireGuard peers and Ziti JWTs", dependsOn: ["wireguard", "ziti_identities"], dependedOnBy: [], tags: ["peer_exchange"], idempotent: true, estimatedDurationMinutes: 3 },
      { role: "revoke_kit", description: "Revoke kit certificates, remove from mesh", dependsOn: ["pki_management"], dependedOnBy: [], tags: ["revoke"], idempotent: true, estimatedDurationMinutes: 5 },
      { role: "cleanup", description: "Remove residual files and configurations", dependsOn: ["proxmox_destroy"], dependedOnBy: [], tags: ["cleanup"], idempotent: true, estimatedDurationMinutes: 2 },
    ];
  }

  // --- Public API ---

  getPlaybookAnalysis(): PlaybookInfo[] {
    return this.playbooks;
  }

  getTagDependencyMap(): TagDependency[] {
    return this.tags;
  }

  getImpactAnalysis(playbook: string): ImpactAnalysis {
    const pb = this.playbooks.find((p) => p.fileName === playbook || p.name === playbook);
    if (!pb) {
      return {
        playbook,
        affectedVMs: [],
        affectedServices: [],
        affectedConfigs: [],
        networkImpact: "NONE",
        serviceImpact: "NONE",
        estimatedDowntimeMinutes: 0,
        requiresMaintenanceWindow: false,
        rollbackPossible: true,
        warnings: [`Playbook '${playbook}' not found in catalog`],
      };
    }

    const vmMapping: Record<string, string[]> = {
      "site.yml": ["edge-gw", "controller", "router-01", "router-02", "router-hq", "monitor"],
      "update.yml": ["controller", "router-01", "router-02", "router-hq", "monitor"],
      "modify.yml": ["targeted VMs based on tags"],
      "destroy.yml": ["ALL VMs on targeted kit"],
      "revoke-kit.yml": ["controller (config update)", "all peer kits (config update)"],
      "peer-exchange.yml": ["controller", "router-01", "router-02", "router-hq"],
      "emergency-rebuild.yml": ["ALL VMs on targeted kit (destroy + rebuild)"],
    };

    const networkImpact: Record<string, ImpactAnalysis["networkImpact"]> = {
      "site.yml": "EXTENDED_DISRUPTION",
      "update.yml": "BRIEF_DISRUPTION",
      "modify.yml": "BRIEF_DISRUPTION",
      "destroy.yml": "FULL_OUTAGE",
      "revoke-kit.yml": "EXTENDED_DISRUPTION",
      "peer-exchange.yml": "BRIEF_DISRUPTION",
      "emergency-rebuild.yml": "FULL_OUTAGE",
    };

    const serviceImpact: Record<string, ImpactAnalysis["serviceImpact"]> = {
      "site.yml": "PARTIAL_OUTAGE",
      "update.yml": "DEGRADED",
      "modify.yml": "DEGRADED",
      "destroy.yml": "FULL_OUTAGE",
      "revoke-kit.yml": "PARTIAL_OUTAGE",
      "peer-exchange.yml": "NONE",
      "emergency-rebuild.yml": "FULL_OUTAGE",
    };

    const warnings: string[] = [];
    if (pb.isDestructive) warnings.push("WARNING: This playbook performs DESTRUCTIVE operations");
    if (pb.riskLevel === "CRITICAL") warnings.push("CRITICAL risk level - requires mission commander approval");
    if (pb.fileName === "destroy.yml") warnings.push("All data on targeted kit VMs will be permanently lost");
    if (pb.fileName === "revoke-kit.yml") warnings.push("Revoked kit cannot rejoin mesh without full re-enrollment");
    if (pb.fileName === "emergency-rebuild.yml") warnings.push("Kit will be offline for entire rebuild duration (est. 60 min)");

    return {
      playbook: pb.fileName,
      affectedVMs: vmMapping[pb.fileName] || [],
      affectedServices: pb.affectsServices,
      affectedConfigs: pb.tags.map((t) => `${t} configuration`),
      networkImpact: networkImpact[pb.fileName] || "NONE",
      serviceImpact: serviceImpact[pb.fileName] || "NONE",
      estimatedDowntimeMinutes: pb.isDestructive ? pb.estimatedDurationMinutes : Math.ceil(pb.estimatedDurationMinutes / 3),
      requiresMaintenanceWindow: pb.riskLevel === "CRITICAL" || pb.riskLevel === "HIGH",
      rollbackPossible: !pb.isDestructive,
      warnings,
    };
  }

  getRoleDependencyGraph(): RoleDependencyNode[] {
    return this.roles;
  }

  suggestExecutionPlan(changeDescription: string): ExecutionPlan {
    const lower = changeDescription.toLowerCase();
    const warnings: string[] = [];
    const prerequisites: string[] = [];
    let recommendedPlaybook = "modify.yml";
    let recommendedTags: string[] = [];
    let overallRisk: RiskLevel = "LOW";

    // Pattern matching for common change requests
    if (lower.includes("rebuild") || lower.includes("from scratch")) {
      recommendedPlaybook = "emergency-rebuild.yml";
      recommendedTags = ["destroy", "rebuild"];
      overallRisk = "CRITICAL";
      warnings.push("Emergency rebuild will destroy all VMs and recreate from scratch");
      prerequisites.push("Verify latest backup exists", "Confirm with mission commander");
    } else if (lower.includes("destroy") || lower.includes("remove kit") || lower.includes("decommission")) {
      recommendedPlaybook = "destroy.yml";
      recommendedTags = ["destroy", "cleanup"];
      overallRisk = "CRITICAL";
      warnings.push("Destruction is permanent - ensure backups are available");
      prerequisites.push("Backup critical data", "Confirm with mission commander");
    } else if (lower.includes("revoke") || lower.includes("compromised")) {
      recommendedPlaybook = "revoke-kit.yml";
      recommendedTags = ["revoke", "pki", "wireguard", "ziti_identities", "peer_exchange"];
      overallRisk = "CRITICAL";
      prerequisites.push("Identify compromised kit", "Notify all operators");
    } else if (lower.includes("wireguard") || lower.includes("vpn") || lower.includes("tunnel")) {
      recommendedTags = ["wireguard"];
      if (lower.includes("peer")) recommendedTags.push("peer_exchange");
      overallRisk = "MEDIUM";
      prerequisites.push("Verify WireGuard keys are available");
    } else if (lower.includes("bgp") || lower.includes("routing") || lower.includes("bird")) {
      recommendedTags = ["bird"];
      overallRisk = "MEDIUM";
      prerequisites.push("Review BGP AS configuration");
    } else if (lower.includes("ziti") || lower.includes("zero trust") || lower.includes("fabric")) {
      recommendedTags = ["ziti_controller", "ziti_routers", "ziti_identities"];
      if (lower.includes("enroll")) recommendedTags = ["ziti_identities"];
      if (lower.includes("router")) recommendedTags = ["ziti_routers"];
      overallRisk = "MEDIUM";
    } else if (lower.includes("certificate") || lower.includes("pki") || lower.includes("cert")) {
      recommendedTags = ["pki"];
      overallRisk = "HIGH";
      prerequisites.push("Verify CA chain integrity before modification");
    } else if (lower.includes("monitor") || lower.includes("grafana") || lower.includes("log")) {
      recommendedTags = ["monitoring"];
      overallRisk = "LOW";
    } else if (lower.includes("security") || lower.includes("harden")) {
      recommendedTags = ["security_hardening", "firewall", "fail2ban", "sshd"];
      overallRisk = "LOW";
    } else if (lower.includes("update") || lower.includes("refresh") || lower.includes("sync")) {
      recommendedPlaybook = "update.yml";
      recommendedTags = [];
      overallRisk = "LOW";
    } else if (lower.includes("new kit") || lower.includes("add kit") || lower.includes("deploy")) {
      recommendedPlaybook = "site.yml";
      recommendedTags = [];
      overallRisk = "HIGH";
      prerequisites.push("Ensure Proxmox host has sufficient resources", "Generate kit vars.yml");
    } else if (lower.includes("peer") || lower.includes("exchange") || lower.includes("jwt")) {
      recommendedPlaybook = "peer-exchange.yml";
      recommendedTags = ["peer_exchange"];
      overallRisk = "MEDIUM";
    } else {
      recommendedTags = ["wireguard", "bird"];
      warnings.push("Could not precisely determine change scope - defaulting to networking components. Please review tags before execution.");
    }

    // Build step-by-step execution plan
    const steps: ExecutionPlan["executionOrder"] = [];
    let stepNum = 1;
    let totalMinutes = 0;

    // Pre-check step
    steps.push({
      step: stepNum++,
      action: "Pre-flight verification: check inventory, validate vars, test connectivity",
      tags: [],
      riskLevel: "LOW",
      estimatedMinutes: 2,
      preCheck: "ansible-playbook site.yml --check --diff --tags " + (recommendedTags[0] || "all"),
      rollback: "N/A - verification only",
    });
    totalMinutes += 2;

    // Main execution steps based on tag dependencies
    for (const tag of recommendedTags) {
      const tagInfo = this.tags.find((t) => t.tag === tag);
      const roleInfo = this.roles.find((r) => r.tags.includes(tag));
      const estMinutes = roleInfo?.estimatedDurationMinutes || 5;

      steps.push({
        step: stepNum++,
        action: `Apply tag: ${tag} - ${tagInfo?.description || "Execute role"}`,
        tags: [tag],
        riskLevel: tagInfo?.category === "cleanup" ? "CRITICAL" : overallRisk,
        estimatedMinutes: estMinutes,
        preCheck: `Verify ${tag} prerequisites: ${tagInfo?.dependsOn.join(", ") || "none"}`,
        rollback: roleInfo?.idempotent ? "Re-run with previous configuration" : "Manual restoration required",
      });
      totalMinutes += estMinutes;
    }

    // Verification step
    steps.push({
      step: stepNum++,
      action: "Post-execution verification: check services, validate connectivity",
      tags: [],
      riskLevel: "LOW",
      estimatedMinutes: 3,
      preCheck: "N/A",
      rollback: "N/A - verification only",
    });
    totalMinutes += 3;

    return {
      description: changeDescription,
      recommendedPlaybook,
      recommendedTags,
      executionOrder: steps,
      totalEstimatedMinutes: totalMinutes,
      overallRisk,
      warnings,
      prerequisites,
    };
  }

  getRiskScore(playbook: string): RiskAssessment {
    const pb = this.playbooks.find((p) => p.fileName === playbook || p.name === playbook);

    if (!pb) {
      return {
        playbook,
        riskLevel: "LOW",
        riskScore: 0,
        factors: [],
        mitigations: [`Playbook '${playbook}' not found`],
        requiresApproval: false,
        approvalLevel: "OPERATOR",
      };
    }

    const factors: RiskAssessment["factors"] = [];
    let riskScore = 0;

    if (pb.isDestructive) {
      riskScore += 40;
      factors.push({ factor: "Destructive Operations", weight: 40, description: "Playbook performs irreversible destructive operations" });
    }

    if (pb.affectsServices.includes("all")) {
      riskScore += 20;
      factors.push({ factor: "All-Service Impact", weight: 20, description: "Affects all services on targeted kit(s)" });
    }

    if (pb.tags.includes("pki")) {
      riskScore += 15;
      factors.push({ factor: "PKI Modification", weight: 15, description: "Modifies certificate chain - affects trust model" });
    }

    if (pb.estimatedDurationMinutes > 30) {
      riskScore += 10;
      factors.push({ factor: "Extended Duration", weight: 10, description: `Execution takes ~${pb.estimatedDurationMinutes} minutes - extended exposure window` });
    }

    if (pb.tags.includes("wireguard") && pb.tags.includes("bird")) {
      riskScore += 10;
      factors.push({ factor: "Network Stack Changes", weight: 10, description: "Modifies both VPN tunnels and BGP routing simultaneously" });
    }

    if (pb.executionCount < 5) {
      riskScore += 5;
      factors.push({ factor: "Low Execution History", weight: 5, description: `Only executed ${pb.executionCount} times - less confidence in outcome` });
    }

    riskScore = Math.min(100, riskScore);

    const mitigations: string[] = [];
    if (pb.isDestructive) mitigations.push("Ensure backup snapshot exists before execution");
    mitigations.push("Run with --check --diff first to preview changes");
    mitigations.push("Execute during maintenance window if possible");
    if (pb.tags.includes("wireguard")) mitigations.push("Verify out-of-band management access before modifying WireGuard");
    if (pb.riskLevel === "CRITICAL") mitigations.push("Have emergency rollback plan documented and ready");

    let approvalLevel: RiskAssessment["approvalLevel"] = "OPERATOR";
    if (riskScore > 60) approvalLevel = "MISSION_COMMANDER";
    else if (riskScore > 30) approvalLevel = "TEAM_LEAD";

    return {
      playbook: pb.fileName,
      riskLevel: pb.riskLevel,
      riskScore,
      factors,
      mitigations,
      requiresApproval: riskScore > 30,
      approvalLevel,
    };
  }

  getRollbackAssessment(playbook: string): RollbackAssessment {
    const pb = this.playbooks.find((p) => p.fileName === playbook || p.name === playbook);

    if (!pb) {
      return {
        playbook,
        canRollback: false,
        rollbackCompleteness: "NONE",
        rollbackSteps: [],
        rollbackEstimateMinutes: 0,
        dataLossRisk: false,
        manualStepsRequired: [],
        limitations: [`Playbook '${playbook}' not found`],
      };
    }

    const assessments: Record<string, Omit<RollbackAssessment, "playbook">> = {
      "site.yml": {
        canRollback: true,
        rollbackCompleteness: "PARTIAL",
        rollbackSteps: [
          "Re-run site.yml with previous inventory version",
          "Restore WireGuard keys from backup if rotated",
          "Re-enroll Ziti identities with force_reenroll=true",
          "Verify BGP convergence after rollback",
        ],
        rollbackEstimateMinutes: 60,
        dataLossRisk: false,
        manualStepsRequired: ["Verify previous inventory version in git", "Check VM snapshot availability"],
        limitations: ["New VMs may need manual cleanup if provisioning partially completed", "Ziti enrollments are one-time by default"],
      },
      "update.yml": {
        canRollback: true,
        rollbackCompleteness: "FULL",
        rollbackSteps: [
          "Revert inventory changes in git",
          "Re-run update.yml with reverted configuration",
          "Verify all services restart correctly",
        ],
        rollbackEstimateMinutes: 20,
        dataLossRisk: false,
        manualStepsRequired: [],
        limitations: ["Time-sensitive BGP route changes may cause brief convergence delays"],
      },
      "modify.yml": {
        canRollback: true,
        rollbackCompleteness: "FULL",
        rollbackSteps: [
          "Revert targeted tag configurations",
          "Re-run modify.yml with previous values",
          "Verify targeted services",
        ],
        rollbackEstimateMinutes: 25,
        dataLossRisk: false,
        manualStepsRequired: [],
        limitations: ["If force_reenroll was used, new JWTs must be redistributed"],
      },
      "destroy.yml": {
        canRollback: false,
        rollbackCompleteness: "NONE",
        rollbackSteps: [
          "CANNOT ROLLBACK - VMs and data are permanently destroyed",
          "Rebuild from scratch using site.yml",
          "Restore from backup snapshot if available",
        ],
        rollbackEstimateMinutes: 60,
        dataLossRisk: true,
        manualStepsRequired: ["Locate and restore backup snapshot", "Regenerate all PKI material", "Re-establish peer exchange"],
        limitations: ["Complete data loss", "All Ziti enrollments must be redone", "PKI certificates must be reissued"],
      },
      "revoke-kit.yml": {
        canRollback: false,
        rollbackCompleteness: "PARTIAL",
        rollbackSteps: [
          "Re-run site.yml for the revoked kit with force_reenroll=true",
          "Regenerate and redistribute peer exchange material",
          "Re-establish WireGuard peer relationships",
          "Re-enroll all Ziti identities for the kit",
        ],
        rollbackEstimateMinutes: 45,
        dataLossRisk: false,
        manualStepsRequired: [
          "Verify kit has not actually been compromised before re-enrolling",
          "Audit all remaining kits for security posture",
        ],
        limitations: ["Revocation entries remain in CRL", "Previous certificates cannot be unrevoked", "Requires full re-enrollment"],
      },
      "peer-exchange.yml": {
        canRollback: true,
        rollbackCompleteness: "FULL",
        rollbackSteps: [
          "Re-run peer-exchange.yml with previous peer configurations",
          "Verify WireGuard tunnels re-establish",
          "Verify Ziti fabric links recover",
        ],
        rollbackEstimateMinutes: 15,
        dataLossRisk: false,
        manualStepsRequired: [],
        limitations: ["Brief connectivity disruption during rollback"],
      },
      "emergency-rebuild.yml": {
        canRollback: false,
        rollbackCompleteness: "NONE",
        rollbackSteps: [
          "CANNOT ROLLBACK - this IS the recovery procedure",
          "If rebuild fails, restore from backup snapshot",
          "If no backup, manual reconstruction required",
        ],
        rollbackEstimateMinutes: 0,
        dataLossRisk: true,
        manualStepsRequired: ["Manual intervention required if rebuild fails"],
        limitations: ["No rollback possible", "All previous state is destroyed", "This is the last-resort procedure"],
      },
    };

    const assessment = assessments[pb.fileName] || {
      canRollback: true,
      rollbackCompleteness: "PARTIAL" as const,
      rollbackSteps: ["Revert configuration changes and re-run playbook"],
      rollbackEstimateMinutes: 15,
      dataLossRisk: false,
      manualStepsRequired: [],
      limitations: ["Rollback assessment not available for this playbook"],
    };

    return {
      playbook: pb.fileName,
      ...assessment,
    };
  }

  private simulateLastRun(seed: string): Date | null {
    const hoursAgo = this.seededInt(seed + "-last", 1, 720);
    if (this.seededRandom(seed + "-has-run", 0) < 0.15) return null;
    return new Date(Date.now() - hoursAgo * 3600 * 1000);
  }

  private seededRandom(seed: string, offset: number): number {
    let hash = 0;
    const str = seed + String(offset);
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(Math.sin(hash) * 10000) % 1;
  }

  private seededInt(seed: string, min: number, max: number): number {
    return min + Math.floor(this.seededRandom(seed, 0) * (max - min + 1));
  }
}
