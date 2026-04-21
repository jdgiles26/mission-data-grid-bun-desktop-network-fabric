// Emergency Procedures Engine
// One-click emergency island mode and recovery procedures

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export interface EmergencyProcedure {
  id: string;
  name: string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  steps: string[];
  ansibleTags?: string[];
  rollbackSteps?: string[];
  affectedKits: string[];
}

export interface EmergencyActionResult {
  procedureId: string;
  success: boolean;
  output: string;
  durationMs: number;
}

export class EmergencyProceduresEngine {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  getAvailableProcedures(): EmergencyProcedure[] {
    return [
      {
        id: "island-mode",
        name: "Activate Island Mode",
        description: "Sever all HQ-facing connections and activate local-only fabric. Use when HQ is compromised or must be isolated.",
        severity: "CRITICAL",
        steps: [
          "Stop hq-router on all kits",
          "Verify local-router and local-controller are operational",
          "Confirm local mission apps still reachable",
          "Enable fallback BGP routes if configured",
        ],
        ansibleTags: ["wireguard", "bird"],
        rollbackSteps: [
          "Restart hq-router",
          "Verify WireGuard tunnel to HQ re-establishes",
          "Confirm BGP peering with HQ AS",
        ],
        affectedKits: ["all"],
      },
      {
        id: "revoke-compromised-kit",
        name: "Revoke Compromised Kit",
        description: "Immediately revoke a kit from the mesh and rotate all shared keys.",
        severity: "CRITICAL",
        steps: [
          "Run revoke-kit.yml targeting the compromised kit",
          "Remove kit from all peer WireGuard configs",
          "Revoke Ziti identities enrolled by the kit",
          "Regenerate and redistribute peer JWTs",
          "Audit all kits for unexpected peer connections",
        ],
        ansibleTags: ["revoke"],
        rollbackSteps: [
          "Re-run site.yml with force_reenroll=true for affected kit",
          "Re-establish peer exchange with restored kit",
        ],
        affectedKits: ["targeted", "all-peers"],
      },
      {
        id: "transport-failover",
        name: "Force Transport Failover",
        description: "Switch primary WAN transport (e.g., Starlink -> LTE) when current transport is degraded.",
        severity: "HIGH",
        steps: [
          "Check current transport metrics",
          "Update WireGuard endpoint to backup transport IP",
          "Restart WireGuard interface",
          "Verify BIRD BGP convergence",
          "Monitor for 60 seconds",
        ],
        ansibleTags: ["wireguard", "bird"],
        rollbackSteps: [
          "Revert WireGuard endpoint to primary transport",
          "Restart WireGuard",
        ],
        affectedKits: ["targeted"],
      },
      {
        id: "controller-failover",
        name: "Controller Failover",
        description: "Promote a local controller to standalone mode when HQ controller is unreachable.",
        severity: "HIGH",
        steps: [
          "Verify local controller database integrity",
          "Switch router enrollment target to local controller",
          "Restart Ziti routers with new controller endpoint",
          "Verify local fabric operation",
        ],
        ansibleTags: ["ziti"],
        rollbackSteps: [
          "Revert router enrollment to HQ controller",
          "Restart routers",
        ],
        affectedKits: ["targeted"],
      },
      {
        id: "emergency-rebuild",
        name: "Emergency Rebuild",
        description: "Full rebuild of a kit from last known good snapshot. Destroys and recreates all VMs.",
        severity: "CRITICAL",
        steps: [
          "Confirm latest backup exists",
          "Run destroy.yml to clean slate",
          "Run site.yml with force_rebuild=true",
          "Verify all services start correctly",
          "Re-enroll all routers and identities",
        ],
        ansibleTags: ["destroy", "rebuild"],
        rollbackSteps: ["Restore from backup snapshot if available"],
        affectedKits: ["targeted"],
      },
    ];
  }

  async executeProcedure(procedureId: string, targetKit?: string): Promise<EmergencyActionResult> {
    const start = Date.now();
    const procedure = this.getAvailableProcedures().find((p) => p.id === procedureId);
    if (!procedure) {
      return { procedureId, success: false, output: "Procedure not found", durationMs: 0 };
    }

    const outputs: string[] = [];
    outputs.push(`=== EMERGENCY PROCEDURE: ${procedure.name} ===`);
    outputs.push(`Target: ${targetKit || "all kits"}`);
    outputs.push(`Started: ${new Date().toISOString()}`);
    outputs.push("");

    // Simulate/ansible-run each step
    for (const step of procedure.steps) {
      outputs.push(`[EXEC] ${step}`);
      // In a real deployment, this would trigger Ansible plays
      await this.delay(200);
    }

    outputs.push("");
    outputs.push(`=== COMPLETED in ${Date.now() - start}ms ===`);
    outputs.push("NOTE: This is a procedure template. In production, each step triggers real Ansible plays.");

    return {
      procedureId,
      success: true,
      output: outputs.join("\n"),
      durationMs: Date.now() - start,
    };
  }

  async generateEmergencyRunbook(targetKit?: string): Promise<string> {
    const lines: string[] = [
      "# AutoNet Emergency Runbook",
      `Generated: ${new Date().toISOString()}`,
      `Target Kit: ${targetKit || "All Kits"}`,
      "",
      "## Quick Status",
    ];

    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (existsSync(hostVarsDir)) {
      const hosts = this.listDirs(hostVarsDir);
      for (const host of hosts) {
        const varsPath = join(hostVarsDir, host, "vars.yml");
        if (!existsSync(varsPath)) continue;
        try {
          const vars = parse(readFileSync(varsPath, "utf8")) as Record<string, unknown>;
          const kitName = String(vars["kit_name"] || host);
          const mission = Number(vars["kit_mission"] || 1);
          const kitId = Number(vars["kit_id"] || 1);
          lines.push(`- ${kitName} (Mission ${mission}, Kit ${kitId})`);
        } catch { /* skip */ }
      }
    }

    lines.push("");
    lines.push("## Emergency Contacts & Procedures");
    lines.push("1. **Island Mode**: `./scripts/island-mode.sh` or run `modify.yml --tags wireguard,bird`");
    lines.push("2. **Revoke Kit**: `ansible-playbook revoke-kit.yml -e target_kit=<name>`");
    lines.push("3. **Emergency Rebuild**: `ansible-playbook emergency-rebuild.yml -e target_kit=<name>`");
    lines.push("4. **Peer Exchange**: `ansible-playbook peer-exchange.yml`");
    lines.push("");
    lines.push("## Verification Commands");
    lines.push("```bash");
    lines.push("# Check WireGuard tunnels");
    lines.push("wg show");
    lines.push("# Check BGP peers");
    lines.push("birdc show protocols");
    lines.push("# Check Ziti router status");
    lines.push("ziti-router enroll --help");
    lines.push("# Check all VM status");
    lines.push("qm list");
    lines.push("```");

    return lines.join("\n");
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private listDirs(dir: string): string[] {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return [];
    }
  }
}
