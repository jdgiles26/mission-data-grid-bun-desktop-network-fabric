// Packet Capture Service - Manages capture lifecycle and real-time streaming

import { 
  PacketIntelligenceEngine, 
  createPacketIntelligenceEngine,
  type PacketIntelligenceConfig,
  type PacketCaptureEvent,
} from "./packet-intelligence";
import type { Database } from "./database";

export interface CaptureSessionInfo {
  id: string;
  interfaceName: string;
  status: "running" | "paused" | "stopped" | "error";
  startedAt: Date;
  durationMs: number;
  packetsCaptured: number;
  bytesCaptured: number;
  flowsTracked: number;
  activeFlows: number;
}

export interface RealtimeMetrics {
  timestamp: Date;
  packetsPerSecond: number;
  bytesPerSecond: number;
  flowCount: number;
  topProtocol: string;
  anomalyCount: number;
}

export type CaptureEventType = 
  | "packet"
  | "flow_start" 
  | "flow_end" 
  | "dns_query"
  | "http_request"
  | "tls_handshake"
  | "anomaly"
  | "stats";

export interface CaptureEvent {
  type: CaptureEventType;
  timestamp: Date;
  sessionId: string;
  data: unknown;
}

export class PacketCaptureService {
  private engine: PacketIntelligenceEngine | null = null;
  private eventSubscribers: Map<string, Array<(event: CaptureEvent) => void>> = new Map();
  private metricsInterval: Timer | null = null;
  private lastMetrics: RealtimeMetrics | null = null;
  private sessionId: string | null = null;

  constructor(private database: Database) {}

  async initialize(): Promise<{ available: boolean; interfaces: string[] }> {
    const dbInstance = (this.database as unknown as { db: unknown }).db;
    if (!dbInstance) {
      return { available: false, interfaces: [] };
    }

    this.engine = createPacketIntelligenceEngine(
      dbInstance as import("bun:sqlite").Database
    );

    const availability = await this.engine.checkAvailability();
    return {
      available: availability.available,
      interfaces: availability.interfaces?.map((i) => i.name) || [],
    };
  }

  async startCapture(config: Partial<PacketIntelligenceConfig> = {}): Promise<{
    success: boolean;
    sessionId?: string;
    error?: string;
  }> {
    if (!this.engine) {
      return { success: false, error: "Service not initialized" };
    }

    // Subscribe to all events before starting
    this.engine.onEvent((event) => this.handleEngineEvent(event));
    this.engine.onAlert((alert) => this.handleEngineAlert(alert));

    const result = await this.engine.startCapture(config);
    
    if (result.success && result.sessionId) {
      this.sessionId = result.sessionId;
      this.startMetricsStreaming();
    }

    return result;
  }

  async stopCapture(): Promise<{ success: boolean; stats?: unknown }> {
    this.stopMetricsStreaming();
    
    if (!this.engine) {
      return { success: false };
    }

    const result = await this.engine.stopCapture();
    this.sessionId = null;
    return result;
  }

  getSessionInfo(): CaptureSessionInfo | null {
    if (!this.engine || !this.sessionId) return null;

    const snapshot = this.engine.getSnapshot();
    const status = this.engine.getCaptureStatus();

    return {
      id: this.sessionId,
      interfaceName: snapshot.captureInterface,
      status: status.active ? "running" : "stopped",
      startedAt: new Date(Date.now() - (snapshot.captureDurationMs || 0)),
      durationMs: snapshot.captureDurationMs || 0,
      packetsCaptured: snapshot.packetsCaptured,
      bytesCaptured: snapshot.bytesCaptured,
      flowsTracked: snapshot.flowsTracked,
      activeFlows: snapshot.activeFlows,
    };
  }

  getRealtimeMetrics(): RealtimeMetrics | null {
    return this.lastMetrics;
  }

  getFlows(limit = 100): ReturnType<PacketIntelligenceEngine["listFlows"]> {
    if (!this.engine) return [];
    return this.engine.listFlows(limit);
  }

  getDNSQueries(limit = 100): ReturnType<PacketIntelligenceEngine["getDNSQueries"]> {
    if (!this.engine) return [];
    return this.engine.getDNSQueries(limit);
  }

  getHTTPTransactions(limit = 100): ReturnType<PacketIntelligenceEngine["getHTTPTransactions"]> {
    if (!this.engine) return [];
    return this.engine.getHTTPTransactions(limit);
  }

  getTLSHandshakes(limit = 100): ReturnType<PacketIntelligenceEngine["getTLSHandshakes"]> {
    if (!this.engine) return [];
    return this.engine.getTLSHandshakes(limit);
  }

  subscribe(eventType: CaptureEventType, handler: (event: CaptureEvent) => void): () => void {
    if (!this.eventSubscribers.has(eventType)) {
      this.eventSubscribers.set(eventType, []);
    }
    this.eventSubscribers.get(eventType)!.push(handler);

    return () => {
      const handlers = this.eventSubscribers.get(eventType);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx > -1) handlers.splice(idx, 1);
      }
    };
  }

  private handleEngineEvent(event: PacketCaptureEvent): void {
    if (!this.sessionId) return;

    let captureEvent: CaptureEvent | null = null;

    switch (event.type) {
      case "packet":
        if (event.packet) {
          captureEvent = {
            type: "packet",
            timestamp: event.timestamp,
            sessionId: this.sessionId,
            data: {
              protocols: event.packet.protocols,
              sourceIP: event.packet.ipv4?.sourceIP || event.packet.ipv6?.sourceIP,
              destIP: event.packet.ipv4?.destinationIP || event.packet.ipv6?.destinationIP,
              length: event.packet.raw.originalLength,
            },
          };

          // Emit specific L7 events
          if (event.packet.dns) {
            this.emitEvent("dns_query", {
              timestamp: event.timestamp,
              sessionId: this.sessionId,
              data: {
                queries: event.packet.dns.questions.map((q) => ({
                  name: q.name,
                  type: q.type,
                })),
                transactionId: event.packet.dns.transactionId,
              },
            });
          }

          if (event.packet.http?.isRequest) {
            this.emitEvent("http_request", {
              timestamp: event.timestamp,
              sessionId: this.sessionId,
              data: {
                method: event.packet.http.method,
                url: event.packet.http.url,
                host: event.packet.http.headers["host"],
              },
            });
          }

          if (event.packet.tls?.handshake) {
            this.emitEvent("tls_handshake", {
              timestamp: event.timestamp,
              sessionId: this.sessionId,
              data: {
                type: event.packet.tls.handshake.type,
                version: event.packet.tls.version,
                sni: event.packet.tls.sni,
              },
            });
          }
        }
        break;

      case "flow_start":
        captureEvent = {
          type: "flow_start",
          timestamp: event.timestamp,
          sessionId: this.sessionId,
          data: event.flowKey,
        };
        break;

      case "flow_end":
        captureEvent = {
          type: "flow_end",
          timestamp: event.timestamp,
          sessionId: this.sessionId,
          data: event.flowKey,
        };
        break;
    }

    if (captureEvent) {
      this.emitEvent(captureEvent.type, captureEvent);
    }
  }

  private handleEngineAlert(alert: { id: string; timestamp: Date; severity: string; category: string; title: string; detail: string }): void {
    if (!this.sessionId) return;

    this.emitEvent("anomaly", {
      type: "anomaly",
      timestamp: alert.timestamp,
      sessionId: this.sessionId,
      data: {
        id: alert.id,
        severity: alert.severity,
        category: alert.category,
        title: alert.title,
        detail: alert.detail,
      },
    });
  }

  private emitEvent(type: CaptureEventType, event: CaptureEvent): void {
    const handlers = this.eventSubscribers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error(`Event handler error for ${type}:`, error);
        }
      }
    }

    // Also emit to wildcard subscribers
    const wildcards = this.eventSubscribers.get("stats");
    if (wildcards && type !== "stats") {
      for (const handler of wildcards) {
        try {
          handler(event);
        } catch (error) {
          console.error("Wildcard handler error:", error);
        }
      }
    }
  }

  private startMetricsStreaming(): void {
    this.metricsInterval = setInterval(() => {
      if (!this.engine) return;

      const snapshot = this.engine.getSnapshot();
      
      this.lastMetrics = {
        timestamp: new Date(),
        packetsPerSecond: snapshot.packetsPerSecond,
        bytesPerSecond: Math.round(snapshot.bitsPerSecond / 8),
        flowCount: snapshot.flowsTracked,
        topProtocol: Object.entries(snapshot.protocolStats.l7)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || "UNKNOWN",
        anomalyCount: snapshot.anomalyCount,
      };

      this.emitEvent("stats", {
        type: "stats",
        timestamp: new Date(),
        sessionId: this.sessionId || "unknown",
        data: this.lastMetrics,
      });
    }, 1000);
  }

  private stopMetricsStreaming(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}

export function createPacketCaptureService(database: Database): PacketCaptureService {
  return new PacketCaptureService(database);
}
