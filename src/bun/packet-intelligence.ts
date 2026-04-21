// Phase 2: Packet-Level Intelligence Engine
// Integrates packet capture with flow tracking and deep protocol analysis

import { 
  PacketCaptureEngine, 
  createPacketCaptureEngine,
  type PacketCaptureConfig,
  type PacketCaptureEvent,
  type ParsedPacket,
  type FlowKey,
  type FlowStats,
  type CaptureSession,
  WELL_KNOWN_PORTS,
} from "./packet-capture";
import { 
  PacketDatabase, 
  initializePacketTables,
  createFlowId,
  extractFlowRecord,
  type PacketFlowRecord,
  type ProtocolStatistics,
  type DNSQueryRecord,
  type HTTPTransactionRecord,
  type TLSHandshakeRecord,
} from "./packet-database";
import type { Database as SQLiteDatabase } from "bun:sqlite";

export type CaptureMode = "passive" | "active" | "targeted";

export interface PacketIntelligenceConfig {
  // Capture settings
  captureMode: CaptureMode;
  targetInterface: string;
  promiscuous: boolean;
  snapLength: number;
  bpfFilter: string;
  
  // Storage settings
  enableDatabaseStorage: boolean;
  maxFlowsToTrack: number;
  maxEventsPerSession: number;
  pruneIntervalMs: number;
  
  // Analysis settings
  enableDeepInspection: boolean;
  enableTLSFingerprinting: boolean;
  enableAnomalyDetection: boolean;
  trackHTTPTransactions: boolean;
  trackDNSQueries: boolean;
  
  // Performance settings
  maxPacketsPerSecond: number;
  analysisBatchSize: number;
  eventEmitIntervalMs: number;
}

export interface PacketIntelligenceSnapshot {
  generatedAt: Date;
  sessionActive: boolean;
  sessionId?: string;
  captureInterface: string;
  captureMode: CaptureMode;
  
  // Session stats
  packetsCaptured: number;
  bytesCaptured: number;
  flowsTracked: number;
  activeFlows: number;
  terminatedFlows: number;
  
  // Protocol distribution
  protocolStats: {
    l2: Record<string, number>;
    l3: Record<string, number>;
    l4: Record<string, number>;
    l7: Record<string, number>;
  };
  
  // Top talkers
  topSourceIPs: Array<{ ip: string; packets: number; bytes: number }>;
  topDestinationIPs: Array<{ ip: string; packets: number; bytes: number }>;
  topPorts: Array<{ port: number; protocol: string; packets: number; service?: string }>;
  
  // Recent flows (summary)
  recentFlows: Array<{
    id: string;
    protocol: string;
    source: string;
    destination: string;
    l7Protocol?: string;
    packetCount: number;
    byteCount: number;
    durationMs: number;
    state: string;
  }>;
  
  // L7 insights
  dnsQueries: number;
  httpRequests: number;
  tlsHandshakes: number;
  
  // Anomalies
  anomalyCount: number;
  alerts: PacketIntelligenceAlert[];
  
  // Performance
  captureDurationMs: number;
  packetsPerSecond: number;
  bitsPerSecond: number;
}

export interface PacketIntelligenceAlert {
  id: string;
  timestamp: Date;
  severity: "INFO" | "WARNING" | "CRITICAL";
  category: "ANOMALY" | "SECURITY" | "PERFORMANCE" | "PROTOCOL";
  title: string;
  detail: string;
  flowId?: string;
  relatedIPs?: string[];
  relatedPorts?: number[];
}

export interface FlowDetail {
  id: string;
  sessionId: string;
  key: FlowKey;
  stats: FlowStats;
  protocols: {
    l2: string;
    l3: string;
    l4: string;
    l7?: string;
  };
  ethernet?: {
    sourceMAC: string;
    destinationMAC: string;
    vlanIds?: number[];
  };
  l7Data?: {
    httpTransactions?: number;
    dnsQueries?: number;
    tlsSNI?: string;
    tlsVersion?: string;
  };
  timeline: Array<{
    timestamp: Date;
    event: string;
    details: Record<string, unknown>;
  }>;
}

// Default configuration
const DEFAULT_CONFIG: PacketIntelligenceConfig = {
  captureMode: "passive",
  targetInterface: "en0",
  promiscuous: false,
  snapLength: 65535,
  bpfFilter: "",
  enableDatabaseStorage: true,
  maxFlowsToTrack: 10000,
  maxEventsPerSession: 50000,
  pruneIntervalMs: 30000,
  enableDeepInspection: true,
  enableTLSFingerprinting: true,
  enableAnomalyDetection: true,
  trackHTTPTransactions: true,
  trackDNSQueries: true,
  maxPacketsPerSecond: 10000,
  analysisBatchSize: 100,
  eventEmitIntervalMs: 1000,
};

/**
 * Packet Intelligence Engine - Phase 2
 * 
 * Provides true packet-level visibility with:
 * - Real-time packet capture (via tcpdump/libpcap)
 * - Deep packet inspection across all layers
 * - Flow tracking and reconstruction
 * - Protocol analysis (HTTP, DNS, TLS)
 * - Anomaly detection
 */
export class PacketIntelligenceEngine {
  private config: PacketIntelligenceConfig;
  private captureEngine: PacketCaptureEngine | null = null;
  private packetDb: PacketDatabase | null = null;
  private db: SQLiteDatabase | null = null;
  
  private sessionId: string | null = null;
  private sessionStartedAt: Date | null = null;
  private activeFlows = new Map<string, FlowStats>();
  private flowPackets = new Map<string, number>(); // Track packets per flow
  private alerts: PacketIntelligenceAlert[] = [];
  private anomalyCounters = new Map<string, number>();
  
  // Event handlers
  private eventHandlers: Array<(event: PacketCaptureEvent) => void> = [];
  private alertHandlers: Array<(alert: PacketIntelligenceAlert) => void> = [];
  
  // HTTP/DNS tracking for transaction correlation
  private pendingDNSQueries = new Map<number, { 
    timestamp: Date; 
    sourceIP: string; 
    destinationIP: string;
    queryName: string;
  }>();
  private pendingHTTPRequests = new Map<string, {
    timestamp: Date;
    method: string;
    url: string;
    flowId: string;
  }>();

  constructor(
    db: SQLiteDatabase | null = null,
    config: Partial<PacketIntelligenceConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (db) {
      this.db = db;
      initializePacketTables(db);
      this.packetDb = new PacketDatabase(db);
    }
  }

  /**
   * Check if packet capture is available
   */
  async checkAvailability(): Promise<{ 
    available: boolean; 
    reason?: string;
    interfaces?: Array<{ name: string; description: string }>;
  }> {
    const engine = createPacketCaptureEngine();
    const result = await engine.checkAvailability();
    
    if (result.available) {
      const interfaces = await engine.listInterfaces();
      return { available: true, interfaces };
    }
    
    return result;
  }

  /**
   * Start packet capture session
   */
  async startCapture(options?: Partial<PacketIntelligenceConfig>): Promise<{
    success: boolean;
    sessionId?: string;
    error?: string;
  }> {
    if (options) {
      this.config = { ...this.config, ...options };
    }

    // Check availability first
    const availability = await this.checkAvailability();
    if (!availability.available) {
      return { success: false, error: availability.reason };
    }

    try {
      // Create capture engine
      this.captureEngine = createPacketCaptureEngine({
        interfaceName: this.config.targetInterface,
        promiscuous: this.config.promiscuous,
        snapLength: this.config.snapLength,
        bpfFilter: this.config.bpfFilter,
        maxPacketsPerBatch: this.config.analysisBatchSize,
      });

      // Start capture
      const session = await this.captureEngine.start();
      this.sessionId = session.id;
      this.sessionStartedAt = session.startedAt;

      // Create database session record
      if (this.packetDb) {
        this.packetDb.createSession({
          id: session.id,
          interfaceName: this.config.targetInterface,
          config: JSON.stringify(this.config),
          startedAt: session.startedAt,
          status: "running",
          totalPackets: 0,
          totalBytes: 0,
          uniqueFlows: 0,
          activeFlows: 0,
          terminatedFlows: 0,
          bpfFilter: this.config.bpfFilter || undefined,
        });
      }

      // Register packet handler
      this.captureEngine.onPacket((event) => this.handlePacketEvent(event));

      return { success: true, sessionId: session.id };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to start capture: ${error}` 
      };
    }
  }

  /**
   * Stop capture session
   */
  async stopCapture(): Promise<{
    success: boolean;
    stats?: {
      packets: number;
      bytes: number;
      flows: number;
      durationMs: number;
    };
  }> {
    if (!this.captureEngine || !this.sessionId) {
      return { success: false };
    }

    const session = await this.captureEngine.stop();
    const durationMs = Date.now() - session.startedAt.getTime();

    // Update database
    if (this.packetDb) {
      this.packetDb.updateSession(this.sessionId, {
        status: "stopped",
        endedAt: new Date(),
        totalPackets: session.packetCount,
        totalBytes: session.byteCount,
        uniqueFlows: this.activeFlows.size,
      });
    }

    this.captureEngine = null;
    this.sessionId = null;
    this.sessionStartedAt = null;
    this.activeFlows.clear();

    return {
      success: true,
      stats: {
        packets: session.packetCount,
        bytes: session.byteCount,
        flows: this.activeFlows.size,
        durationMs,
      },
    };
  }

  /**
   * Get current snapshot
   */
  getSnapshot(): PacketIntelligenceSnapshot {
    const now = new Date();
    const flows = Array.from(this.activeFlows.entries());
    const activeFlows = flows.filter(([_, stats]) => stats.tcpState !== "CLOSED");
    const terminatedFlows = flows.filter(([_, stats]) => stats.tcpState === "CLOSED");
    
    // Calculate protocol distribution
    const l2Counts: Record<string, number> = {};
    const l3Counts: Record<string, number> = {};
    const l4Counts: Record<string, number> = {};
    const l7Counts: Record<string, number> = {};
    
    // Aggregate stats
    let packetsCaptured = 0;
    let bytesCaptured = 0;
    const ipStats = new Map<string, { packets: number; bytes: number; asSource: boolean }>();
    const portStats = new Map<string, { port: number; protocol: string; packets: number }>();
    
    let dnsCount = 0;
    let httpCount = 0;
    let tlsCount = 0;

    for (const [flowId, stats] of flows) {
      packetsCaptured += stats.packetCount;
      bytesCaptured += stats.byteCount;

      // Get flow key from database or cache
      const flowKey = this.parseFlowId(flowId);
      if (flowKey) {
        // IP stats
        for (const ip of [flowKey.sourceIP, flowKey.destinationIP]) {
          const existing = ipStats.get(ip) || { packets: 0, bytes: 0, asSource: ip === flowKey.sourceIP };
          existing.packets += stats.packetCount;
          existing.bytes += stats.byteCount;
          ipStats.set(ip, existing);
        }

        // Port stats
        const portKey = `${flowKey.destinationPort}:${flowKey.protocol}`;
        const existingPort = portStats.get(portKey) || { 
          port: flowKey.destinationPort, 
          protocol: flowKey.protocol, 
          packets: 0 
        };
        existingPort.packets += stats.packetCount;
        portStats.set(portKey, existingPort);

        // Protocol detection (simplified - would need to track per-flow)
        l4Counts[flowKey.protocol] = (l4Counts[flowKey.protocol] || 0) + 1;
      }
    }

    // Get recent flows from database
    const recentFlows: PacketIntelligenceSnapshot["recentFlows"] = [];
    if (this.packetDb && this.sessionId) {
      const dbFlows = this.packetDb.getFlowsBySession(this.sessionId, 20);
      for (const f of dbFlows) {
        recentFlows.push({
          id: f.id,
          protocol: f.protocol,
          source: `${f.sourceIP}:${f.sourcePort}`,
          destination: `${f.destinationIP}:${f.destinationPort}`,
          l7Protocol: f.l7Protocol,
          packetCount: f.packetCount,
          byteCount: f.byteCount,
          durationMs: f.durationMs,
          state: f.tcpState || "UNKNOWN",
        });
      }

      // Get L7 stats from database
      const stats = this.packetDb.getProtocolStatistics(this.sessionId);
      dnsCount = stats.l7Counts["DNS"] || 0;
      httpCount = stats.l7Counts["HTTP"] || 0;
      tlsCount = stats.l7Counts["TLS"] || 0;
    }

    // Calculate performance metrics
    const durationMs = this.sessionStartedAt 
      ? now.getTime() - this.sessionStartedAt.getTime() 
      : 0;
    const pps = durationMs > 0 ? Math.round(packetsCaptured / (durationMs / 1000)) : 0;
    const bps = durationMs > 0 ? Math.round((bytesCaptured * 8) / (durationMs / 1000)) : 0;

    // Top talkers
    const sortedIPs = Array.from(ipStats.entries())
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .slice(0, 10);
    
    const topSourceIPs = sortedIPs
      .filter(([_, s]) => s.asSource)
      .map(([ip, s]) => ({ ip, packets: s.packets, bytes: s.bytes }));
    
    const topDestinationIPs = sortedIPs
      .filter(([_, s]) => !s.asSource)
      .map(([ip, s]) => ({ ip, packets: s.packets, bytes: s.bytes }));

    // Top ports with service names
    const sortedPorts = Array.from(portStats.values())
      .sort((a, b) => b.packets - a.packets)
      .slice(0, 10)
      .map((p) => ({
        ...p,
        service: WELL_KNOWN_PORTS[p.port],
      }));

    return {
      generatedAt: now,
      sessionActive: this.sessionId !== null,
      sessionId: this.sessionId || undefined,
      captureInterface: this.config.targetInterface,
      captureMode: this.config.captureMode,
      packetsCaptured,
      bytesCaptured,
      flowsTracked: flows.length,
      activeFlows: activeFlows.length,
      terminatedFlows: terminatedFlows.length,
      protocolStats: {
        l2: l2Counts,
        l3: l3Counts,
        l4: l4Counts,
        l7: l7Counts,
      },
      topSourceIPs,
      topDestinationIPs,
      topPorts: sortedPorts,
      recentFlows,
      dnsQueries: dnsCount,
      httpRequests: httpCount,
      tlsHandshakes: tlsCount,
      anomalyCount: this.alerts.filter((a) => a.category === "ANOMALY").length,
      alerts: this.alerts.slice(-20), // Last 20 alerts
      captureDurationMs: durationMs,
      packetsPerSecond: pps,
      bitsPerSecond: bps,
    };
  }

  /**
   * Get detailed flow information
   */
  getFlowDetail(flowId: string): FlowDetail | null {
    const stats = this.activeFlows.get(flowId);
    if (!stats) {
      // Try database
      if (this.packetDb) {
        const dbFlow = this.packetDb.getFlow(flowId);
        if (dbFlow) {
          return this.buildFlowDetailFromRecord(dbFlow);
        }
      }
      return null;
    }

    // Build from memory
    return {
      id: flowId,
      sessionId: this.sessionId || "unknown",
      key: this.parseFlowId(flowId) || {
        protocol: "TCP",
        sourceIP: "unknown",
        sourcePort: 0,
        destinationIP: "unknown",
        destinationPort: 0,
      },
      stats,
      protocols: {
        l2: "ETHERNET_II",
        l3: "IPv4",
        l4: stats.tcpState ? "TCP" : "UDP",
      },
      timeline: [
        { timestamp: stats.startTime, event: "flow_start", details: {} },
        { timestamp: stats.lastSeen, event: "last_activity", details: { packets: stats.packetCount } },
      ],
    };
  }

  /**
   * List active flows
   */
  listFlows(limit = 100): Array<{ 
    id: string; 
    key: FlowKey; 
    stats: FlowStats;
    l7Protocol?: string;
  }> {
    const flows: Array<{ id: string; key: FlowKey; stats: FlowStats; l7Protocol?: string }> = [];
    
    for (const [id, stats] of this.activeFlows.entries()) {
      const key = this.parseFlowId(id);
      if (key) {
        flows.push({ id, key, stats });
      }
    }

    // Sort by last seen (most recent first)
    flows.sort((a, b) => b.stats.lastSeen.getTime() - a.stats.lastSeen.getTime());
    
    return flows.slice(0, limit);
  }

  /**
   * Get protocol statistics
   */
  getProtocolStatistics(): ProtocolStatistics | null {
    if (!this.packetDb || !this.sessionId) return null;
    return this.packetDb.getProtocolStatistics(this.sessionId);
  }

  /**
   * Get DNS queries
   */
  getDNSQueries(limit = 100): DNSQueryRecord[] {
    if (!this.packetDb || !this.sessionId) return [];
    return this.packetDb.getDNSQueries(this.sessionId, limit);
  }

  /**
   * Get HTTP transactions
   */
  getHTTPTransactions(limit = 100): HTTPTransactionRecord[] {
    if (!this.packetDb || !this.sessionId) return [];
    return this.packetDb.getHTTPTransactions(this.sessionId, limit);
  }

  /**
   * Get TLS handshakes
   */
  getTLSHandshakes(limit = 100): TLSHandshakeRecord[] {
    if (!this.packetDb || !this.sessionId) return [];
    return this.packetDb.getTLSHandshakes(this.sessionId, limit);
  }

  /**
   * Register event handler
   */
  onEvent(handler: (event: PacketCaptureEvent) => void): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx > -1) this.eventHandlers.splice(idx, 1);
    };
  }

  /**
   * Register alert handler
   */
  onAlert(handler: (alert: PacketIntelligenceAlert) => void): () => void {
    this.alertHandlers.push(handler);
    return () => {
      const idx = this.alertHandlers.indexOf(handler);
      if (idx > -1) this.alertHandlers.splice(idx, 1);
    };
  }

  /**
   * Get current alerts
   */
  getAlerts(severity?: "INFO" | "WARNING" | "CRITICAL"): PacketIntelligenceAlert[] {
    if (severity) {
      return this.alerts.filter((a) => a.severity === severity);
    }
    return [...this.alerts];
  }

  /**
   * Clear alerts
   */
  clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * Get capture configuration
   */
  getConfig(): PacketIntelligenceConfig {
    return { ...this.config };
  }

  /**
   * Update capture configuration (requires restart if capture is active)
   */
  updateConfig(config: Partial<PacketIntelligenceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // Private methods

  private async handlePacketEvent(event: PacketCaptureEvent): Promise<void> {
    // Forward to registered handlers
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error("Event handler error:", error);
      }
    }

    // Process based on event type
    switch (event.type) {
      case "packet":
        await this.processPacket(event);
        break;
      case "flow_start":
        await this.processFlowStart(event);
        break;
      case "flow_update":
        await this.processFlowUpdate(event);
        break;
      case "flow_end":
        await this.processFlowEnd(event);
        break;
    }
  }

  private async processPacket(event: PacketCaptureEvent): Promise<void> {
    if (!event.packet || !this.sessionId) return;

    const packet = event.packet;
    const flowKey = event.flowKey;

    // Deep inspection
    if (this.config.enableDeepInspection) {
      await this.performDeepInspection(packet, flowKey);
    }

    // Anomaly detection
    if (this.config.enableAnomalyDetection) {
      this.detectAnomalies(packet, flowKey);
    }

    // Store in database
    if (this.packetDb && flowKey) {
      const flowId = createFlowId(flowKey);
      
      // Check if this is a new flow or existing
      const existingStats = this.activeFlows.get(flowId);
      if (existingStats) {
        // Update existing flow
        const record = this.buildFlowRecord(flowId, flowKey, existingStats, packet);
        this.packetDb.createOrUpdateFlow(record);
      }

      // Store event
      this.packetDb.insertEvent({
        id: crypto.randomUUID(),
        sessionId: this.sessionId,
        timestamp: packet.raw.timestamp,
        eventType: "packet",
        flowId,
        eventData: {
          packetLength: packet.raw.originalLength,
          protocols: packet.protocols,
          hasPayload: packet.payloadLength > 0,
        },
        protocol: flowKey.protocol,
        sourceIP: flowKey.sourceIP,
        destinationIP: flowKey.destinationIP,
        l7Protocol: packet.protocols.l7,
      });
    }
  }

  private async processFlowStart(event: PacketCaptureEvent): Promise<void> {
    if (!event.flowKey || !this.sessionId) return;

    const flowId = createFlowId(event.flowKey);
    
    // Store event
    if (this.packetDb) {
      this.packetDb.insertEvent({
        id: crypto.randomUUID(),
        sessionId: this.sessionId,
        timestamp: event.timestamp,
        eventType: "flow_start",
        flowId,
        eventData: {
          flowKey: event.flowKey,
          initialStats: event.flowStats,
        },
        protocol: event.flowKey.protocol,
        sourceIP: event.flowKey.sourceIP,
        destinationIP: event.flowKey.destinationIP,
      });
    }
  }

  private async processFlowUpdate(event: PacketCaptureEvent): Promise<void> {
    if (!event.flowKey || !event.flowStats || !this.sessionId) return;

    const flowId = createFlowId(event.flowKey);

    // Check for anomalies in flow behavior
    if (this.config.enableAnomalyDetection) {
      this.checkFlowAnomalies(flowId, event.flowKey, event.flowStats);
    }

    // Store event
    if (this.packetDb) {
      this.packetDb.insertEvent({
        id: crypto.randomUUID(),
        sessionId: this.sessionId,
        timestamp: event.timestamp,
        eventType: "flow_update",
        flowId,
        eventData: {
          packetCount: event.flowStats.packetCount,
          byteCount: event.flowStats.byteCount,
          tcpState: event.flowStats.tcpState,
        },
        protocol: event.flowKey.protocol,
        sourceIP: event.flowKey.sourceIP,
        destinationIP: event.flowKey.destinationIP,
      });
    }
  }

  private async processFlowEnd(event: PacketCaptureEvent): Promise<void> {
    if (!event.flowKey || !this.sessionId) return;

    const flowId = createFlowId(event.flowKey);
    this.activeFlows.delete(flowId);

    // Store event
    if (this.packetDb) {
      this.packetDb.insertEvent({
        id: crypto.randomUUID(),
        sessionId: this.sessionId,
        timestamp: event.timestamp,
        eventType: "flow_end",
        flowId,
        eventData: {
          flowKey: event.flowKey,
          finalStats: event.flowStats,
        },
        protocol: event.flowKey.protocol,
        sourceIP: event.flowKey.sourceIP,
        destinationIP: event.flowKey.destinationIP,
      });
    }
  }

  private async performDeepInspection(
    packet: ParsedPacket, 
    flowKey: FlowKey | undefined
  ): Promise<void> {
    if (!flowKey || !this.sessionId) return;

    const flowId = createFlowId(flowKey);

    // DNS inspection
    if (packet.dns && this.config.trackDNSQueries) {
      await this.inspectDNS(packet.dns, flowKey, flowId, packet.raw.timestamp);
    }

    // HTTP inspection
    if (packet.http && this.config.trackHTTPTransactions) {
      await this.inspectHTTP(packet.http, flowKey, flowId, packet.raw.timestamp);
    }

    // TLS inspection
    if (packet.tls && this.config.enableTLSFingerprinting) {
      await this.inspectTLS(packet.tls, flowKey, flowId, packet.raw.timestamp);
    }
  }

  private async inspectDNS(
    dns: NonNullable<ParsedPacket["dns"]>,
    flowKey: FlowKey,
    flowId: string,
    timestamp: Date
  ): Promise<void> {
    if (!this.packetDb) return;

    const queryTypeNames: Record<number, string> = {
      1: "A",
      2: "NS",
      5: "CNAME",
      6: "SOA",
      12: "PTR",
      15: "MX",
      16: "TXT",
      28: "AAAA",
      33: "SRV",
      35: "NAPTR",
      43: "DS",
      46: "RRSIG",
      47: "NSEC",
      48: "DNSKEY",
      50: "NSEC3",
      52: "TLSA",
      255: "ANY",
      256: "URI",
      257: "CAA",
    };

    for (const question of dns.questions) {
      const record: DNSQueryRecord = {
        id: crypto.randomUUID(),
        sessionId: this.sessionId!,
        timestamp,
        transactionId: dns.transactionId,
        queryName: question.name,
        queryType: question.type,
        queryTypeName: queryTypeNames[question.type] || `TYPE${question.type}`,
        queryClass: question.class === 1 ? "IN" : String(question.class),
        sourceIP: flowKey.sourceIP,
        sourcePort: flowKey.sourcePort,
        destinationIP: flowKey.destinationIP,
        destinationPort: flowKey.destinationPort,
        authoritative: dns.flags.aa,
        truncated: dns.flags.tc,
        recursionDesired: dns.flags.rd,
      };

      // If this is a response, calculate latency
      if (dns.flags.qr) {
        const pending = this.pendingDNSQueries.get(dns.transactionId);
        if (pending && pending.destinationIP === flowKey.sourceIP) {
          record.latencyMs = timestamp.getTime() - pending.timestamp.getTime();
          record.responseTimestamp = timestamp;
          record.responseCode = dns.flags.rcode;
          record.responseCodeName = this.getDNSResponseCodeName(dns.flags.rcode);
          record.answers = JSON.stringify(dns.answers.map((a) => ({
            name: a.name,
            type: a.type,
            data: a.rdataString || "unknown",
          })));
        }
      } else {
        // Store pending query
        this.pendingDNSQueries.set(dns.transactionId, {
          timestamp,
          sourceIP: flowKey.sourceIP,
          destinationIP: flowKey.destinationIP,
          queryName: question.name,
        });
        
        // Clean up old pending queries
        this.cleanupPendingDNS();
      }

      this.packetDb.insertDNSQuery(record);
    }
  }

  private async inspectHTTP(
    http: NonNullable<ParsedPacket["http"]>,
    flowKey: FlowKey,
    flowId: string,
    timestamp: Date
  ): Promise<void> {
    if (!this.packetDb) return;

    if (http.isRequest) {
      // Store pending request
      const requestKey = `${flowId}:${http.method}:${http.url}`;
      this.pendingHTTPRequests.set(requestKey, {
        timestamp,
        method: http.method || "UNKNOWN",
        url: http.url || "/",
        flowId,
      });

      // Clean up old pending requests
      this.cleanupPendingHTTP();

      // Store request immediately
      const record: HTTPTransactionRecord = {
        id: crypto.randomUUID(),
        sessionId: this.sessionId!,
        flowId,
        requestTimestamp: timestamp,
        method: http.method || "UNKNOWN",
        url: http.url || "/",
        host: http.headers["host"],
        httpVersion: http.version || "HTTP/1.1",
        requestHeaders: JSON.stringify(http.headers),
        requestBodyLength: http.bodyLength,
        sourceIP: flowKey.sourceIP,
        sourcePort: flowKey.sourcePort,
        destinationIP: flowKey.destinationIP,
        destinationPort: flowKey.destinationPort,
      };

      this.packetDb.insertHTTPTransaction(record);
    } else {
      // Response - try to match with request
      const requestKey = `${flowId}:*:*`; // Match any request from this flow
      for (const [key, pending] of this.pendingHTTPRequests.entries()) {
        if (key.startsWith(`${flowId}:`)) {
          const latencyMs = timestamp.getTime() - pending.timestamp.getTime();
          
          // Update the record (would need ID tracking for proper update)
          // For now, store as new record with response data
          const record: HTTPTransactionRecord = {
            id: crypto.randomUUID(),
            sessionId: this.sessionId!,
            flowId,
            requestTimestamp: pending.timestamp,
            method: pending.method,
            url: pending.url,
            httpVersion: http.version || "HTTP/1.1",
            requestHeaders: JSON.stringify(http.headers), // Response headers
            requestBodyLength: 0,
            responseTimestamp: timestamp,
            statusCode: http.statusCode,
            statusText: http.statusText,
            responseHeaders: JSON.stringify(http.headers),
            responseBodyLength: http.bodyLength,
            latencyMs,
            sourceIP: flowKey.destinationIP, // Swapped for response
            sourcePort: flowKey.destinationPort,
            destinationIP: flowKey.sourceIP,
            destinationPort: flowKey.sourcePort,
          };

          this.packetDb.insertHTTPTransaction(record);
          this.pendingHTTPRequests.delete(key);
          break;
        }
      }
    }
  }

  private async inspectTLS(
    tls: NonNullable<ParsedPacket["tls"]>,
    flowKey: FlowKey,
    flowId: string,
    timestamp: Date
  ): Promise<void> {
    if (!this.packetDb || !tls.handshake) return;

    const record: TLSHandshakeRecord = {
      id: crypto.randomUUID(),
      sessionId: this.sessionId!,
      flowId,
      timestamp,
      handshakeType: tls.handshake.type,
      tlsVersion: tls.version,
      sni: tls.sni,
      cipherSuites: tls.handshake.cipherSuites 
        ? JSON.stringify(tls.handshake.cipherSuites) 
        : undefined,
      selectedCipherSuite: undefined, // Server Hello only
      alpn: tls.alpn ? JSON.stringify(tls.alpn) : undefined,
      supportedVersions: undefined,
      sourceIP: flowKey.sourceIP,
      sourcePort: flowKey.sourcePort,
      destinationIP: flowKey.destinationIP,
      destinationPort: flowKey.destinationPort,
      ja3Fingerprint: tls.ja3Fingerprint,
      ja3sFingerprint: tls.ja3sFingerprint,
    };

    this.packetDb.insertTLSHandshake(record);
  }

  private detectAnomalies(packet: ParsedPacket, flowKey: FlowKey | undefined): void {
    if (!flowKey) return;

    const flowId = createFlowId(flowKey);

    // Check for port scanning (many SYNs, few ACKs)
    if (packet.tcp?.flags.syn && !packet.tcp.flags.ack) {
      const synCount = this.anomalyCounters.get(`syn:${flowKey.sourceIP}`) || 0;
      this.anomalyCounters.set(`syn:${flowKey.sourceIP}`, synCount + 1);

      if (synCount > 100) {
        this.raiseAlert({
          id: crypto.randomUUID(),
          timestamp: new Date(),
          severity: "WARNING",
          category: "SECURITY",
          title: "Potential Port Scan Detected",
          detail: `Host ${flowKey.sourceIP} has sent ${synCount} SYN packets without completing handshakes`,
          flowId,
          relatedIPs: [flowKey.sourceIP],
        });
      }
    }

    // Check for large packet sizes (potential fragmentation attack)
    if (packet.raw.originalLength > 9000) {
      this.raiseAlert({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        severity: "WARNING",
        category: "SECURITY",
        title: "Oversized Packet Detected",
        detail: `Packet size ${packet.raw.originalLength} bytes exceeds typical MTU`,
        flowId,
        relatedIPs: [flowKey.sourceIP, flowKey.destinationIP],
      });
    }

    // Check for uncommon L7 protocols on standard ports
    if (flowKey.destinationPort === 80 && packet.protocols.l7 !== "HTTP" && packet.payloadLength > 0) {
      this.raiseAlert({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        severity: "INFO",
        category: "PROTOCOL",
        title: "Non-HTTP Traffic on Port 80",
        detail: `Detected ${packet.protocols.l7 || "unknown"} protocol on HTTP port`,
        flowId,
        relatedPorts: [80],
      });
    }

    if (flowKey.destinationPort === 443 && packet.protocols.l7 !== "TLS" && packet.payloadLength > 0) {
      this.raiseAlert({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        severity: "INFO",
        category: "PROTOCOL",
        title: "Non-TLS Traffic on Port 443",
        detail: `Detected ${packet.protocols.l7 || "unknown"} protocol on HTTPS port`,
        flowId,
        relatedPorts: [443],
      });
    }
  }

  private checkFlowAnomalies(flowId: string, flowKey: FlowKey, stats: FlowStats): void {
    // Check for high packet rate
    const durationSec = (stats.lastSeen.getTime() - stats.startTime.getTime()) / 1000;
    const pps = durationSec > 0 ? stats.packetCount / durationSec : 0;

    if (pps > 10000) {
      this.raiseAlert({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        severity: "WARNING",
        category: "PERFORMANCE",
        title: "High Packet Rate Flow",
        detail: `Flow ${flowKey.sourceIP}:${flowKey.sourcePort} -> ${flowKey.destinationIP}:${flowKey.destinationPort} at ${Math.round(pps)} pps`,
        flowId,
        relatedIPs: [flowKey.sourceIP, flowKey.destinationIP],
        relatedPorts: [flowKey.sourcePort, flowKey.destinationPort],
      });
    }

    // Check for excessive retransmissions
    if (stats.retransmits > stats.packetCount * 0.1) {
      this.raiseAlert({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        severity: "WARNING",
        category: "PERFORMANCE",
        title: "High Retransmission Rate",
        detail: `Flow has ${stats.retransmits} retransmissions out of ${stats.packetCount} packets`,
        flowId,
        relatedIPs: [flowKey.sourceIP, flowKey.destinationIP],
      });
    }

    // Check for long-lived flows
    if (durationSec > 3600 && stats.tcpState === "ESTABLISHED") {
      this.raiseAlert({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        severity: "INFO",
        category: "ANOMALY",
        title: "Long-Lived Connection",
        detail: `Flow has been active for ${Math.round(durationSec / 60)} minutes`,
        flowId,
        relatedIPs: [flowKey.sourceIP, flowKey.destinationIP],
      });
    }
  }

  private raiseAlert(alert: PacketIntelligenceAlert): void {
    // Deduplicate alerts (same title within 1 minute)
    const recentDuplicate = this.alerts.find(
      (a) => a.title === alert.title && 
             Date.now() - a.timestamp.getTime() < 60000
    );
    
    if (recentDuplicate) return;

    this.alerts.push(alert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }

    // Notify handlers
    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (error) {
        console.error("Alert handler error:", error);
      }
    }

    // Store in database
    if (this.packetDb && this.sessionId) {
      this.packetDb.insertEvent({
        id: alert.id,
        sessionId: this.sessionId,
        timestamp: alert.timestamp,
        eventType: "anomaly",
        flowId: alert.flowId,
        eventData: {
          category: alert.category,
          title: alert.title,
          detail: alert.detail,
        },
        protocol: undefined,
        sourceIP: alert.relatedIPs?.[0],
        destinationIP: alert.relatedIPs?.[1],
        severity: alert.severity,
      });
    }
  }

  private buildFlowRecord(
    flowId: string,
    flowKey: FlowKey,
    stats: FlowStats,
    packet: ParsedPacket
  ): PacketFlowRecord {
    return {
      id: flowId,
      sessionId: this.sessionId!,
      captureInterface: this.config.targetInterface,
      captureStartedAt: this.sessionStartedAt!,
      protocol: flowKey.protocol,
      sourceIP: flowKey.sourceIP,
      sourcePort: flowKey.sourcePort,
      destinationIP: flowKey.destinationIP,
      destinationPort: flowKey.destinationPort,
      l2Protocol: packet.protocols.l2,
      l3Protocol: packet.protocols.l3,
      l4Protocol: packet.protocols.l4,
      l7Protocol: packet.protocols.l7,
      sourceMAC: packet.ethernet?.sourceMAC,
      destinationMAC: packet.ethernet?.destinationMAC,
      vlanIds: packet.vlan?.map((v) => v.vlanId),
      packetCount: stats.packetCount,
      byteCount: stats.byteCount,
      payloadBytes: packet.payloadLength,
      synCount: stats.synCount,
      finCount: stats.finCount,
      rstCount: stats.rstCount,
      retransmitCount: stats.retransmits,
      outOfOrderCount: stats.outOfOrder,
      tcpState: stats.tcpState,
      initialSeqNumber: packet.tcp?.sequenceNumber,
      finalSeqNumber: undefined,
      mss: packet.tcp?.mss,
      windowScale: packet.tcp?.windowScale,
      sackPermitted: packet.tcp?.sackPermitted,
      firstSeenAt: stats.startTime,
      lastSeenAt: stats.lastSeen,
      durationMs: stats.lastSeen.getTime() - stats.startTime.getTime(),
      hasHTTP: !!packet.http,
      hasDNS: !!packet.dns,
      hasTLS: !!packet.tls,
      httpSummary: packet.http 
        ? `${packet.http.method || "RESPONSE"} ${packet.http.url || packet.http.statusCode}` 
        : undefined,
      dnsQueryNames: packet.dns?.questions.map((q) => q.name).join(", "),
      tlsSNI: packet.tls?.sni,
      tlsVersion: packet.tls?.version,
      terminated: stats.tcpState === "CLOSED",
      terminationReason: stats.rstCount > 0 ? "RST" : stats.finCount > 0 ? "FIN" : undefined,
    };
  }

  private buildFlowDetailFromRecord(record: PacketFlowRecord): FlowDetail {
    return {
      id: record.id,
      sessionId: record.sessionId,
      key: {
        protocol: record.protocol as FlowKey["protocol"],
        sourceIP: record.sourceIP,
        sourcePort: record.sourcePort,
        destinationIP: record.destinationIP,
        destinationPort: record.destinationPort,
      },
      stats: {
        packetCount: record.packetCount,
        byteCount: record.byteCount,
        synCount: record.synCount,
        finCount: record.finCount,
        rstCount: record.rstCount,
        retransmits: record.retransmitCount,
        outOfOrder: record.outOfOrderCount,
        startTime: record.firstSeenAt,
        lastSeen: record.lastSeenAt,
        tcpState: record.tcpState as FlowStats["tcpState"],
      },
      protocols: {
        l2: record.l2Protocol,
        l3: record.l3Protocol,
        l4: record.l4Protocol,
        l7: record.l7Protocol,
      },
      ethernet: record.sourceMAC ? {
        sourceMAC: record.sourceMAC,
        destinationMAC: record.destinationMAC || "unknown",
        vlanIds: record.vlanIds,
      } : undefined,
      l7Data: record.hasHTTP || record.hasDNS || record.hasTLS ? {
        httpTransactions: record.hasHTTP ? 1 : 0,
        dnsQueries: record.hasDNS ? 1 : 0,
        tlsSNI: record.tlsSNI,
        tlsVersion: record.tlsVersion,
      } : undefined,
      timeline: [
        { timestamp: record.firstSeenAt, event: "flow_start", details: {} },
        { timestamp: record.lastSeenAt, event: "last_activity", details: {} },
      ],
    };
  }

  private parseFlowId(flowId: string): FlowKey | null {
    // Flow ID format: flow-<hash>-<timestamp>
    // We can't easily reverse this, so we rely on the database
    if (!this.packetDb) return null;
    
    const record = this.packetDb.getFlow(flowId);
    if (!record) return null;

    return {
      protocol: record.protocol as FlowKey["protocol"],
      sourceIP: record.sourceIP,
      sourcePort: record.sourcePort,
      destinationIP: record.destinationIP,
      destinationPort: record.destinationPort,
    };
  }

  private cleanupPendingDNS(): void {
    const cutoff = Date.now() - 30000; // 30 seconds
    for (const [id, pending] of this.pendingDNSQueries.entries()) {
      if (pending.timestamp.getTime() < cutoff) {
        this.pendingDNSQueries.delete(id);
      }
    }
  }

  private cleanupPendingHTTP(): void {
    const cutoff = Date.now() - 60000; // 60 seconds
    for (const [key, pending] of this.pendingHTTPRequests.entries()) {
      if (pending.timestamp.getTime() < cutoff) {
        this.pendingHTTPRequests.delete(key);
      }
    }
  }

  private getDNSResponseCodeName(rcode: number): string {
    const names: Record<number, string> = {
      0: "NOERROR",
      1: "FORMERR",
      2: "SERVFAIL",
      3: "NXDOMAIN",
      4: "NOTIMP",
      5: "REFUSED",
      6: "YXDOMAIN",
      7: "YXRRSET",
      8: "NXRRSET",
      9: "NOTAUTH",
      10: "NOTZONE",
    };
    return names[rcode] || `RCODE${rcode}`;
  }
}

// Convenience function to create engine
export function createPacketIntelligenceEngine(
  db?: SQLiteDatabase,
  config?: Partial<PacketIntelligenceConfig>
): PacketIntelligenceEngine {
  return new PacketIntelligenceEngine(db, config);
}

// Export types
export type {
  PacketCaptureEvent,
  PacketIntelligenceConfig,
  PacketIntelligenceSnapshot,
  PacketIntelligenceAlert,
  FlowDetail,
};
