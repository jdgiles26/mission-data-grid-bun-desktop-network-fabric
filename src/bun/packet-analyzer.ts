// Packet Analyzer - Advanced traffic analysis and insights

import type { PacketFlowRecord, ProtocolStatistics } from "./packet-database";

export interface TrafficPattern {
  type: "bursty" | "steady" | "spikey" | "low_and_slow";
  confidence: number;
  description: string;
}

export interface EndpointProfile {
  ip: string;
  isLocal: boolean;
  asn?: string;
  country?: string;
  reputation: "trusted" | "neutral" | "suspicious" | "malicious";
  firstSeen: Date;
  lastSeen: Date;
  totalFlows: number;
  totalBytes: number;
  commonPorts: number[];
  protocols: string[];
}

export interface SecurityInsight {
  severity: "INFO" | "WARNING" | "CRITICAL";
  category: "scan" | "exfiltration" | "c2" | "anomaly" | "policy_violation";
  title: string;
  description: string;
  affectedFlows: string[];
  recommendedAction: string;
}

export interface PerformanceInsight {
  metric: "latency" | "throughput" | "retransmits" | "jitter";
  flowId: string;
  value: number;
  threshold: number;
  impact: "low" | "medium" | "high";
  suggestion: string;
}

export class PacketAnalyzer {
  private flowHistory: Map<string, number[]> = new Map();
  private endpointDatabase: Map<string, EndpointProfile> = new Map();

  analyzeTrafficPattern(flowId: string, byteCounts: number[]): TrafficPattern {
    if (byteCounts.length < 3) {
      return {
        type: "steady",
        confidence: 0.5,
        description: "Insufficient data for pattern analysis",
      };
    }

    const mean = byteCounts.reduce((a, b) => a + b, 0) / byteCounts.length;
    const variance = byteCounts.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / byteCounts.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;

    // Detect spikes
    const max = Math.max(...byteCounts);
    const spikeRatio = max / (mean || 1);

    // Detect burstiness (using coefficient of variation)
    if (cv > 2 && spikeRatio > 5) {
      return {
        type: "bursty",
        confidence: Math.min(0.95, cv / 3),
        description: "Highly variable traffic with sharp peaks",
      };
    }

    if (spikeRatio > 10) {
      return {
        type: "spikey",
        confidence: 0.85,
        description: "Occasional large traffic spikes",
      };
    }

    if (mean < 1000 && cv < 0.5) {
      return {
        type: "low_and_slow",
        confidence: 0.8,
        description: "Consistent low-bandwidth traffic",
      };
    }

    return {
      type: "steady",
      confidence: Math.max(0.5, 1 - cv),
      description: "Regular, predictable traffic pattern",
    };
  }

  analyzeEndpoint(ip: string, flows: PacketFlowRecord[]): EndpointProfile {
    const existing = this.endpointDatabase.get(ip);
    
    const isLocal = ip.startsWith("10.") || 
                    ip.startsWith("192.168.") || 
                    ip.startsWith("172.") ||
                    ip === "127.0.0.1" ||
                    ip === "::1";

    const totalBytes = flows.reduce((sum, f) => sum + f.byteCount, 0);
    const ports = [...new Set(flows.map((f) => f.destinationPort))].sort((a, b) => a - b);
    const protocols = [...new Set(flows.map((f) => f.l7Protocol).filter(Boolean))];

    // Simple reputation scoring
    let reputation: EndpointProfile["reputation"] = "neutral";
    const suspiciousPorts = [4444, 5555, 6666, 31337];
    const hasSuspiciousPorts = flows.some((f) => 
      suspiciousPorts.includes(f.destinationPort) || 
      suspiciousPorts.includes(f.sourcePort)
    );

    if (hasSuspiciousPorts) {
      reputation = "suspicious";
    }

    if (flows.length > 100 && totalBytes < 10000) {
      // Many flows, low data - potential scan
      reputation = "suspicious";
    }

    const profile: EndpointProfile = {
      ip,
      isLocal,
      reputation,
      firstSeen: existing?.firstSeen || flows[0]?.firstSeenAt || new Date(),
      lastSeen: flows[flows.length - 1]?.lastSeenAt || new Date(),
      totalFlows: flows.length,
      totalBytes,
      commonPorts: ports.slice(0, 10),
      protocols: protocols as string[],
    };

    this.endpointDatabase.set(ip, profile);
    return profile;
  }

  detectSecurityInsights(flows: PacketFlowRecord[]): SecurityInsight[] {
    const insights: SecurityInsight[] = [];

    // Port scan detection
    const endpointFlows = new Map<string, PacketFlowRecord[]>();
    for (const flow of flows) {
      const key = flow.sourceIP;
      if (!endpointFlows.has(key)) {
        endpointFlows.set(key, []);
      }
      endpointFlows.get(key)!.push(flow);
    }

    for (const [ip, flows] of endpointFlows) {
      const uniqueDestinations = new Set(flows.map((f) => `${f.destinationIP}:${f.destinationPort}`));
      
      if (uniqueDestinations.size > 50 && endpointFlows.length > 50) {
        insights.push({
          severity: "WARNING",
          category: "scan",
          title: "Potential Port Scan Detected",
          description: `Host ${ip} contacted ${uniqueDestinations.size} unique destinations`,
          affectedFlows: flows.map((f) => f.id),
          recommendedAction: "Review host for malware or unauthorized scanning activity",
        });
      }
    }

    // High retransmit detection
    const highRetransmitFlows = flows.filter((f) => 
      f.retransmitCount > 10 && f.retransmitCount / f.packetCount > 0.1
    );

    if (highRetransmitFlows.length > 0) {
      insights.push({
        severity: "WARNING",
        category: "anomaly",
        title: "High Retransmission Rate",
        description: `${highRetransmitFlows.length} flows show excessive retransmissions`,
        affectedFlows: highRetransmitFlows.map((f) => f.id),
        recommendedAction: "Check network path for congestion or packet loss",
      });
    }

    // TLS version check
    const weakTLSFlows = flows.filter((f) => 
      f.hasTLS && f.tlsVersion && 
      (f.tlsVersion.includes("1.0") || f.tlsVersion.includes("1.1"))
    );

    if (weakTLSFlows.length > 0) {
      insights.push({
        severity: "WARNING",
        category: "policy_violation",
        title: "Weak TLS Version Detected",
        description: `${weakTLSFlows.length} flows using TLS 1.0 or 1.1`,
        affectedFlows: weakTLSFlows.map((f) => f.id),
        recommendedAction: "Upgrade to TLS 1.2 or higher",
      });
    }

    return insights;
  }

  analyzePerformance(flows: PacketFlowRecord[]): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    for (const flow of flows) {
      // Check for high retransmits
      if (flow.retransmitCount > 0 && flow.packetCount > 0) {
        const retransmitRate = flow.retransmitCount / flow.packetCount;
        if (retransmitRate > 0.05) {
          insights.push({
            metric: "retransmits",
            flowId: flow.id,
            value: retransmitRate * 100,
            threshold: 5,
            impact: retransmitRate > 0.1 ? "high" : "medium",
            suggestion: "Investigate network path quality",
          });
        }
      }

      // Check for low throughput on long flows
      if (flow.durationMs > 10000) {
        const throughputBps = (flow.byteCount * 8) / (flow.durationMs / 1000);
        if (throughputBps < 1000) {
          insights.push({
            metric: "throughput",
            flowId: flow.id,
            value: throughputBps,
            threshold: 1000,
            impact: "low",
            suggestion: "Flow has unusually low throughput",
          });
        }
      }
    }

    return insights;
  }

  generateProtocolStats(flows: PacketFlowRecord[]): {
    totalFlows: number;
    totalPackets: number;
    totalBytes: number;
    protocolBreakdown: Record<string, { flows: number; packets: number; bytes: number }>;
    topTalkers: Array<{ ip: string; flows: number; bytes: number }>;
    timeDistribution: Array<{ hour: number; flows: number; bytes: number }>;
  } {
    const protocolBreakdown: Record<string, { flows: number; packets: number; bytes: number }> = {};
    const talkers = new Map<string, { flows: number; bytes: number }>();
    const hourlyStats = new Map<number, { flows: number; bytes: number }>();

    let totalPackets = 0;
    let totalBytes = 0;

    for (const flow of flows) {
      totalPackets += flow.packetCount;
      totalBytes += flow.byteCount;

      // Protocol breakdown
      const proto = flow.l7Protocol || flow.l4Protocol || "UNKNOWN";
      if (!protocolBreakdown[proto]) {
        protocolBreakdown[proto] = { flows: 0, packets: 0, bytes: 0 };
      }
      protocolBreakdown[proto].flows++;
      protocolBreakdown[proto].packets += flow.packetCount;
      protocolBreakdown[proto].bytes += flow.byteCount;

      // Top talkers
      for (const ip of [flow.sourceIP, flow.destinationIP]) {
        const existing = talkers.get(ip) || { flows: 0, bytes: 0 };
        existing.flows++;
        existing.bytes += flow.byteCount;
        talkers.set(ip, existing);
      }

      // Hourly distribution
      const hour = new Date(flow.firstSeenAt).getHours();
      const hourStats = hourlyStats.get(hour) || { flows: 0, bytes: 0 };
      hourStats.flows++;
      hourStats.bytes += flow.byteCount;
      hourlyStats.set(hour, hourStats);
    }

    const topTalkers = Array.from(talkers.entries())
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .slice(0, 10)
      .map(([ip, stats]) => ({ ip, ...stats }));

    const timeDistribution = Array.from(hourlyStats.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([hour, stats]) => ({ hour, ...stats }));

    return {
      totalFlows: flows.length,
      totalPackets,
      totalBytes,
      protocolBreakdown,
      topTalkers,
      timeDistribution,
    };
  }

  clearHistory(): void {
    this.flowHistory.clear();
    this.endpointDatabase.clear();
  }
}

export function createPacketAnalyzer(): PacketAnalyzer {
  return new PacketAnalyzer();
}
