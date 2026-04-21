// Packet Capture Manager - High-level orchestration
// Combines capture service, event streaming, and analysis

import { PacketCaptureService, createPacketCaptureService } from "./packet-capture-service";
import { PacketEventStream, createPacketEventStream } from "./packet-event-stream";
import { PacketAnalyzer, createPacketAnalyzer } from "./packet-analyzer";
import type { Database } from "./database";

export interface CaptureManagerState {
  initialized: boolean;
  captureAvailable: boolean;
  captureActive: boolean;
  sessionId?: string;
  interfaceName?: string;
  startTime?: Date;
  metrics: {
    packetsCaptured: number;
    bytesCaptured: number;
    flowsTracked: number;
    dnsQueries: number;
    httpRequests: number;
    tlsHandshakes: number;
    anomalies: number;
  };
}

export class PacketCaptureManager {
  public service: PacketCaptureService;
  public eventStream: PacketEventStream;
  public analyzer: PacketAnalyzer;
  
  private state: CaptureManagerState;
  private metricsInterval: Timer | null = null;

  constructor(private database: Database) {
    this.service = createPacketCaptureService(database);
    this.eventStream = createPacketEventStream(this.service);
    this.analyzer = createPacketAnalyzer();
    
    this.state = {
      initialized: false,
      captureAvailable: false,
      captureActive: false,
      metrics: {
        packetsCaptured: 0,
        bytesCaptured: 0,
        flowsTracked: 0,
        dnsQueries: 0,
        httpRequests: 0,
        tlsHandshakes: 0,
        anomalies: 0,
      },
    };
  }

  async initialize(): Promise<{ success: boolean; available: boolean; error?: string }> {
    try {
      const result = await this.service.initialize();
      this.state.initialized = true;
      this.state.captureAvailable = result.available;
      
      if (result.available) {
        this.eventStream.start();
      }
      
      return { success: true, available: result.available };
    } catch (error) {
      return { success: false, available: false, error: String(error) };
    }
  }

  async startCapture(config: {
    interfaceName?: string;
    bpfFilter?: string;
    enableAnalysis?: boolean;
  } = {}): Promise<{ success: boolean; sessionId?: string; error?: string }> {
    if (!this.state.initialized) {
      return { success: false, error: "Manager not initialized" };
    }

    if (!this.state.captureAvailable) {
      return { success: false, error: "Packet capture not available" };
    }

    if (this.state.captureActive) {
      return { success: false, error: "Capture already active" };
    }

    const result = await this.service.startCapture({
      targetInterface: config.interfaceName,
      bpfFilter: config.bpfFilter,
      enableDeepInspection: true,
      enableAnomalyDetection: true,
      enableTLSFingerprinting: true,
      trackDNSQueries: true,
      trackHTTPTransactions: true,
    });

    if (result.success) {
      this.state.captureActive = true;
      this.state.sessionId = result.sessionId;
      this.state.interfaceName = config.interfaceName;
      this.state.startTime = new Date();
      
      // Reset metrics
      this.state.metrics = {
        packetsCaptured: 0,
        bytesCaptured: 0,
        flowsTracked: 0,
        dnsQueries: 0,
        httpRequests: 0,
        tlsHandshakes: 0,
        anomalies: 0,
      };

      // Start metrics collection
      this.startMetricsCollection();
    }

    return result;
  }

  async stopCapture(): Promise<{ success: boolean; stats?: unknown }> {
    if (!this.state.captureActive) {
      return { success: false };
    }

    this.stopMetricsCollection();

    const result = await this.service.stopCapture();
    
    if (result.success) {
      this.state.captureActive = false;
      this.state.sessionId = undefined;
      this.state.interfaceName = undefined;
      this.state.startTime = undefined;
    }

    return result;
  }

  getState(): CaptureManagerState {
    // Update metrics from service
    const sessionInfo = this.service.getSessionInfo();
    if (sessionInfo) {
      this.state.metrics.packetsCaptured = sessionInfo.packetsCaptured;
      this.state.metrics.bytesCaptured = sessionInfo.bytesCaptured;
      this.state.metrics.flowsTracked = sessionInfo.flowsTracked;
    }

    return { ...this.state };
  }

  getAnalysis() {
    const flows = this.service.getFlows(1000);
    
    return {
      patterns: flows.map((f) => ({
        flowId: f.id,
        pattern: this.analyzer.analyzeTrafficPattern(f.id, [f.stats.byteCount]),
      })),
      endpoints: this.analyzer.analyzeEndpoint("0.0.0.0", flows.map((f) => ({
        id: f.id,
        sessionId: "",
        captureInterface: "",
        captureStartedAt: f.stats.startTime,
        protocol: f.key.protocol,
        sourceIP: f.key.sourceIP,
        sourcePort: f.key.sourcePort,
        destinationIP: f.key.destinationIP,
        destinationPort: f.key.destinationPort,
        l2Protocol: "",
        l3Protocol: "",
        l4Protocol: "",
        packetCount: f.stats.packetCount,
        byteCount: f.stats.byteCount,
        firstSeenAt: f.stats.startTime,
        lastSeenAt: f.stats.lastSeen,
        durationMs: f.stats.lastSeen.getTime() - f.stats.startTime.getTime(),
        hasHTTP: false,
        hasDNS: false,
        hasTLS: false,
        terminated: f.stats.tcpState === "CLOSED",
      }))),
      security: this.analyzer.detectSecurityInsights(flows.map((f) => ({
        id: f.id,
        sessionId: "",
        captureInterface: "",
        captureStartedAt: f.stats.startTime,
        protocol: f.key.protocol,
        sourceIP: f.key.sourceIP,
        sourcePort: f.key.sourcePort,
        destinationIP: f.key.destinationIP,
        destinationPort: f.key.destinationPort,
        l2Protocol: "",
        l3Protocol: "",
        l4Protocol: "",
        packetCount: f.stats.packetCount,
        byteCount: f.stats.byteCount,
        synCount: f.stats.synCount,
        finCount: f.stats.finCount,
        rstCount: f.stats.rstCount,
        retransmitCount: f.stats.retransmits,
        firstSeenAt: f.stats.startTime,
        lastSeenAt: f.stats.lastSeen,
        durationMs: f.stats.lastSeen.getTime() - f.stats.startTime.getTime(),
        hasHTTP: false,
        hasDNS: false,
        hasTLS: false,
        terminated: f.stats.tcpState === "CLOSED",
      }))),
      stats: this.analyzer.generateProtocolStats(flows.map((f) => ({
        id: f.id,
        sessionId: "",
        captureInterface: "",
        captureStartedAt: f.stats.startTime,
        protocol: f.key.protocol,
        sourceIP: f.key.sourceIP,
        sourcePort: f.key.sourcePort,
        destinationIP: f.key.destinationIP,
        destinationPort: f.key.destinationPort,
        l2Protocol: "",
        l3Protocol: "",
        l4Protocol: "",
        packetCount: f.stats.packetCount,
        byteCount: f.stats.byteCount,
        firstSeenAt: f.stats.startTime,
        lastSeenAt: f.stats.lastSeen,
        durationMs: f.stats.lastSeen.getTime() - f.stats.startTime.getTime(),
        hasHTTP: false,
        hasDNS: false,
        hasTLS: false,
        terminated: f.stats.tcpState === "CLOSED",
      }))),
    };
  }

  subscribeToEvents(handler: (event: unknown) => void): () => void {
    return this.eventStream.subscribe(handler);
  }

  getRealtimeMetrics() {
    return this.service.getRealtimeMetrics();
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      const sessionInfo = this.service.getSessionInfo();
      if (sessionInfo) {
        this.state.metrics.packetsCaptured = sessionInfo.packetsCaptured;
        this.state.metrics.bytesCaptured = sessionInfo.bytesCaptured;
        this.state.metrics.flowsTracked = sessionInfo.flowsTracked;
      }
    }, 1000);
  }

  private stopMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  dispose(): void {
    this.stopMetricsCollection();
    this.eventStream.stop();
    if (this.state.captureActive) {
      this.service.stopCapture().catch(() => {});
    }
  }
}

export function createPacketCaptureManager(database: Database): PacketCaptureManager {
  return new PacketCaptureManager(database);
}
