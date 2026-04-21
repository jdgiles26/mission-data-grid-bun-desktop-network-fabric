// Enhanced Network Intelligence - Phase 2 Integration
// Real-time telemetry only - no synthetic/mock events

import { NetworkIntelligenceEngine } from "./network-intelligence";
import { 
  PacketIntelligenceEngine, 
  createPacketIntelligenceEngine,
  type PacketIntelligenceSnapshot,
  type PacketIntelligenceConfig,
  type PacketCaptureEvent,
} from "./packet-intelligence";
import type { Database } from "./database";
import type { 
  NetworkIntelligenceSnapshot as Phase1Snapshot,
  UniversalTelemetryEvent,
} from "./network-intelligence";

export type CaptureEngineType = "socket" | "packet" | "hybrid";

export interface EnhancedNetworkIntelligenceConfig {
  preferredEngine: CaptureEngineType;
  fallbackToSocket: boolean;
  packetCapture?: Partial<PacketIntelligenceConfig>;
  hybrid: {
    usePacketForL7: boolean;
    usePacketForAnomalies: boolean;
    minPacketCaptureDurationMs: number;
  };
}

export interface EnhancedNetworkIntelligenceSnapshot extends Phase1Snapshot {
  engineUsed: CaptureEngineType;
  packetCaptureAvailable: boolean;
  packetCaptureActive: boolean;
  packetSnapshot?: PacketIntelligenceSnapshot;
  flowVisibility: {
    method: "socket_table" | "packet_capture" | "hybrid";
    flowCount: number;
    l7Protocols: string[];
    topTalkers: Array<{ ip: string; flows: number; bytes: number }>;
  };
  deepInspection?: {
    dnsQueries: number;
    httpRequests: number;
    tlsHandshakes: number;
    anomalies: number;
  };
}

const DEFAULT_CONFIG: EnhancedNetworkIntelligenceConfig = {
  preferredEngine: "hybrid",
  fallbackToSocket: true,
  hybrid: {
    usePacketForL7: true,
    usePacketForAnomalies: true,
    minPacketCaptureDurationMs: 5000,
  },
};

export class EnhancedNetworkIntelligenceEngine {
  private config: EnhancedNetworkIntelligenceConfig;
  private phase1Engine: NetworkIntelligenceEngine;
  private phase2Engine: PacketIntelligenceEngine | null = null;
  private database: Database;
  
  private packetCaptureAvailable = false;
  private packetCaptureActive = false;
  private packetCaptureStartTime: Date | null = null;
  private lastPhase1Snapshot: Phase1Snapshot | null = null;
  private packetTelemetryEvents: UniversalTelemetryEvent[] = [];
  private readonly maxBufferedEvents = 1000;
  private packetEventUnsubscribe: (() => void) | null = null;
  private packetAlertUnsubscribe: (() => void) | null = null;

  constructor(database: Database, config: Partial<EnhancedNetworkIntelligenceConfig> = {}) {
    this.database = database;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.phase1Engine = new NetworkIntelligenceEngine();
    
    const dbInstance = (database as unknown as { db: unknown }).db;
    if (dbInstance) {
      this.phase2Engine = createPacketIntelligenceEngine(
        dbInstance as import("bun:sqlite").Database,
        this.config.packetCapture
      );
    }
  }

  async initialize(): Promise<{ packetCaptureAvailable: boolean; engineType: CaptureEngineType }> {
    if (this.phase2Engine) {
      const availability = await this.phase2Engine.checkAvailability();
      this.packetCaptureAvailable = availability.available;
    }

    let engineType = this.config.preferredEngine;
    if (engineType === "packet" && !this.packetCaptureAvailable) {
      engineType = this.config.fallbackToSocket ? "socket" : "socket";
    }

    return { packetCaptureAvailable: this.packetCaptureAvailable, engineType };
  }

  async startPacketCapture(interfaceName?: string): Promise<{ success: boolean; error?: string }> {
    if (!this.phase2Engine) return { success: false, error: "Not initialized" };
    if (!this.packetCaptureAvailable) return { success: false, error: "Packet capture not available" };
    if (this.packetCaptureActive) return { success: false, error: "Already active" };

    this.packetTelemetryEvents = [];

    this.packetEventUnsubscribe = this.phase2Engine.onEvent((event) => {
      this.handleRealtimePacketEvent(event);
    });

    this.packetAlertUnsubscribe = this.phase2Engine.onAlert((alert) => {
      this.handleRealtimeAlert(alert);
    });

    const result = await this.phase2Engine.startCapture({
      targetInterface: interfaceName || this.getDefaultInterface(),
      ...this.config.packetCapture,
    });

    if (result.success) {
      this.packetCaptureActive = true;
      this.packetCaptureStartTime = new Date();
    } else {
      this.packetEventUnsubscribe?.();
      this.packetAlertUnsubscribe?.();
      this.packetEventUnsubscribe = null;
      this.packetAlertUnsubscribe = null;
    }

    return result;
  }

  async stopPacketCapture(): Promise<{ success: boolean }> {
    if (!this.phase2Engine || !this.packetCaptureActive) return { success: false };

    this.packetEventUnsubscribe?.();
    this.packetAlertUnsubscribe?.();
    this.packetEventUnsubscribe = null;
    this.packetAlertUnsubscribe = null;

    const result = await this.phase2Engine.stopCapture();
    if (result.success) {
      this.packetCaptureActive = false;
      this.packetCaptureStartTime = null;
    }
    return result;
  }

  async getSnapshot(config: {
    mode: "AUTONET_ASSIST" | "UNIVERSAL_INTEL";
    selectedInterface?: string | null;
    forceRefresh?: boolean;
  }): Promise<EnhancedNetworkIntelligenceSnapshot> {
    const phase1Snapshot = await this.phase1Engine.getSnapshot({
      mode: config.mode,
      selectedInterface: config.selectedInterface,
      forceRefresh: config.forceRefresh,
    });

    const engineType = this.selectEngine();
    let phase2Snapshot: PacketIntelligenceSnapshot | undefined;
    
    if (engineType !== "socket" && this.phase2Engine && this.packetCaptureActive) {
      phase2Snapshot = this.phase2Engine.getSnapshot();
    }

    return this.buildEnhancedSnapshot(phase1Snapshot, phase2Snapshot, engineType);
  }

  getTelemetryEvents(limit = 500): UniversalTelemetryEvent[] {
    const events: UniversalTelemetryEvent[] = [];
    if (this.lastPhase1Snapshot) events.push(...this.lastPhase1Snapshot.telemetryEvents);
    events.push(...this.packetTelemetryEvents);
    events.sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
    return events.slice(0, limit);
  }

  getFlows(limit = 100): Array<{ id: string; protocol: string; source: string; destination: string; packets: number; bytes: number; state: string }> {
    if (this.phase2Engine && this.packetCaptureActive) {
      return this.phase2Engine.listFlows(limit).map((f) => ({
        id: f.id,
        protocol: f.key.protocol,
        source: `${f.key.sourceIP}:${f.key.sourcePort}`,
        destination: `${f.key.destinationIP}:${f.key.destinationPort}`,
        packets: f.stats.packetCount,
        bytes: f.stats.byteCount,
        state: f.stats.tcpState || "UNKNOWN",
      }));
    }
    return [];
  }

  getDNSQueries(limit = 100): Array<{ timestamp: Date; query: string; type: string; sourceIP: string; destinationIP: string; latencyMs?: number }> {
    if (!this.phase2Engine || !this.packetCaptureActive) return [];
    return this.phase2Engine.getDNSQueries(limit).map((q) => ({
      timestamp: q.timestamp,
      query: q.queryName,
      type: q.queryTypeName,
      sourceIP: q.sourceIP,
      destinationIP: q.destinationIP,
      latencyMs: q.latencyMs,
    }));
  }

  getHTTPTransactions(limit = 100): Array<{ timestamp: Date; method: string; url: string; host?: string; statusCode?: number; latencyMs?: number }> {
    if (!this.phase2Engine || !this.packetCaptureActive) return [];
    return this.phase2Engine.getHTTPTransactions(limit).map((t) => ({
      timestamp: t.requestTimestamp,
      method: t.method,
      url: t.url,
      host: t.host,
      statusCode: t.statusCode,
      latencyMs: t.latencyMs,
    }));
  }

  getCaptureStatus(): { available: boolean; active: boolean; engineType: CaptureEngineType; durationMs?: number } {
    return {
      available: this.packetCaptureAvailable,
      active: this.packetCaptureActive,
      engineType: this.selectEngine(),
      durationMs: this.packetCaptureStartTime ? Date.now() - this.packetCaptureStartTime.getTime() : undefined,
    };
  }

  clearEventBuffer(): void {
    this.packetTelemetryEvents = [];
  }

  private selectEngine(): CaptureEngineType {
    if (!this.packetCaptureAvailable) return "socket";
    if (this.config.preferredEngine === "hybrid" && this.packetCaptureActive && this.packetCaptureStartTime) {
      if (Date.now() - this.packetCaptureStartTime.getTime() >= this.config.hybrid.minPacketCaptureDurationMs) {
        return "hybrid";
      }
    }
    return this.config.preferredEngine === "packet" && this.packetCaptureActive ? "packet" : "socket";
  }

  private handleRealtimePacketEvent(event: PacketCaptureEvent): void {
    if (!event.packet) return;
    const packet = event.packet;
    const timestamp = packet.raw.timestamp;
    const interfaceName = packet.raw.interfaceName;

    if (event.type === "flow_start" && event.flowKey) {
      this.emitTelemetryEvent({
        id: crypto.randomUUID(),
        capturedAt: timestamp,
        eventType: "FLOW",
        severity: "INFO",
        source: "packet-flow",
        title: `New ${event.flowKey.protocol} flow`,
        summary: `${event.flowKey.sourceIP}:${event.flowKey.sourcePort} -> ${event.flowKey.destinationIP}:${event.flowKey.destinationPort}`,
        detail: `Flow started: ${event.flowKey.protocol}`,
        interfaceName,
        data: { protocol: event.flowKey.protocol, ...event.flowKey },
      });
    }

    if (packet.dns?.flags.qr === false) {
      for (const question of packet.dns.questions) {
        this.emitTelemetryEvent({
          id: crypto.randomUUID(),
          capturedAt: timestamp,
          eventType: "DNS",
          severity: "INFO",
          source: "packet-dns",
          title: "DNS Query",
          summary: `${question.name} (${this.getDNSQueryTypeName(question.type)})`,
          detail: `DNS query for ${question.name}`,
          interfaceName,
          data: { queryName: question.name, queryType: question.type },
        });
      }
    }

    if (packet.http?.isRequest) {
      this.emitTelemetryEvent({
        id: crypto.randomUUID(),
        capturedAt: timestamp,
        eventType: "FLOW",
        severity: "INFO",
        source: "packet-http",
        title: `HTTP ${packet.http.method}`,
        summary: `${packet.http.method} ${packet.http.url}`,
        detail: `HTTP ${packet.http.method} request`,
        interfaceName,
        data: { method: packet.http.method, url: packet.http.url, host: packet.http.headers["host"] },
      });
    }

    if (packet.tls?.handshake?.type === "client_hello") {
      this.emitTelemetryEvent({
        id: crypto.randomUUID(),
        capturedAt: timestamp,
        eventType: "FLOW",
        severity: "INFO",
        source: "packet-tls",
        title: "TLS Client Hello",
        summary: packet.tls.sni || "TLS handshake",
        detail: packet.tls.sni ? `TLS handshake for ${packet.tls.sni}` : "TLS handshake initiated",
        interfaceName,
        data: { tlsVersion: packet.tls.version, sni: packet.tls.sni },
      });
    }
  }

  private handleRealtimeAlert(alert: { id: string; timestamp: Date; severity: "INFO" | "WARNING" | "CRITICAL"; category: string; title: string; detail: string }): void {
    this.emitTelemetryEvent({
      id: alert.id,
      capturedAt: alert.timestamp,
      eventType: "ANOMALY",
      severity: alert.severity,
      source: `packet-${alert.category.toLowerCase()}`,
      title: alert.title,
      summary: alert.detail,
      detail: alert.detail,
      data: { category: alert.category },
    });
  }

  private emitTelemetryEvent(event: UniversalTelemetryEvent): void {
    this.packetTelemetryEvents.push(event);
    if (this.packetTelemetryEvents.length > this.maxBufferedEvents) {
      this.packetTelemetryEvents = this.packetTelemetryEvents.slice(-this.maxBufferedEvents);
    }
  }

  private buildEnhancedSnapshot(phase1: Phase1Snapshot, phase2: PacketIntelligenceSnapshot | undefined, engineType: CaptureEngineType): EnhancedNetworkIntelligenceSnapshot {
    this.lastPhase1Snapshot = phase1;
    const allEvents = [...phase1.telemetryEvents, ...this.packetTelemetryEvents];
    allEvents.sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());

    return {
      ...phase1,
      engineUsed: engineType,
      packetCaptureAvailable: this.packetCaptureAvailable,
      packetCaptureActive: this.packetCaptureActive,
      packetSnapshot: phase2,
      flowVisibility: this.buildFlowVisibility(phase1, phase2, engineType),
      deepInspection: phase2 ? { dnsQueries: phase2.dnsQueries, httpRequests: phase2.httpRequests, tlsHandshakes: phase2.tlsHandshakes, anomalies: phase2.anomalyCount } : undefined,
      telemetryEvents: allEvents.slice(0, 500),
      parity: { ...phase1.parity, limitations: this.buildLimitations(engineType, phase2) },
    };
  }

  private buildFlowVisibility(phase1: Phase1Snapshot, phase2: PacketIntelligenceSnapshot | undefined, engineType: CaptureEngineType): EnhancedNetworkIntelligenceSnapshot["flowVisibility"] {
    if (phase2) {
      const uniqueIPs = new Map<string, { flows: number; bytes: number }>();
      for (const flow of phase2.recentFlows) {
        const srcIP = flow.source.split(":")[0];
        const existing = uniqueIPs.get(srcIP) || { flows: 0, bytes: 0 };
        existing.flows++;
        existing.bytes += flow.byteCount;
        uniqueIPs.set(srcIP, existing);
      }
      return {
        method: engineType === "hybrid" ? "hybrid" : "packet_capture",
        flowCount: phase2.flowsTracked,
        l7Protocols: Object.keys(phase2.protocolStats.l7),
        topTalkers: Array.from(uniqueIPs.entries()).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 10).map(([ip, stats]) => ({ ip, ...stats })),
      };
    }
    return { method: "socket_table", flowCount: phase1.connections.remoteEstablished, l7Protocols: [], topTalkers: phase1.topEndpoints.map((ep) => ({ ip: ep.endpoint.split(":")[0], flows: ep.connections, bytes: 0 })) };
  }

  private buildLimitations(engineType: CaptureEngineType, phase2: PacketIntelligenceSnapshot | undefined): string[] {
    const limitations: string[] = [];
    if (engineType === "socket") limitations.push("Flow intelligence uses socket tables (no packet capture)");
    if (!this.packetCaptureAvailable) limitations.push("Packet capture unavailable (requires root)");
    if (phase2) limitations.push("Payload content not stored (metadata only)");
    return limitations;
  }

  private getDefaultInterface(): string {
    return this.lastPhase1Snapshot?.selectedInterface || "en0";
  }

  private getDNSQueryTypeName(type: number): string {
    const names: Record<number, string> = { 1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 12: "PTR", 15: "MX", 16: "TXT", 28: "AAAA", 33: "SRV", 255: "ANY" };
    return names[type] || `TYPE${type}`;
  }
}

export function createEnhancedNetworkIntelligenceEngine(database: Database, config?: Partial<EnhancedNetworkIntelligenceConfig>): EnhancedNetworkIntelligenceEngine {
  return new EnhancedNetworkIntelligenceEngine(database, config);
}

export type { EnhancedNetworkIntelligenceConfig, EnhancedNetworkIntelligenceSnapshot, CaptureEngineType };
