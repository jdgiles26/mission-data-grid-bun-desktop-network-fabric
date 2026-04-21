// Kit API Aggregator
// Polls each kit's monitor VM REST API for aggregated health metrics

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export interface KitHealthRecord {
  kitId: string;
  kitName: string;
  missionId: number;
  monitorIp: string;
  timestamp: Date;
  reachable: boolean;
  apiResponse?: {
    health: string;
    version: string;
    uptime_seconds: number;
  };
  prometheusMetrics?: {
    cpu_percent: number;
    memory_percent: number;
    disk_percent: number;
    node_exporter_up: boolean;
  };
  error?: string;
}

export class KitApiAggregator {
  private rootPath: string;
  private readonly apiPort = 8080;
  private readonly prometheusPort = 9090;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async pollAllKits(): Promise<KitHealthRecord[]> {
    const results: KitHealthRecord[] = [];
    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (!existsSync(hostVarsDir)) return results;

    const hosts = this.listDirs(hostVarsDir);

    for (const host of hosts) {
      const varsPath = join(hostVarsDir, host, "vars.yml");
      if (!existsSync(varsPath)) continue;

      let vars: Record<string, unknown> = {};
      try {
        vars = parse(readFileSync(varsPath, "utf8")) as Record<string, unknown>;
      } catch { continue; }

      const mission = Number(vars["kit_mission"] || 1);
      const kitId = Number(vars["kit_id"] || 1);
      const kitName = String(vars["kit_name"] || host);
      const kitLanBase = String(vars["kit_lan_base"] || "10");
      const monitorIp = `${kitLanBase}.${mission}.${kitId}.30`;

      const record = await this.pollKit(monitorIp, kitName, mission, kitId);
      results.push(record);
    }

    return results;
  }

  async pollKit(monitorIp: string, kitName: string, missionId: number, kitId: number): Promise<KitHealthRecord> {
    const base: KitHealthRecord = {
      kitId: `m${String(missionId).padStart(2, "0")}-k${String(kitId).padStart(2, "0")}`,
      kitName,
      missionId,
      monitorIp,
      timestamp: new Date(),
      reachable: false,
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${monitorIp}:${this.apiPort}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        base.reachable = true;
        base.apiResponse = data;
      }
    } catch (error) {
      base.error = String(error);
    }

    // Try to get a quick Prometheus node_exporter metric via proxy if available
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const promResponse = await fetch(`http://${monitorIp}:${this.prometheusPort}/api/v1/query?query=up{job=\"node\"}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (promResponse.ok) {
        const promData = await promResponse.json();
        base.prometheusMetrics = {
          cpu_percent: 0,
          memory_percent: 0,
          disk_percent: 0,
          node_exporter_up: promData.data?.result?.some((r: any) => r.value[1] === "1") || false,
        };
      }
    } catch {
      // Prometheus may not be exposed without tunnel
    }

    return base;
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
