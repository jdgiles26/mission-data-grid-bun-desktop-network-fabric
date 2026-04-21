// Mesh Topology Engine
// Generates real-time topology data for visualizing the AutoNet mesh

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export interface TopologyNode {
  id: string;
  label: string;
  type: "hq" | "kit" | "edge-gw" | "controller" | "router" | "nebula" | "monitor" | "proxmox";
  missionId: number;
  kitId: number;
  ip: string;
  status: "online" | "offline" | "degraded" | "unknown";
  latencyMs: number | null;
  x?: number;
  y?: number;
}

export interface TopologyLink {
  id: string;
  source: string;
  target: string;
  type: "wg" | "lan" | "bgp" | "ziti" | "nebula";
  status: "up" | "down" | "degraded";
  metric: number;
}

export interface MeshTopologySnapshot {
  generatedAt: Date;
  nodes: TopologyNode[];
  links: TopologyLink[];
  degradationStates: Record<string, string>;
}

export class MeshTopologyEngine {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async generateTopology(): Promise<MeshTopologySnapshot> {
    const nodes: TopologyNode[] = [];
    const links: TopologyLink[] = [];
    const degradationStates: Record<string, string> = {};

    // Add HQ node
    nodes.push({
      id: "hq",
      label: "HQ Backbone",
      type: "hq",
      missionId: 0,
      kitId: 0,
      ip: "10.255.0.1",
      status: "online",
      latencyMs: null,
      x: 400,
      y: 100,
    });

    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (!existsSync(hostVarsDir)) {
      return { generatedAt: new Date(), nodes, links, degradationStates };
    }

    const hosts = readdirSync(hostVarsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    const kitX = 200;
    const kitSpacing = 250;

    for (let i = 0; i < hosts.length; i++) {
      const host = hosts[i];
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
      const kitWgBase = String(vars["kit_wg_base"] || "10.255");
      const ipRouterBaseOffset = Number(vars["ip_router_base_offset"] || 21);

      const kitIdentifier = `m${String(mission).padStart(2, "0")}-k${String(kitId).padStart(2, "0")}`;
      const kitIP = `${kitLanBase}.${mission}.${kitId}`;
      const kitWG = `${kitWgBase}.${mission}.${kitId}`;

      // Probe edge gateway
      const edgeGwIp = `${kitIP}.1`;
      const edgeProbe = await this.probeHost(edgeGwIp);

      const kitNode: TopologyNode = {
        id: kitIdentifier,
        label: `${kitName.toUpperCase()} (${kitIdentifier})`,
        type: "kit",
        missionId: mission,
        kitId,
        ip: edgeGwIp,
        status: edgeProbe.reachable ? "online" : "offline",
        latencyMs: edgeProbe.latencyMs,
        x: kitX + i * kitSpacing,
        y: 300,
      };
      nodes.push(kitNode);

      // Link to HQ via WireGuard
      links.push({
        id: `${kitIdentifier}-wg-hq`,
        source: kitIdentifier,
        target: "hq",
        type: "wg",
        status: edgeProbe.reachable ? "up" : "down",
        metric: 10,
      });

      // Add internal kit nodes
      const internalNodes = [
        { id: `${kitIdentifier}-pve`, label: "Proxmox", type: "proxmox" as const, ip: `${kitIP}.10` },
        { id: `${kitIdentifier}-ctrl`, label: "Ziti Controller", type: "controller" as const, ip: `${kitIP}.20` },
        { id: `${kitIdentifier}-nebula`, label: "Nebula", type: "nebula" as const, ip: `${kitIP}.25` },
        { id: `${kitIdentifier}-mon`, label: "Monitor", type: "monitor" as const, ip: `${kitIP}.30` },
      ];

      const routers = vars["ziti_routers"] as Array<{ name: string; type: string; label: string }> || [];
      routers.forEach((r, idx) => {
        internalNodes.push({
          id: `${kitIdentifier}-router-${r.name}`,
          label: `Router ${r.label || r.name}`,
          type: "router" as const,
          ip: `${kitIP}.${ipRouterBaseOffset + idx}`,
        });
      });

      for (const intNode of internalNodes) {
        const probe = await this.probeHost(intNode.ip);
        nodes.push({
          id: intNode.id,
          label: intNode.label,
          type: intNode.type,
          missionId: mission,
          kitId,
          ip: intNode.ip,
          status: probe.reachable ? "online" : "offline",
          latencyMs: probe.latencyMs,
          x: kitNode.x + (Math.random() * 80 - 40),
          y: 400 + (Math.random() * 80 - 40),
        });

        links.push({
          id: `${kitIdentifier}-lan-${intNode.id}`,
          source: kitIdentifier,
          target: intNode.id,
          type: "lan",
          status: probe.reachable ? "up" : "down",
          metric: 1,
        });
      }

      // Determine degradation state
      degradationStates[kitIdentifier] = this.classifyDegradation(edgeProbe.reachable, internalNodes, nodes);
    }

    return { generatedAt: new Date(), nodes, links, degradationStates };
  }

  private async probeHost(ip: string): Promise<{ reachable: boolean; latencyMs: number | null }> {
    try {
      const proc = Bun.spawn(["ping", "-c", "1", "-W", "800", ip], { stdout: "pipe", stderr: "pipe" });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      const reachable = proc.exitCode === 0;
      const latencyMatch = stdout.match(/time[=<]([\d.]+)\s*ms/i);
      return { reachable, latencyMs: latencyMatch ? Number.parseFloat(latencyMatch[1]) : null };
    } catch {
      return { reachable: false, latencyMs: null };
    }
  }

  private classifyDegradation(edgeReachable: boolean, internalNodes: any[], allNodes: TopologyNode[]): string {
    if (!edgeReachable) return "FULL_ISOLATION";

    const internalReachable = internalNodes.filter((n) => {
      const node = allNodes.find((node) => node.id.endsWith(n.id.split("-").pop()!));
      return node?.status === "online";
    }).length;

    if (internalReachable === 0) return "PARTIAL_WAN";
    if (internalReachable < internalNodes.length) return "KIT_TO_KIT_LOSS";
    return "FULL";
  }
}
