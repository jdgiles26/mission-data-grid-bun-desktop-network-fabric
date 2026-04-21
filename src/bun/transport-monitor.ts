// Transport Monitor
// Monitors WAN transport link quality (Starlink, LTE, Dejero, RF)
// by probing the edge gateway and analyzing route metrics

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export interface TransportLink {
  kitId: string;
  kitName: string;
  transportType: "starlink" | "lte" | "dejero" | "rf" | "wired" | "unknown";
  endpointIp: string;
  status: "up" | "down" | "degraded";
  latencyMs: number | null;
  packetLoss: number;
  jitterMs: number | null;
  bandwidthEstimate: number | null; // Mbps
  lastChecked: Date;
}

export class TransportMonitor {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async monitorAllLinks(): Promise<TransportLink[]> {
    const links: TransportLink[] = [];
    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (!existsSync(hostVarsDir)) return links;

    const hosts = readdirSync(hostVarsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

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
      const edgeGwIp = `${kitLanBase}.${mission}.${kitId}.1`;

      // Detect transport type from host vars hints
      const transportType = this.inferTransportType(vars);

      const link = await this.probeLink(edgeGwIp, transportType, kitName, mission, kitId);
      links.push(link);
    }

    return links;
  }

  private inferTransportType(vars: Record<string, unknown>): TransportLink["transportType"] {
    const wgPublicIp = String(vars["wg_public_ip"] || "").toLowerCase();
    if (wgPublicIp.includes("starlink") || wgPublicIp.includes("sl")) return "starlink";
    if (wgPublicIp.includes("lte") || wgPublicIp.includes("cell")) return "lte";
    if (wgPublicIp.includes("dejero")) return "dejero";
    if (wgPublicIp.includes("rf") || wgPublicIp.includes("radio")) return "rf";
    // Check for build-phase IP patterns
    const buildIp = String(vars["proxmox_build_ip"] || "");
    if (buildIp.startsWith("192.168.") || buildIp.startsWith("10.")) return "wired";
    return "unknown";
  }

  private async probeLink(
    edgeGwIp: string,
    transportType: TransportLink["transportType"],
    kitName: string,
    missionId: number,
    kitId: number,
  ): Promise<TransportLink> {
    const kitIdentifier = `m${String(missionId).padStart(2, "0")}-k${String(kitId).padStart(2, "0")}`;

    try {
      // Send 5 pings for statistical analysis
      const proc = Bun.spawn(["ping", "-c", "5", "-i", "0.2", "-W", "1000", edgeGwIp], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      const reachable = proc.exitCode === 0;

      // Parse ping statistics
      const latencyMatch = stdout.match(/min\/avg\/max(?:\/mdev)? = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
      const lossMatch = stdout.match(/(\d+)% packet loss/);

      const avgLatency = latencyMatch ? Number.parseFloat(latencyMatch[2]) : null;
      const jitter = latencyMatch ? Number.parseFloat(latencyMatch[4]) : null;
      const packetLoss = lossMatch ? Number.parseInt(lossMatch[1], 10) : 100;

      // Estimate bandwidth based on latency stability (very rough heuristic)
      let bandwidthEstimate: number | null = null;
      if (avgLatency !== null && avgLatency < 50) bandwidthEstimate = 100;
      else if (avgLatency !== null && avgLatency < 100) bandwidthEstimate = 50;
      else if (avgLatency !== null && avgLatency < 200) bandwidthEstimate = 20;
      else if (avgLatency !== null) bandwidthEstimate = 5;

      let status: TransportLink["status"] = "down";
      if (reachable && packetLoss === 0 && (avgLatency || 0) < 100) status = "up";
      else if (reachable && packetLoss < 10) status = "degraded";

      return {
        kitId: kitIdentifier,
        kitName,
        transportType,
        endpointIp: edgeGwIp,
        status,
        latencyMs: avgLatency,
        packetLoss,
        jitterMs: jitter,
        bandwidthEstimate,
        lastChecked: new Date(),
      };
    } catch {
      return {
        kitId: kitIdentifier,
        kitName,
        transportType,
        endpointIp: edgeGwIp,
        status: "down",
        latencyMs: null,
        packetLoss: 100,
        jitterMs: null,
        bandwidthEstimate: null,
        lastChecked: new Date(),
      };
    }
  }
}
