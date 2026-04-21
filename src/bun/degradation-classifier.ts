// Degradation Classifier
// Automatically classifies each kit into one of AutoNet's 5 degradation states

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export type DegradationState = "FULL" | "PARTIAL_WAN" | "HQ_CONTROLLER_LOSS" | "KIT_TO_KIT_LOSS" | "FULL_ISOLATION";

export interface KitDegradationReport {
  kitId: string;
  kitName: string;
  missionId: number;
  state: DegradationState;
  previousState?: DegradationState;
  changedAt: Date;
  reasons: string[];
  probes: {
    edgeGwReachable: boolean;
    controllerReachable: boolean;
    localRouterReachable: boolean;
    adjacentRouterReachable: boolean;
    hqRouterReachable: boolean;
    monitorReachable: boolean;
  };
}

export class DegradationClassifier {
  private rootPath: string;
  private stateHistory = new Map<string, DegradationState>();

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async classifyAllKits(): Promise<KitDegradationReport[]> {
    const reports: KitDegradationReport[] = [];
    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (!existsSync(hostVarsDir)) return reports;

    const hosts = readdirSync(hostVarsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const host of hosts) {
      const report = await this.classifyKit(host);
      if (report) reports.push(report);
    }

    return reports;
  }

  async classifyKit(hostFolder: string): Promise<KitDegradationReport | null> {
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
    const ipRouterBaseOffset = Number(vars["ip_router_base_offset"] || 21);
    const kitIdentifier = `m${String(mission).padStart(2, "0")}-k${String(kitId).padStart(2, "0")}`;
    const baseIP = `${kitLanBase}.${mission}.${kitId}`;

    // Probe all critical nodes
    const probes = {
      edgeGwReachable: (await this.probe(`${baseIP}.1`)).reachable,
      controllerReachable: (await this.probe(`${baseIP}.20`)).reachable,
      localRouterReachable: (await this.probe(`${baseIP}.${ipRouterBaseOffset}`)).reachable,
      adjacentRouterReachable: (await this.probe(`${baseIP}.${ipRouterBaseOffset + 1}`)).reachable,
      hqRouterReachable: (await this.probe(`${baseIP}.${ipRouterBaseOffset + 2}`)).reachable,
      monitorReachable: (await this.probe(`${baseIP}.30`)).reachable,
    };

    const reasons: string[] = [];
    let state: DegradationState = "FULL";

    if (!probes.edgeGwReachable) {
      state = "FULL_ISOLATION";
      reasons.push("Edge gateway unreachable — no WAN or LAN connectivity");
    } else if (!probes.controllerReachable && !probes.hqRouterReachable) {
      state = "HQ_CONTROLLER_LOSS";
      reasons.push("Neither local controller nor HQ router reachable");
    } else if (!probes.localRouterReachable || !probes.adjacentRouterReachable) {
      state = "KIT_TO_KIT_LOSS";
      reasons.push("Local or adjacent router down — inter-kit fabric degraded");
    } else if (!probes.monitorReachable || !probes.hqRouterReachable) {
      state = "PARTIAL_WAN";
      reasons.push("HQ-facing components degraded but local fabric intact");
    }

    const previousState = this.stateHistory.get(kitIdentifier);
    this.stateHistory.set(kitIdentifier, state);

    return {
      kitId: kitIdentifier,
      kitName,
      missionId: mission,
      state,
      previousState,
      changedAt: new Date(),
      reasons,
      probes,
    };
  }

  private async probe(ip: string): Promise<{ reachable: boolean; latencyMs: number | null }> {
    try {
      const proc = Bun.spawn(["ping", "-c", "1", "-W", "600", ip], { stdout: "pipe", stderr: "pipe" });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      const reachable = proc.exitCode === 0;
      const latencyMatch = stdout.match(/time[=<]([\d.]+)\s*ms/i);
      return { reachable, latencyMs: latencyMatch ? Number.parseFloat(latencyMatch[1]) : null };
    } catch {
      return { reachable: false, latencyMs: null };
    }
  }
}
