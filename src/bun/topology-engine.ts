import type { NetworkDevice, TopologyLink } from "../shared/types";

function isDeviceHealthy(device: NetworkDevice): boolean {
  return device.status === "HEALTHY" || device.status === "WARNING";
}

function inferMissionKey(ip: string): string {
  const parts = ip.split(".");
  if (parts.length < 3) {
    return "unknown";
  }
  return `${parts[1]}.${parts[2]}`;
}

function linkStatus(source: NetworkDevice, target: NetworkDevice): TopologyLink["status"] {
  if (source.status === "UNREACHABLE" || target.status === "UNREACHABLE") {
    return "DOWN";
  }
  if (!isDeviceHealthy(source) || !isDeviceHealthy(target)) {
    return "DEGRADED";
  }
  return "UP";
}

export class TopologyEngine {
  generateLinks(devices: NetworkDevice[]): TopologyLink[] {
    const links: TopologyLink[] = [];
    const seen = new Set<string>();

    const cores = devices.filter((device) => device.role === "CORE");
    const distributions = devices.filter((device) => device.role === "DISTRIBUTION" || device.role === "ACCESS");
    const edges = devices.filter((device) => device.role === "EDGE");
    const firewalls = devices.filter((device) => device.role === "FIREWALL");

    const addLink = (
      source: NetworkDevice,
      target: NetworkDevice,
      type: TopologyLink["type"],
      bandwidth: number,
      latency: number,
    ) => {
      const key = [source.id, target.id].sort().join("|");
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      links.push({
        source: source.id,
        target: target.id,
        type,
        status: linkStatus(source, target),
        bandwidth,
        latency,
      });
    };

    for (const core of cores) {
      for (const distribution of distributions) {
        if (inferMissionKey(core.ip) !== inferMissionKey(distribution.ip)) {
          continue;
        }
        addLink(core, distribution, "FIBER", 10_000, 4);
      }
    }

    for (const distribution of distributions) {
      for (const edge of edges) {
        if (inferMissionKey(distribution.ip) !== inferMissionKey(edge.ip)) {
          continue;
        }
        addLink(distribution, edge, "ETHERNET", 1_000, 7);
      }
    }

    for (const firewall of firewalls) {
      for (const core of cores) {
        if (inferMissionKey(firewall.ip) !== inferMissionKey(core.ip)) {
          continue;
        }
        addLink(core, firewall, "FIBER", 10_000, 3);
      }
    }

    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const source = edges[i];
        const target = edges[j];
        const sameMission = inferMissionKey(source.ip) === inferMissionKey(target.ip);
        addLink(source, target, "TUNNEL", sameMission ? 1_000 : 100, sameMission ? 10 : 45);
      }
    }

    return links;
  }
}
