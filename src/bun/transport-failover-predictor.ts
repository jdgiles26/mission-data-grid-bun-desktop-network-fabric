// Transport Failover Predictor
// Predicts WAN transport failures and manages failover chain analysis
// based on signal quality trends, latency patterns, and packet loss history

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export type TransportType = "dejero" | "starlink" | "lte_5g" | "rf_pacstar" | "wired";

export interface SignalSample {
  timestamp: Date;
  signalStrengthDbm: number;
  latencyMs: number;
  packetLossPercent: number;
  jitterMs: number;
  bandwidthMbps: number;
}

export interface TransportStatus {
  kitId: string;
  kitName: string;
  transportType: TransportType;
  isPrimary: boolean;
  priority: number; // 1 = primary, 2 = secondary, 3 = tertiary
  currentStatus: "active" | "standby" | "degraded" | "failed";
  signalHistory: SignalSample[];
  currentSignal: SignalSample | null;
  trendSlope: number; // negative = degrading
  estimatedTimeToFailoverMinutes: number | null;
  recoveryTimeEstimateMinutes: number | null;
}

export interface FailoverChain {
  kitId: string;
  kitName: string;
  chain: TransportStatus[];
  activeTransportIndex: number;
  diversityScore: number; // 0-100, higher = more resilient
  lastFailoverAt: Date | null;
  failoverCount24h: number;
}

export interface TransportPrediction {
  kitId: string;
  kitName: string;
  transportType: TransportType;
  predictedFailureTime: Date | null;
  failureProbability: number; // 0-100
  confidenceScore: number; // 0-1
  trendDirection: "improving" | "stable" | "degrading" | "critical";
  contributingFactors: string[];
  recommendedAction: string;
}

export interface TransportDiversityReport {
  kitId: string;
  kitName: string;
  totalTransports: number;
  activeTransports: number;
  independentPaths: number;
  diversityScore: number; // 0-100
  vulnerabilities: string[];
}

export interface SignalTrendReport {
  kitId: string;
  transportType: TransportType;
  sampleCount: number;
  slope: number;
  rSquared: number;
  trendDirection: "improving" | "stable" | "degrading" | "critical";
  projectedSignalIn1h: number;
  projectedSignalIn6h: number;
}

export class TransportFailoverPredictor {
  private rootPath: string;
  private transportHistory = new Map<string, TransportStatus[]>();
  private failoverLog = new Map<string, Date[]>();

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.initializeTransportData();
  }

  private loadKits(): Array<{ kitId: string; kitName: string; missionId: number; numericKitId: number; vars: Record<string, unknown> }> {
    const kits: Array<{ kitId: string; kitName: string; missionId: number; numericKitId: number; vars: Record<string, unknown> }> = [];
    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (!existsSync(hostVarsDir)) return kits;

    const hosts = readdirSync(hostVarsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const host of hosts) {
      const varsPath = join(hostVarsDir, host, "vars.yml");
      if (!existsSync(varsPath)) continue;

      try {
        const vars = parse(readFileSync(varsPath, "utf8")) as Record<string, unknown>;
        const mission = Number(vars["kit_mission"] || 1);
        const kitId = Number(vars["kit_id"] || 1);
        const kitName = String(vars["kit_name"] || host);
        const kitIdentifier = `m${String(mission).padStart(2, "0")}-k${String(kitId).padStart(2, "0")}`;

        kits.push({ kitId: kitIdentifier, kitName, missionId: mission, numericKitId: kitId, vars });
      } catch { /* skip unreadable */ }
    }

    return kits;
  }

  private initializeTransportData(): void {
    const kits = this.loadKits();

    for (const kit of kits) {
      const transports = this.generateTransportChain(kit.kitId, kit.kitName, kit.vars);
      this.transportHistory.set(kit.kitId, transports);
      this.failoverLog.set(kit.kitId, []);
    }
  }

  private generateTransportChain(kitId: string, kitName: string, vars: Record<string, unknown>): TransportStatus[] {
    const transportTypes: TransportType[] = ["dejero", "starlink", "lte_5g", "rf_pacstar", "wired"];
    const wgPublicIp = String(vars["wg_public_ip"] || "").toLowerCase();

    // Determine primary transport from host vars
    let primaryType: TransportType = "starlink";
    if (wgPublicIp.includes("dejero")) primaryType = "dejero";
    else if (wgPublicIp.includes("lte") || wgPublicIp.includes("cell")) primaryType = "lte_5g";
    else if (wgPublicIp.includes("rf") || wgPublicIp.includes("radio") || wgPublicIp.includes("pacstar")) primaryType = "rf_pacstar";
    else if (wgPublicIp.includes("wired") || wgPublicIp.startsWith("192.168.")) primaryType = "wired";

    // Build ordered chain with primary first
    const ordered = [primaryType, ...transportTypes.filter((t) => t !== primaryType)];
    // Simulate that kits typically have 2-4 transports available
    const availableCount = 2 + Math.floor(this.seededRandom(kitId, 0) * 3);
    const available = ordered.slice(0, availableCount);

    return available.map((type, idx) => {
      const history = this.generateSignalHistory(kitId, type, 24);
      const currentSignal = history.length > 0 ? history[history.length - 1]! : null;
      const slope = this.linearRegressionSlope(history.map((s) => s.signalStrengthDbm));
      const degrading = slope < -0.5;

      return {
        kitId,
        kitName,
        transportType: type,
        isPrimary: idx === 0,
        priority: idx + 1,
        currentStatus: idx === 0
          ? (degrading ? "degraded" : "active")
          : (idx === 1 && degrading ? "active" : "standby"),
        signalHistory: history,
        currentSignal,
        trendSlope: slope,
        estimatedTimeToFailoverMinutes: degrading ? Math.max(5, Math.floor(120 + slope * 60)) : null,
        recoveryTimeEstimateMinutes: this.estimateRecoveryTime(type),
      };
    });
  }

  private generateSignalHistory(kitId: string, transportType: TransportType, hours: number): SignalSample[] {
    const samples: SignalSample[] = [];
    const baseSignal = this.getBaseSignal(transportType);
    const now = Date.now();

    for (let i = 0; i < hours * 4; i++) { // sample every 15 min
      const timestamp = new Date(now - (hours * 4 - i) * 15 * 60 * 1000);
      const noise = (this.seededRandom(kitId + transportType, i) - 0.5) * 10;
      const drift = transportType === "starlink" ? Math.sin(i / 8) * 3 : 0; // orbital variation for Starlink
      const degradation = this.seededRandom(kitId, i * 7) > 0.92 ? -15 : 0; // occasional drops

      const signal = baseSignal + noise + drift + degradation;
      const latency = this.getBaseLatency(transportType) + Math.abs(noise) * 2 + (degradation < 0 ? 50 : 0);
      const packetLoss = Math.max(0, (degradation < 0 ? 5 : 0) + (this.seededRandom(kitId, i * 3) > 0.95 ? 2 : 0));

      samples.push({
        timestamp,
        signalStrengthDbm: Math.round(signal * 10) / 10,
        latencyMs: Math.round(latency * 10) / 10,
        packetLossPercent: Math.round(packetLoss * 10) / 10,
        jitterMs: Math.round(Math.abs(noise) * 3 * 10) / 10,
        bandwidthMbps: Math.max(1, Math.round((baseSignal + signal) / 2 + 30)),
      });
    }

    return samples;
  }

  private getBaseSignal(type: TransportType): number {
    const base: Record<TransportType, number> = {
      dejero: -55,
      starlink: -45,
      lte_5g: -65,
      rf_pacstar: -60,
      wired: -20,
    };
    return base[type];
  }

  private getBaseLatency(type: TransportType): number {
    const base: Record<TransportType, number> = {
      dejero: 80,
      starlink: 40,
      lte_5g: 35,
      rf_pacstar: 15,
      wired: 5,
    };
    return base[type];
  }

  private estimateRecoveryTime(type: TransportType): number {
    const recovery: Record<TransportType, number> = {
      dejero: 45,
      starlink: 30,
      lte_5g: 15,
      rf_pacstar: 60,
      wired: 5,
    };
    return recovery[type];
  }

  private linearRegressionSlope(values: number[]): number {
    if (values.length < 2) return 0;
    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i]!;
      sumXY += i * values[i]!;
      sumXX += i * i;
    }

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return 0;
    return (n * sumXY - sumX * sumY) / denominator;
  }

  private linearRegressionRSquared(values: number[]): number {
    if (values.length < 2) return 0;
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const slope = this.linearRegressionSlope(values);

    let intercept = 0;
    let sumX = 0;
    for (let i = 0; i < n; i++) sumX += i;
    intercept = (mean * n - slope * sumX) / n;

    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < n; i++) {
      const predicted = intercept + slope * i;
      ssRes += Math.pow(values[i]! - predicted, 2);
      ssTot += Math.pow(values[i]! - mean, 2);
    }

    if (ssTot === 0) return 1;
    return Math.max(0, 1 - ssRes / ssTot);
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

  // --- Public API ---

  getTransportPredictions(): TransportPrediction[] {
    const predictions: TransportPrediction[] = [];

    for (const [kitId, transports] of this.transportHistory) {
      for (const transport of transports) {
        const signalValues = transport.signalHistory.map((s) => s.signalStrengthDbm);
        const slope = this.linearRegressionSlope(signalValues);
        const latencyValues = transport.signalHistory.map((s) => s.latencyMs);
        const latencySlope = this.linearRegressionSlope(latencyValues);

        let trendDirection: TransportPrediction["trendDirection"] = "stable";
        if (slope > 0.3) trendDirection = "improving";
        else if (slope < -1.0) trendDirection = "critical";
        else if (slope < -0.3) trendDirection = "degrading";

        let failureProbability = 0;
        const contributingFactors: string[] = [];

        if (slope < -0.5) {
          failureProbability += 30;
          contributingFactors.push(`Signal declining at ${slope.toFixed(2)} dBm/sample`);
        }
        if (latencySlope > 1.0) {
          failureProbability += 20;
          contributingFactors.push(`Latency increasing at ${latencySlope.toFixed(2)} ms/sample`);
        }

        const recentLoss = transport.signalHistory.slice(-4);
        const avgLoss = recentLoss.reduce((a, s) => a + s.packetLossPercent, 0) / (recentLoss.length || 1);
        if (avgLoss > 2) {
          failureProbability += 25;
          contributingFactors.push(`Recent packet loss averaging ${avgLoss.toFixed(1)}%`);
        }

        const currentSignal = transport.currentSignal;
        if (currentSignal && currentSignal.signalStrengthDbm < -75) {
          failureProbability += 15;
          contributingFactors.push(`Weak signal: ${currentSignal.signalStrengthDbm} dBm`);
        }

        failureProbability = Math.min(100, failureProbability);

        let predictedFailureTime: Date | null = null;
        if (failureProbability > 40 && slope < -0.3) {
          const threshold = -80;
          const current = currentSignal?.signalStrengthDbm || -60;
          const samplesToFailure = Math.abs((threshold - current) / (slope || -0.1));
          const minutesToFailure = samplesToFailure * 15;
          predictedFailureTime = new Date(Date.now() + minutesToFailure * 60 * 1000);
        }

        let recommendedAction = "Continue monitoring";
        if (failureProbability > 70) recommendedAction = "Initiate immediate failover to backup transport";
        else if (failureProbability > 50) recommendedAction = "Prepare failover and alert operators";
        else if (failureProbability > 30) recommendedAction = "Increase monitoring frequency, check transport hardware";

        predictions.push({
          kitId,
          kitName: transport.kitName,
          transportType: transport.transportType,
          predictedFailureTime,
          failureProbability,
          confidenceScore: Math.min(1, transport.signalHistory.length / 96),
          trendDirection,
          contributingFactors,
          recommendedAction,
        });
      }
    }

    return predictions;
  }

  getFailoverChain(kitId: string): FailoverChain | null {
    const transports = this.transportHistory.get(kitId);
    if (!transports) return null;

    const activeIndex = transports.findIndex((t) => t.currentStatus === "active");
    const failoverDates = this.failoverLog.get(kitId) || [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const failovers24h = failoverDates.filter((d) => d.getTime() > cutoff).length;

    return {
      kitId,
      kitName: transports[0]?.kitName || kitId,
      chain: transports,
      activeTransportIndex: activeIndex >= 0 ? activeIndex : 0,
      diversityScore: this.calculateDiversityScore(transports),
      lastFailoverAt: failoverDates.length > 0 ? failoverDates[failoverDates.length - 1]! : null,
      failoverCount24h: failovers24h,
    };
  }

  predictTimeToFailover(kitId: string): { kitId: string; estimateMinutes: number | null; confidence: number; primaryTransport: TransportType | null } {
    const transports = this.transportHistory.get(kitId);
    if (!transports || transports.length === 0) {
      return { kitId, estimateMinutes: null, confidence: 0, primaryTransport: null };
    }

    const primary = (transports.find((t) => t.isPrimary) || transports[0])!;
    const signalValues = primary.signalHistory.map((s) => s.signalStrengthDbm);
    const slope = this.linearRegressionSlope(signalValues);
    const rSquared = this.linearRegressionRSquared(signalValues);

    if (slope >= 0) {
      return { kitId, estimateMinutes: null, confidence: rSquared, primaryTransport: primary.transportType };
    }

    const current = primary.currentSignal?.signalStrengthDbm || -60;
    const failoverThreshold = -80;
    const samplesToThreshold = (failoverThreshold - current) / slope;
    const minutesToThreshold = Math.max(0, samplesToThreshold * 15);

    return {
      kitId,
      estimateMinutes: Math.round(minutesToThreshold),
      confidence: rSquared,
      primaryTransport: primary.transportType,
    };
  }

  getTransportDiversityScore(kitId: string): TransportDiversityReport | null {
    const transports = this.transportHistory.get(kitId);
    if (!transports) return null;

    const active = transports.filter((t) => t.currentStatus !== "failed");
    const vulnerabilities: string[] = [];

    if (transports.length < 2) {
      vulnerabilities.push("Single transport - no failover path available");
    }
    if (transports.every((t) => t.transportType === "lte_5g" || t.transportType === "dejero")) {
      vulnerabilities.push("All transports are cellular-dependent - vulnerable to RF interference");
    }
    if (!transports.some((t) => t.transportType === "wired")) {
      vulnerabilities.push("No wired backup - all transports are wireless");
    }
    if (active.length < 2) {
      vulnerabilities.push("Only one transport currently operational");
    }

    // Count truly independent paths (different technology families)
    const families = new Set<string>();
    for (const t of active) {
      if (t.transportType === "lte_5g" || t.transportType === "dejero") families.add("cellular");
      else if (t.transportType === "starlink") families.add("satellite");
      else if (t.transportType === "rf_pacstar") families.add("rf");
      else if (t.transportType === "wired") families.add("wired");
    }

    return {
      kitId,
      kitName: transports[0]?.kitName || kitId,
      totalTransports: transports.length,
      activeTransports: active.length,
      independentPaths: families.size,
      diversityScore: this.calculateDiversityScore(transports),
      vulnerabilities,
    };
  }

  getSignalTrends(): SignalTrendReport[] {
    const reports: SignalTrendReport[] = [];

    for (const [kitId, transports] of this.transportHistory) {
      for (const transport of transports) {
        const values = transport.signalHistory.map((s) => s.signalStrengthDbm);
        const slope = this.linearRegressionSlope(values);
        const rSquared = this.linearRegressionRSquared(values);

        let trendDirection: SignalTrendReport["trendDirection"] = "stable";
        if (slope > 0.3) trendDirection = "improving";
        else if (slope < -1.0) trendDirection = "critical";
        else if (slope < -0.3) trendDirection = "degrading";

        const current = values.length > 0 ? values[values.length - 1]! : -60;
        const projected1h = current + slope * 4; // 4 samples per hour
        const projected6h = current + slope * 24; // 24 samples in 6 hours

        reports.push({
          kitId,
          transportType: transport.transportType,
          sampleCount: values.length,
          slope: Math.round(slope * 1000) / 1000,
          rSquared: Math.round(rSquared * 1000) / 1000,
          trendDirection,
          projectedSignalIn1h: Math.round(projected1h * 10) / 10,
          projectedSignalIn6h: Math.round(projected6h * 10) / 10,
        });
      }
    }

    return reports;
  }

  private calculateDiversityScore(transports: TransportStatus[]): number {
    if (transports.length === 0) return 0;

    let score = 0;
    const active = transports.filter((t) => t.currentStatus !== "failed");

    // Points for number of transports (max 40)
    score += Math.min(40, active.length * 15);

    // Points for technology diversity (max 40)
    const types = new Set(active.map((t) => t.transportType));
    score += Math.min(40, types.size * 15);

    // Points for signal health of backup transports (max 20)
    const backups = active.filter((t) => !t.isPrimary);
    if (backups.length > 0) {
      const avgHealth = backups.reduce((sum, t) => {
        const sig = t.currentSignal?.signalStrengthDbm || -80;
        return sum + Math.max(0, (sig + 80) / 60 * 20);
      }, 0) / backups.length;
      score += Math.min(20, avgHealth);
    }

    return Math.min(100, Math.round(score));
  }
}
