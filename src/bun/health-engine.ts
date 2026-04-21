import type { MeshState, NetworkDevice, SyncStatus } from "../shared/types";

export interface HealthCategory {
  score: number;
  label: string;
  detail: string;
  trend: "up" | "down" | "stable";
}

export interface HealthBreakdown {
  overall: number;
  grade: "A" | "B" | "C" | "D" | "F";
  categories: {
    deviceHealth: HealthCategory;
    syncReliability: HealthCategory;
    meshConnectivity: HealthCategory;
    securityPosture: HealthCategory;
    systemResources: HealthCategory;
  };
  lastCalculated: Date;
}

interface HistoryEntry {
  timestamp: number;
  overall: number;
}

export class HealthEngine {
  private history: HistoryEntry[] = [];
  private previousScores: Record<string, number> = {};

  calculate(
    devices: NetworkDevice[],
    syncStats: { pending: number; synced: number; failed: number },
    meshState: MeshState,
    systemMetrics?: { cpuUsage: number; memoryPercent: number; diskPercent: number },
  ): HealthBreakdown {
    const deviceHealth = this.scoreDeviceHealth(devices);
    const syncReliability = this.scoreSyncReliability(syncStats);
    const meshConnectivity = this.scoreMeshConnectivity(meshState, devices);
    const securityPosture = this.scoreSecurityPosture(devices);
    const systemResources = this.scoreSystemResources(systemMetrics);

    const weights = { device: 0.3, sync: 0.2, mesh: 0.25, security: 0.15, system: 0.1 };
    const overall = Math.round(
      deviceHealth.score * weights.device +
      syncReliability.score * weights.sync +
      meshConnectivity.score * weights.mesh +
      securityPosture.score * weights.security +
      systemResources.score * weights.system,
    );

    this.history.push({ timestamp: Date.now(), overall });
    if (this.history.length > 100) this.history.shift();

    const breakdown: HealthBreakdown = {
      overall,
      grade: this.toGrade(overall),
      categories: {
        deviceHealth: { ...deviceHealth, trend: this.getTrend("device", deviceHealth.score) },
        syncReliability: { ...syncReliability, trend: this.getTrend("sync", syncReliability.score) },
        meshConnectivity: { ...meshConnectivity, trend: this.getTrend("mesh", meshConnectivity.score) },
        securityPosture: { ...securityPosture, trend: this.getTrend("security", securityPosture.score) },
        systemResources: { ...systemResources, trend: this.getTrend("system", systemResources.score) },
      },
      lastCalculated: new Date(),
    };

    this.previousScores.device = deviceHealth.score;
    this.previousScores.sync = syncReliability.score;
    this.previousScores.mesh = meshConnectivity.score;
    this.previousScores.security = securityPosture.score;
    this.previousScores.system = systemResources.score;

    return breakdown;
  }

  getHistory(): HistoryEntry[] {
    return [...this.history];
  }

  private scoreDeviceHealth(devices: NetworkDevice[]): Omit<HealthCategory, "trend"> {
    if (devices.length === 0) {
      return { score: 100, label: "Device Health", detail: "No devices monitored" };
    }

    const healthy = devices.filter((d) => d.status === "HEALTHY").length;
    const warning = devices.filter((d) => d.status === "WARNING").length;
    const critical = devices.filter((d) => d.status === "CRITICAL").length;
    const unreachable = devices.filter((d) => d.status === "UNREACHABLE").length;

    const score = Math.round(
      ((healthy * 100 + warning * 60 + critical * 20 + unreachable * 0) / devices.length),
    );

    const parts: string[] = [];
    if (healthy > 0) parts.push(`${healthy} healthy`);
    if (warning > 0) parts.push(`${warning} warning`);
    if (critical > 0) parts.push(`${critical} critical`);
    if (unreachable > 0) parts.push(`${unreachable} unreachable`);

    return { score, label: "Device Health", detail: parts.join(", ") || "All clear" };
  }

  private scoreSyncReliability(stats: { pending: number; synced: number; failed: number }): Omit<HealthCategory, "trend"> {
    const total = stats.pending + stats.synced + stats.failed;
    if (total === 0) {
      return { score: 100, label: "Sync Reliability", detail: "No records to sync" };
    }

    const successRate = stats.synced / total;
    const failRate = stats.failed / total;
    const score = Math.round(Math.max(0, (successRate * 100) - (failRate * 50)));

    return {
      score,
      label: "Sync Reliability",
      detail: `${stats.synced} synced, ${stats.pending} pending, ${stats.failed} failed`,
    };
  }

  private scoreMeshConnectivity(state: MeshState, devices: NetworkDevice[]): Omit<HealthCategory, "trend"> {
    const stateScores: Record<MeshState, number> = {
      FULL: 100,
      PARTIAL_WAN: 70,
      KIT_TO_KIT_LOSS: 50,
      HQ_CONTROLLER_LOSS: 30,
      FULL_ISOLATION: 0,
    };

    const stateLabels: Record<MeshState, string> = {
      FULL: "Full mesh connectivity",
      PARTIAL_WAN: "Partial WAN degradation",
      KIT_TO_KIT_LOSS: "Kit-to-kit links down",
      HQ_CONTROLLER_LOSS: "HQ controller unreachable",
      FULL_ISOLATION: "Complete mesh isolation",
    };

    const edgeDevices = devices.filter((d) => d.role === "EDGE");
    const reachableEdges = edgeDevices.filter((d) => d.status !== "UNREACHABLE");
    const edgeDetail = edgeDevices.length > 0
      ? ` (${reachableEdges.length}/${edgeDevices.length} edge nodes)`
      : "";

    return {
      score: stateScores[state] ?? 0,
      label: "Mesh Connectivity",
      detail: stateLabels[state] + edgeDetail,
    };
  }

  private scoreSecurityPosture(devices: NetworkDevice[]): Omit<HealthCategory, "trend"> {
    if (devices.length === 0) {
      return { score: 85, label: "Security Posture", detail: "Baseline - no devices scanned" };
    }

    let score = 85;
    const issues: string[] = [];

    const unreachable = devices.filter((d) => d.status === "UNREACHABLE");
    if (unreachable.length > 0) {
      score -= unreachable.length * 5;
      issues.push(`${unreachable.length} unmonitored devices`);
    }

    const highCpu = devices.filter((d) => d.metrics.cpu > 90);
    if (highCpu.length > 0) {
      score -= highCpu.length * 3;
      issues.push(`${highCpu.length} devices with high CPU`);
    }

    const firewalls = devices.filter((d) => d.role === "FIREWALL");
    if (firewalls.length === 0 && devices.length > 0) {
      score -= 10;
      issues.push("No firewall devices detected");
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      label: "Security Posture",
      detail: issues.length > 0 ? issues.join("; ") : "No issues detected",
    };
  }

  private scoreSystemResources(metrics?: { cpuUsage: number; memoryPercent: number; diskPercent: number }): Omit<HealthCategory, "trend"> {
    if (!metrics) {
      return { score: 90, label: "System Resources", detail: "Metrics collection pending" };
    }

    const cpuScore = Math.max(0, 100 - metrics.cpuUsage);
    const memScore = Math.max(0, 100 - metrics.memoryPercent);
    const diskScore = Math.max(0, 100 - metrics.diskPercent);
    const score = Math.round((cpuScore * 0.4 + memScore * 0.35 + diskScore * 0.25));

    const parts: string[] = [];
    if (metrics.cpuUsage > 80) parts.push(`CPU ${Math.round(metrics.cpuUsage)}%`);
    if (metrics.memoryPercent > 80) parts.push(`RAM ${Math.round(metrics.memoryPercent)}%`);
    if (metrics.diskPercent > 85) parts.push(`Disk ${Math.round(metrics.diskPercent)}%`);

    return {
      score,
      label: "System Resources",
      detail: parts.length > 0 ? `Pressure: ${parts.join(", ")}` : `CPU ${Math.round(metrics.cpuUsage)}% | RAM ${Math.round(metrics.memoryPercent)}% | Disk ${Math.round(metrics.diskPercent)}%`,
    };
  }

  private getTrend(key: string, current: number): "up" | "down" | "stable" {
    const prev = this.previousScores[key];
    if (prev === undefined) return "stable";
    if (current > prev + 2) return "up";
    if (current < prev - 2) return "down";
    return "stable";
  }

  private toGrade(score: number): "A" | "B" | "C" | "D" | "F" {
    if (score >= 90) return "A";
    if (score >= 75) return "B";
    if (score >= 60) return "C";
    if (score >= 40) return "D";
    return "F";
  }
}
