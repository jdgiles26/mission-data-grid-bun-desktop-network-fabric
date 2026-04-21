// Phase 2: Packet Capture Database Schema
// Storage for packet flows, protocol analysis, and deep visibility data

import type { Database as SQLiteDatabase } from "bun:sqlite";
import type { 
  ParsedPacket, 
  FlowKey, 
  FlowStats, 
  ProtocolDetection,
  HTTPData,
  DNSData,
  TLSData,
  TCPHeader,
  UDPHeader,
} from "./packet-capture";

// Database record types
export interface PacketFlowRecord {
  id: string;
  sessionId: string;
  captureInterface: string;
  captureStartedAt: Date;
  
  // Flow 5-tuple
  protocol: string;
  sourceIP: string;
  sourcePort: number;
  destinationIP: string;
  destinationPort: number;
  
  // Protocol stack
  l2Protocol: string;
  l3Protocol: string;
  l4Protocol: string;
  l7Protocol?: string;
  
  // Ethernet info
  sourceMAC?: string;
  destinationMAC?: string;
  vlanIds?: number[];
  
  // Flow statistics
  packetCount: number;
  byteCount: number;
  payloadBytes: number;
  synCount: number;
  finCount: number;
  rstCount: number;
  retransmitCount: number;
  outOfOrderCount: number;
  
  // TCP-specific
  tcpState?: string;
  initialSeqNumber?: number;
  finalSeqNumber?: number;
  mss?: number;
  windowScale?: number;
  sackPermitted?: boolean;
  
  // Timing
  firstSeenAt: Date;
  lastSeenAt: Date;
  durationMs: number;
  
  // Flags
  hasHTTP: boolean;
  hasDNS: boolean;
  hasTLS: boolean;
  
  // L7 info (JSON)
  httpSummary?: string;
  dnsQueryNames?: string;
  tlsSNI?: string;
  tlsVersion?: string;
  
  // Metadata
  terminated: boolean;
  terminationReason?: string;
}

export interface PacketEventRecord {
  id: string;
  sessionId: string;
  timestamp: Date;
  eventType: "packet" | "flow_start" | "flow_update" | "flow_end" | "anomaly" | "protocol_detected";
  
  // Reference to flow (if applicable)
  flowId?: string;
  
  // Event data (JSON)
  eventData: Record<string, unknown>;
  
  // Quick lookup fields
  protocol?: string;
  sourceIP?: string;
  destinationIP?: string;
  l7Protocol?: string;
  severity?: "INFO" | "WARNING" | "CRITICAL";
}

export interface ProtocolStatistics {
  captureSessionId: string;
  generatedAt: Date;
  
  // Packet counts by protocol layer
  l2Counts: Record<string, number>;
  l3Counts: Record<string, number>;
  l4Counts: Record<string, number>;
  l7Counts: Record<string, number>;
  
  // Top talkers
  topSourceIPs: Array<{ ip: string; packets: number; bytes: number }>;
  topDestinationIPs: Array<{ ip: string; packets: number; bytes: number }>;
  topSourcePorts: Array<{ port: number; protocol: string; packets: number }>;
  topDestinationPorts: Array<{ port: number; protocol: string; packets: number }>;
  
  // Traffic distribution
  totalPackets: number;
  totalBytes: number;
  avgPacketSize: number;
  pps: number; // packets per second
  bps: number; // bits per second
  
  // Time window
  windowStart: Date;
  windowEnd: Date;
}

export interface CaptureSessionRecord {
  id: string;
  interfaceName: string;
  config: string; // JSON
  startedAt: Date;
  endedAt?: Date;
  status: "running" | "paused" | "stopped" | "error";
  errorMessage?: string;
  
  // Statistics
  totalPackets: number;
  totalBytes: number;
  uniqueFlows: number;
  activeFlows: number;
  terminatedFlows: number;
  
  // BPF filter (if any)
  bpfFilter?: string;
}

export interface DNSQueryRecord {
  id: string;
  sessionId: string;
  timestamp: Date;
  
  // Query info
  transactionId: number;
  queryName: string;
  queryType: number;
  queryTypeName: string;
  queryClass: string;
  
  // Source/dest
  sourceIP: string;
  sourcePort: number;
  destinationIP: string;
  destinationPort: number;
  
  // Response (if captured)
  responseTimestamp?: Date;
  responseCode?: number;
  responseCodeName?: string;
  answers?: string; // JSON array
  authoritative: boolean;
  truncated: boolean;
  recursionDesired: boolean;
  
  // Timing
  latencyMs?: number;
}

export interface HTTPTransactionRecord {
  id: string;
  sessionId: string;
  flowId: string;
  
  // Request
  requestTimestamp: Date;
  method: string;
  url: string;
  host?: string;
  httpVersion: string;
  requestHeaders: string; // JSON
  requestBodyLength: number;
  
  // Response (if captured)
  responseTimestamp?: Date;
  statusCode?: number;
  statusText?: string;
  responseHeaders?: string; // JSON
  responseBodyLength?: number;
  
  // Timing
  latencyMs?: number;
  
  // Connection info
  sourceIP: string;
  sourcePort: number;
  destinationIP: string;
  destinationPort: number;
}

export interface TLSHandshakeRecord {
  id: string;
  sessionId: string;
  flowId: string;
  timestamp: Date;
  
  // Handshake type
  handshakeType: "client_hello" | "server_hello" | "certificate" | "key_exchange" | "finished";
  tlsVersion: string;
  
  // SNI (Client Hello only)
  sni?: string;
  
  // Cipher suites
  cipherSuites?: string; // JSON array
  selectedCipherSuite?: string;
  
  // Extensions
  alpn?: string; // JSON array
  supportedVersions?: string; // JSON array
  
  // Connection info
  sourceIP: string;
  sourcePort: number;
  destinationIP: string;
  destinationPort: number;
  
  // Fingerprints
  ja3Fingerprint?: string;
  ja3sFingerprint?: string;
}

/**
 * Initialize packet capture database tables
 */
export function initializePacketTables(db: SQLiteDatabase): void {
  // Capture sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS capture_sessions (
      id TEXT PRIMARY KEY,
      interface_name TEXT NOT NULL,
      config TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      total_packets INTEGER DEFAULT 0,
      total_bytes INTEGER DEFAULT 0,
      unique_flows INTEGER DEFAULT 0,
      active_flows INTEGER DEFAULT 0,
      terminated_flows INTEGER DEFAULT 0,
      bpf_filter TEXT
    );
  `);

  // Packet flows table
  db.exec(`
    CREATE TABLE IF NOT EXISTS packet_flows (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      capture_interface TEXT NOT NULL,
      capture_started_at TEXT NOT NULL,
      protocol TEXT NOT NULL,
      source_ip TEXT NOT NULL,
      source_port INTEGER NOT NULL,
      destination_ip TEXT NOT NULL,
      destination_port INTEGER NOT NULL,
      l2_protocol TEXT NOT NULL,
      l3_protocol TEXT NOT NULL,
      l4_protocol TEXT NOT NULL,
      l7_protocol TEXT,
      source_mac TEXT,
      destination_mac TEXT,
      vlan_ids TEXT,
      packet_count INTEGER DEFAULT 0,
      byte_count INTEGER DEFAULT 0,
      payload_bytes INTEGER DEFAULT 0,
      syn_count INTEGER DEFAULT 0,
      fin_count INTEGER DEFAULT 0,
      rst_count INTEGER DEFAULT 0,
      retransmit_count INTEGER DEFAULT 0,
      out_of_order_count INTEGER DEFAULT 0,
      tcp_state TEXT,
      initial_seq_number INTEGER,
      final_seq_number INTEGER,
      mss INTEGER,
      window_scale INTEGER,
      sack_permitted INTEGER,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      duration_ms INTEGER DEFAULT 0,
      has_http INTEGER DEFAULT 0,
      has_dns INTEGER DEFAULT 0,
      has_tls INTEGER DEFAULT 0,
      http_summary TEXT,
      dns_query_names TEXT,
      tls_sni TEXT,
      tls_version TEXT,
      terminated INTEGER DEFAULT 0,
      termination_reason TEXT
    );
  `);

  // Packet events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS packet_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      flow_id TEXT,
      event_data TEXT NOT NULL,
      protocol TEXT,
      source_ip TEXT,
      destination_ip TEXT,
      l7_protocol TEXT,
      severity TEXT
    );
  `);

  // DNS queries table
  db.exec(`
    CREATE TABLE IF NOT EXISTS dns_queries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      transaction_id INTEGER NOT NULL,
      query_name TEXT NOT NULL,
      query_type INTEGER NOT NULL,
      query_type_name TEXT NOT NULL,
      query_class TEXT NOT NULL,
      source_ip TEXT NOT NULL,
      source_port INTEGER NOT NULL,
      destination_ip TEXT NOT NULL,
      destination_port INTEGER NOT NULL,
      response_timestamp TEXT,
      response_code INTEGER,
      response_code_name TEXT,
      answers TEXT,
      authoritative INTEGER DEFAULT 0,
      truncated INTEGER DEFAULT 0,
      recursion_desired INTEGER DEFAULT 0,
      latency_ms INTEGER
    );
  `);

  // HTTP transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS http_transactions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      flow_id TEXT NOT NULL,
      request_timestamp TEXT NOT NULL,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      host TEXT,
      http_version TEXT NOT NULL,
      request_headers TEXT NOT NULL,
      request_body_length INTEGER DEFAULT 0,
      response_timestamp TEXT,
      status_code INTEGER,
      status_text TEXT,
      response_headers TEXT,
      response_body_length INTEGER,
      latency_ms INTEGER,
      source_ip TEXT NOT NULL,
      source_port INTEGER NOT NULL,
      destination_ip TEXT NOT NULL,
      destination_port INTEGER NOT NULL
    );
  `);

  // TLS handshakes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tls_handshakes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      flow_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      handshake_type TEXT NOT NULL,
      tls_version TEXT NOT NULL,
      sni TEXT,
      cipher_suites TEXT,
      selected_cipher_suite TEXT,
      alpn TEXT,
      supported_versions TEXT,
      source_ip TEXT NOT NULL,
      source_port INTEGER NOT NULL,
      destination_ip TEXT NOT NULL,
      destination_port INTEGER NOT NULL,
      ja3_fingerprint TEXT,
      ja3s_fingerprint TEXT
    );
  `);

  // Create indexes for efficient queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_flows_session ON packet_flows(session_id);
    CREATE INDEX IF NOT EXISTS idx_flows_5tuple ON packet_flows(source_ip, destination_ip, source_port, destination_port, protocol);
    CREATE INDEX IF NOT EXISTS idx_flows_time ON packet_flows(first_seen_at, last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_flows_l7 ON packet_flows(l7_protocol);
    CREATE INDEX IF NOT EXISTS idx_events_session ON packet_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_time ON packet_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_type ON packet_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_dns_session ON dns_queries(session_id);
    CREATE INDEX IF NOT EXISTS idx_dns_name ON dns_queries(query_name);
    CREATE INDEX IF NOT EXISTS idx_dns_time ON dns_queries(timestamp);
    CREATE INDEX IF NOT EXISTS idx_http_session ON http_transactions(session_id);
    CREATE INDEX IF NOT EXISTS idx_http_time ON http_transactions(request_timestamp);
    CREATE INDEX IF NOT EXISTS idx_tls_session ON tls_handshakes(session_id);
    CREATE INDEX IF NOT EXISTS idx_tls_sni ON tls_handshakes(sni);
  `);
}

/**
 * Helper class for packet database operations
 */
export class PacketDatabase {
  constructor(private db: SQLiteDatabase) {}

  // Capture Session Operations

  createSession(record: CaptureSessionRecord): void {
    this.db.prepare(`
      INSERT INTO capture_sessions (
        id, interface_name, config, started_at, status, error_message,
        total_packets, total_bytes, unique_flows, active_flows, terminated_flows, bpf_filter
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.interfaceName,
      record.config,
      record.startedAt.toISOString(),
      record.status,
      record.errorMessage ?? null,
      record.totalPackets,
      record.totalBytes,
      record.uniqueFlows,
      record.activeFlows,
      record.terminatedFlows,
      record.bpfFilter ?? null
    );
  }

  updateSession(id: string, updates: Partial<CaptureSessionRecord>): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }
    if (updates.endedAt !== undefined) {
      fields.push("ended_at = ?");
      values.push(updates.endedAt.toISOString());
    }
    if (updates.errorMessage !== undefined) {
      fields.push("error_message = ?");
      values.push(updates.errorMessage);
    }
    if (updates.totalPackets !== undefined) {
      fields.push("total_packets = ?");
      values.push(updates.totalPackets);
    }
    if (updates.totalBytes !== undefined) {
      fields.push("total_bytes = ?");
      values.push(updates.totalBytes);
    }
    if (updates.uniqueFlows !== undefined) {
      fields.push("unique_flows = ?");
      values.push(updates.uniqueFlows);
    }
    if (updates.activeFlows !== undefined) {
      fields.push("active_flows = ?");
      values.push(updates.activeFlows);
    }
    if (updates.terminatedFlows !== undefined) {
      fields.push("terminated_flows = ?");
      values.push(updates.terminatedFlows);
    }

    if (fields.length === 0) return;

    values.push(id);
    this.db.prepare(`UPDATE capture_sessions SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  }

  getSession(id: string): CaptureSessionRecord | null {
    const row = this.db.prepare(`SELECT * FROM capture_sessions WHERE id = ?`).get(id) as Record<string, unknown> | null;
    return row ? this.mapSessionRow(row) : null;
  }

  getActiveSessions(): CaptureSessionRecord[] {
    const rows = this.db.prepare(`SELECT * FROM capture_sessions WHERE status = 'running'`).all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapSessionRow(r));
  }

  // Flow Operations

  createOrUpdateFlow(record: PacketFlowRecord): void {
    const existing = this.db.prepare(`
      SELECT id FROM packet_flows 
      WHERE session_id = ? AND protocol = ? AND source_ip = ? AND source_port = ? 
      AND destination_ip = ? AND destination_port = ? AND terminated = 0
    `).get(
      record.sessionId,
      record.protocol,
      record.sourceIP,
      record.sourcePort,
      record.destinationIP,
      record.destinationPort
    ) as { id: string } | null;

    if (existing) {
      // Update existing flow
      this.db.prepare(`
        UPDATE packet_flows SET
          packet_count = ?,
          byte_count = ?,
          payload_bytes = ?,
          syn_count = ?,
          fin_count = ?,
          rst_count = ?,
          retransmit_count = ?,
          out_of_order_count = ?,
          tcp_state = ?,
          final_seq_number = ?,
          last_seen_at = ?,
          duration_ms = ?,
          has_http = ?,
          has_dns = ?,
          has_tls = ?,
          http_summary = ?,
          dns_query_names = ?,
          tls_sni = ?,
          tls_version = ?,
          terminated = ?,
          termination_reason = ?
        WHERE id = ?
      `).run(
        record.packetCount,
        record.byteCount,
        record.payloadBytes,
        record.synCount,
        record.finCount,
        record.rstCount,
        record.retransmitCount,
        record.outOfOrderCount,
        record.tcpState ?? null,
        record.finalSeqNumber ?? null,
        record.lastSeenAt.toISOString(),
        record.durationMs,
        record.hasHTTP ? 1 : 0,
        record.hasDNS ? 1 : 0,
        record.hasTLS ? 1 : 0,
        record.httpSummary ?? null,
        record.dnsQueryNames ?? null,
        record.tlsSNI ?? null,
        record.tlsVersion ?? null,
        record.terminated ? 1 : 0,
        record.terminationReason ?? null,
        existing.id
      );
    } else {
      // Insert new flow
      this.db.prepare(`
        INSERT INTO packet_flows (
          id, session_id, capture_interface, capture_started_at, protocol,
          source_ip, source_port, destination_ip, destination_port,
          l2_protocol, l3_protocol, l4_protocol, l7_protocol,
          source_mac, destination_mac, vlan_ids,
          packet_count, byte_count, payload_bytes,
          syn_count, fin_count, rst_count, retransmit_count, out_of_order_count,
          tcp_state, initial_seq_number, mss, window_scale, sack_permitted,
          first_seen_at, last_seen_at, duration_ms,
          has_http, has_dns, has_tls,
          http_summary, dns_query_names, tls_sni, tls_version,
          terminated, termination_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.sessionId,
        record.captureInterface,
        record.captureStartedAt.toISOString(),
        record.protocol,
        record.sourceIP,
        record.sourcePort,
        record.destinationIP,
        record.destinationPort,
        record.l2Protocol,
        record.l3Protocol,
        record.l4Protocol,
        record.l7Protocol ?? null,
        record.sourceMAC ?? null,
        record.destinationMAC ?? null,
        record.vlanIds ? JSON.stringify(record.vlanIds) : null,
        record.packetCount,
        record.byteCount,
        record.payloadBytes,
        record.synCount,
        record.finCount,
        record.rstCount,
        record.retransmitCount,
        record.outOfOrderCount,
        record.tcpState ?? null,
        record.initialSeqNumber ?? null,
        record.mss ?? null,
        record.windowScale ?? null,
        record.sackPermitted ? 1 : 0,
        record.firstSeenAt.toISOString(),
        record.lastSeenAt.toISOString(),
        record.durationMs,
        record.hasHTTP ? 1 : 0,
        record.hasDNS ? 1 : 0,
        record.hasTLS ? 1 : 0,
        record.httpSummary ?? null,
        record.dnsQueryNames ?? null,
        record.tlsSNI ?? null,
        record.tlsVersion ?? null,
        record.terminated ? 1 : 0,
        record.terminationReason ?? null
      );
    }
  }

  getFlow(id: string): PacketFlowRecord | null {
    const row = this.db.prepare(`SELECT * FROM packet_flows WHERE id = ?`).get(id) as Record<string, unknown> | null;
    return row ? this.mapFlowRow(row) : null;
  }

  getFlowsBySession(sessionId: string, limit = 100): PacketFlowRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM packet_flows 
      WHERE session_id = ? 
      ORDER BY last_seen_at DESC 
      LIMIT ?
    `).all(sessionId, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapFlowRow(r));
  }

  getActiveFlows(sessionId: string, limit = 100): PacketFlowRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM packet_flows 
      WHERE session_id = ? AND terminated = 0
      ORDER BY last_seen_at DESC 
      LIMIT ?
    `).all(sessionId, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapFlowRow(r));
  }

  getTopTalkers(sessionId: string, limit = 10): { ip: string; packets: number; bytes: number }[] {
    const rows = this.db.prepare(`
      SELECT 
        CASE WHEN source_ip < destination_ip THEN source_ip ELSE destination_ip END as ip,
        SUM(packet_count) as packets,
        SUM(byte_count) as bytes
      FROM packet_flows
      WHERE session_id = ?
      GROUP BY ip
      ORDER BY bytes DESC
      LIMIT ?
    `).all(sessionId, limit) as Array<{ ip: string; packets: number; bytes: number }>;
    return rows;
  }

  // Event Operations

  insertEvent(record: PacketEventRecord): void {
    this.db.prepare(`
      INSERT INTO packet_events (
        id, session_id, timestamp, event_type, flow_id, event_data,
        protocol, source_ip, destination_ip, l7_protocol, severity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.sessionId,
      record.timestamp.toISOString(),
      record.eventType,
      record.flowId ?? null,
      JSON.stringify(record.eventData),
      record.protocol ?? null,
      record.sourceIP ?? null,
      record.destinationIP ?? null,
      record.l7Protocol ?? null,
      record.severity ?? null
    );
  }

  getEventsBySession(sessionId: string, limit = 500): PacketEventRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM packet_events 
      WHERE session_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(sessionId, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapEventRow(r));
  }

  // DNS Operations

  insertDNSQuery(record: DNSQueryRecord): void {
    this.db.prepare(`
      INSERT INTO dns_queries (
        id, session_id, timestamp, transaction_id, query_name, query_type, query_type_name,
        query_class, source_ip, source_port, destination_ip, destination_port,
        response_timestamp, response_code, response_code_name, answers,
        authoritative, truncated, recursion_desired, latency_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.sessionId,
      record.timestamp.toISOString(),
      record.transactionId,
      record.queryName,
      record.queryType,
      record.queryTypeName,
      record.queryClass,
      record.sourceIP,
      record.sourcePort,
      record.destinationIP,
      record.destinationPort,
      record.responseTimestamp?.toISOString() ?? null,
      record.responseCode ?? null,
      record.responseCodeName ?? null,
      record.answers ?? null,
      record.authoritative ? 1 : 0,
      record.truncated ? 1 : 0,
      record.recursionDesired ? 1 : 0,
      record.latencyMs ?? null
    );
  }

  updateDNSResponse(
    transactionId: number,
    sourceIP: string,
    destinationIP: string,
    updates: Partial<DNSQueryRecord>
  ): void {
    this.db.prepare(`
      UPDATE dns_queries SET
        response_timestamp = ?,
        response_code = ?,
        response_code_name = ?,
        answers = ?,
        authoritative = ?,
        truncated = ?,
        latency_ms = ?
      WHERE transaction_id = ? AND source_ip = ? AND destination_ip = ?
    `).run(
      updates.responseTimestamp?.toISOString() ?? null,
      updates.responseCode ?? null,
      updates.responseCodeName ?? null,
      updates.answers ?? null,
      updates.authoritative ? 1 : 0,
      updates.truncated ? 1 : 0,
      updates.latencyMs ?? null,
      transactionId,
      destinationIP, // Swapped: response comes from destination
      sourceIP
    );
  }

  getDNSQueries(sessionId: string, limit = 100): DNSQueryRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM dns_queries 
      WHERE session_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(sessionId, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapDNSRow(r));
  }

  // HTTP Operations

  insertHTTPTransaction(record: HTTPTransactionRecord): void {
    this.db.prepare(`
      INSERT INTO http_transactions (
        id, session_id, flow_id, request_timestamp, method, url, host, http_version,
        request_headers, request_body_length, response_timestamp, status_code, status_text,
        response_headers, response_body_length, latency_ms,
        source_ip, source_port, destination_ip, destination_port
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.sessionId,
      record.flowId,
      record.requestTimestamp.toISOString(),
      record.method,
      record.url,
      record.host ?? null,
      record.httpVersion,
      record.requestHeaders,
      record.requestBodyLength,
      record.responseTimestamp?.toISOString() ?? null,
      record.statusCode ?? null,
      record.statusText ?? null,
      record.responseHeaders ?? null,
      record.responseBodyLength ?? null,
      record.latencyMs ?? null,
      record.sourceIP,
      record.sourcePort,
      record.destinationIP,
      record.destinationPort
    );
  }

  getHTTPTransactions(sessionId: string, limit = 100): HTTPTransactionRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM http_transactions 
      WHERE session_id = ? 
      ORDER BY request_timestamp DESC 
      LIMIT ?
    `).all(sessionId, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapHTTPRow(r));
  }

  // TLS Operations

  insertTLSHandshake(record: TLSHandshakeRecord): void {
    this.db.prepare(`
      INSERT INTO tls_handshakes (
        id, session_id, flow_id, timestamp, handshake_type, tls_version, sni,
        cipher_suites, selected_cipher_suite, alpn, supported_versions,
        source_ip, source_port, destination_ip, destination_port,
        ja3_fingerprint, ja3s_fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.sessionId,
      record.flowId,
      record.timestamp.toISOString(),
      record.handshakeType,
      record.tlsVersion,
      record.sni ?? null,
      record.cipherSuites ?? null,
      record.selectedCipherSuite ?? null,
      record.alpn ?? null,
      record.supportedVersions ?? null,
      record.sourceIP,
      record.sourcePort,
      record.destinationIP,
      record.destinationPort,
      record.ja3Fingerprint ?? null,
      record.ja3sFingerprint ?? null
    );
  }

  getTLSHandshakes(sessionId: string, limit = 100): TLSHandshakeRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM tls_handshakes 
      WHERE session_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(sessionId, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapTLSRow(r));
  }

  // Statistics

  getProtocolStatistics(sessionId: string): ProtocolStatistics {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // L2 counts
    const l2Rows = this.db.prepare(`
      SELECT l2_protocol, COUNT(*) as count FROM packet_flows 
      WHERE session_id = ? GROUP BY l2_protocol
    `).all(sessionId) as Array<{ l2_protocol: string; count: number }>;

    // L3 counts
    const l3Rows = this.db.prepare(`
      SELECT l3_protocol, COUNT(*) as count FROM packet_flows 
      WHERE session_id = ? GROUP BY l3_protocol
    `).all(sessionId) as Array<{ l3_protocol: string; count: number }>;

    // L4 counts
    const l4Rows = this.db.prepare(`
      SELECT l4_protocol, COUNT(*) as count FROM packet_flows 
      WHERE session_id = ? GROUP BY l4_protocol
    `).all(sessionId) as Array<{ l4_protocol: string; count: number }>;

    // L7 counts
    const l7Rows = this.db.prepare(`
      SELECT l7_protocol, COUNT(*) as count FROM packet_flows 
      WHERE session_id = ? AND l7_protocol IS NOT NULL GROUP BY l7_protocol
    `).all(sessionId) as Array<{ l7_protocol: string; count: number }>;

    // Totals
    const totals = this.db.prepare(`
      SELECT SUM(packet_count) as packets, SUM(byte_count) as bytes,
             MIN(first_seen_at) as window_start, MAX(last_seen_at) as window_end
      FROM packet_flows WHERE session_id = ?
    `).get(sessionId) as { 
      packets: number | null; 
      bytes: number | null;
      window_start: string | null;
      window_end: string | null;
    };

    const totalPackets = totals.packets ?? 0;
    const totalBytes = totals.bytes ?? 0;
    const windowStart = totals.window_start ? new Date(totals.window_start) : fiveMinutesAgo;
    const windowEnd = totals.window_end ? new Date(totals.window_end) : now;
    const durationSec = Math.max(1, (windowEnd.getTime() - windowStart.getTime()) / 1000);

    return {
      captureSessionId: sessionId,
      generatedAt: now,
      l2Counts: Object.fromEntries(l2Rows.map((r) => [r.l2_protocol, r.count])),
      l3Counts: Object.fromEntries(l3Rows.map((r) => [r.l3_protocol, r.count])),
      l4Counts: Object.fromEntries(l4Rows.map((r) => [r.l4_protocol, r.count])),
      l7Counts: Object.fromEntries(l7Rows.map((r) => [r.l7_protocol, r.count])),
      topSourceIPs: this.getTopSourceIPs(sessionId, 10),
      topDestinationIPs: this.getTopDestinationIPs(sessionId, 10),
      topSourcePorts: this.getTopSourcePorts(sessionId, 10),
      topDestinationPorts: this.getTopDestinationPorts(sessionId, 10),
      totalPackets,
      totalBytes,
      avgPacketSize: totalPackets > 0 ? Math.round(totalBytes / totalPackets) : 0,
      pps: Math.round(totalPackets / durationSec),
      bps: Math.round((totalBytes * 8) / durationSec),
      windowStart,
      windowEnd,
    };
  }

  private getTopSourceIPs(sessionId: string, limit: number) {
    const rows = this.db.prepare(`
      SELECT source_ip as ip, SUM(packet_count) as packets, SUM(byte_count) as bytes
      FROM packet_flows WHERE session_id = ?
      GROUP BY source_ip ORDER BY bytes DESC LIMIT ?
    `).all(sessionId, limit) as Array<{ ip: string; packets: number; bytes: number }>;
    return rows;
  }

  private getTopDestinationIPs(sessionId: string, limit: number) {
    const rows = this.db.prepare(`
      SELECT destination_ip as ip, SUM(packet_count) as packets, SUM(byte_count) as bytes
      FROM packet_flows WHERE session_id = ?
      GROUP BY destination_ip ORDER BY bytes DESC LIMIT ?
    `).all(sessionId, limit) as Array<{ ip: string; packets: number; bytes: number }>;
    return rows;
  }

  private getTopSourcePorts(sessionId: string, limit: number) {
    const rows = this.db.prepare(`
      SELECT source_port as port, protocol, SUM(packet_count) as packets
      FROM packet_flows WHERE session_id = ?
      GROUP BY source_port, protocol ORDER BY packets DESC LIMIT ?
    `).all(sessionId, limit) as Array<{ port: number; protocol: string; packets: number }>;
    return rows;
  }

  private getTopDestinationPorts(sessionId: string, limit: number) {
    const rows = this.db.prepare(`
      SELECT destination_port as port, protocol, SUM(packet_count) as packets
      FROM packet_flows WHERE session_id = ?
      GROUP BY destination_port, protocol ORDER BY packets DESC LIMIT ?
    `).all(sessionId, limit) as Array<{ port: number; protocol: string; packets: number }>;
    return rows;
  }

  // Cleanup

  pruneOldData(olderThanDays: number): { flowsDeleted: number; eventsDeleted: number } {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

    const flowsResult = this.db.prepare(`DELETE FROM packet_flows WHERE last_seen_at < ?`).run(cutoff);
    const eventsResult = this.db.prepare(`DELETE FROM packet_events WHERE timestamp < ?`).run(cutoff);

    return {
      flowsDeleted: flowsResult.changes ?? 0,
      eventsDeleted: eventsResult.changes ?? 0,
    };
  }

  // Row mappers

  private mapSessionRow(row: Record<string, unknown>): CaptureSessionRecord {
    return {
      id: String(row.id),
      interfaceName: String(row.interface_name),
      config: String(row.config),
      startedAt: new Date(String(row.started_at)),
      endedAt: row.ended_at ? new Date(String(row.ended_at)) : undefined,
      status: String(row.status) as CaptureSessionRecord["status"],
      errorMessage: row.error_message ? String(row.error_message) : undefined,
      totalPackets: Number(row.total_packets) || 0,
      totalBytes: Number(row.total_bytes) || 0,
      uniqueFlows: Number(row.unique_flows) || 0,
      activeFlows: Number(row.active_flows) || 0,
      terminatedFlows: Number(row.terminated_flows) || 0,
      bpfFilter: row.bpf_filter ? String(row.bpf_filter) : undefined,
    };
  }

  private mapFlowRow(row: Record<string, unknown>): PacketFlowRecord {
    return {
      id: String(row.id),
      sessionId: String(row.session_id),
      captureInterface: String(row.capture_interface),
      captureStartedAt: new Date(String(row.capture_started_at)),
      protocol: String(row.protocol),
      sourceIP: String(row.source_ip),
      sourcePort: Number(row.source_port),
      destinationIP: String(row.destination_ip),
      destinationPort: Number(row.destination_port),
      l2Protocol: String(row.l2_protocol),
      l3Protocol: String(row.l3_protocol),
      l4Protocol: String(row.l4_protocol),
      l7Protocol: row.l7_protocol ? String(row.l7_protocol) : undefined,
      sourceMAC: row.source_mac ? String(row.source_mac) : undefined,
      destinationMAC: row.destination_mac ? String(row.destination_mac) : undefined,
      vlanIds: row.vlan_ids ? JSON.parse(String(row.vlan_ids)) : undefined,
      packetCount: Number(row.packet_count) || 0,
      byteCount: Number(row.byte_count) || 0,
      payloadBytes: Number(row.payload_bytes) || 0,
      synCount: Number(row.syn_count) || 0,
      finCount: Number(row.fin_count) || 0,
      rstCount: Number(row.rst_count) || 0,
      retransmitCount: Number(row.retransmit_count) || 0,
      outOfOrderCount: Number(row.out_of_order_count) || 0,
      tcpState: row.tcp_state ? String(row.tcp_state) : undefined,
      initialSeqNumber: row.initial_seq_number ? Number(row.initial_seq_number) : undefined,
      finalSeqNumber: row.final_seq_number ? Number(row.final_seq_number) : undefined,
      mss: row.mss ? Number(row.mss) : undefined,
      windowScale: row.window_scale ? Number(row.window_scale) : undefined,
      sackPermitted: row.sack_permitted === 1,
      firstSeenAt: new Date(String(row.first_seen_at)),
      lastSeenAt: new Date(String(row.last_seen_at)),
      durationMs: Number(row.duration_ms) || 0,
      hasHTTP: row.has_http === 1,
      hasDNS: row.has_dns === 1,
      hasTLS: row.has_tls === 1,
      httpSummary: row.http_summary ? String(row.http_summary) : undefined,
      dnsQueryNames: row.dns_query_names ? String(row.dns_query_names) : undefined,
      tlsSNI: row.tls_sni ? String(row.tls_sni) : undefined,
      tlsVersion: row.tls_version ? String(row.tls_version) : undefined,
      terminated: row.terminated === 1,
      terminationReason: row.termination_reason ? String(row.termination_reason) : undefined,
    };
  }

  private mapEventRow(row: Record<string, unknown>): PacketEventRecord {
    return {
      id: String(row.id),
      sessionId: String(row.session_id),
      timestamp: new Date(String(row.timestamp)),
      eventType: String(row.event_type) as PacketEventRecord["eventType"],
      flowId: row.flow_id ? String(row.flow_id) : undefined,
      eventData: JSON.parse(String(row.event_data)),
      protocol: row.protocol ? String(row.protocol) : undefined,
      sourceIP: row.source_ip ? String(row.source_ip) : undefined,
      destinationIP: row.destination_ip ? String(row.destination_ip) : undefined,
      l7Protocol: row.l7_protocol ? String(row.l7_protocol) : undefined,
      severity: row.severity ? String(row.severity) as PacketEventRecord["severity"] : undefined,
    };
  }

  private mapDNSRow(row: Record<string, unknown>): DNSQueryRecord {
    return {
      id: String(row.id),
      sessionId: String(row.session_id),
      timestamp: new Date(String(row.timestamp)),
      transactionId: Number(row.transaction_id),
      queryName: String(row.query_name),
      queryType: Number(row.query_type),
      queryTypeName: String(row.query_type_name),
      queryClass: String(row.query_class),
      sourceIP: String(row.source_ip),
      sourcePort: Number(row.source_port),
      destinationIP: String(row.destination_ip),
      destinationPort: Number(row.destination_port),
      responseTimestamp: row.response_timestamp ? new Date(String(row.response_timestamp)) : undefined,
      responseCode: row.response_code ? Number(row.response_code) : undefined,
      responseCodeName: row.response_code_name ? String(row.response_code_name) : undefined,
      answers: row.answers ? String(row.answers) : undefined,
      authoritative: row.authoritative === 1,
      truncated: row.truncated === 1,
      recursionDesired: row.recursion_desired === 1,
      latencyMs: row.latency_ms ? Number(row.latency_ms) : undefined,
    };
  }

  private mapHTTPRow(row: Record<string, unknown>): HTTPTransactionRecord {
    return {
      id: String(row.id),
      sessionId: String(row.session_id),
      flowId: String(row.flow_id),
      requestTimestamp: new Date(String(row.request_timestamp)),
      method: String(row.method),
      url: String(row.url),
      host: row.host ? String(row.host) : undefined,
      httpVersion: String(row.http_version),
      requestHeaders: String(row.request_headers),
      requestBodyLength: Number(row.request_body_length) || 0,
      responseTimestamp: row.response_timestamp ? new Date(String(row.response_timestamp)) : undefined,
      statusCode: row.status_code ? Number(row.status_code) : undefined,
      statusText: row.status_text ? String(row.status_text) : undefined,
      responseHeaders: row.response_headers ? String(row.response_headers) : undefined,
      responseBodyLength: row.response_body_length ? Number(row.response_body_length) : undefined,
      latencyMs: row.latency_ms ? Number(row.latency_ms) : undefined,
      sourceIP: String(row.source_ip),
      sourcePort: Number(row.source_port),
      destinationIP: String(row.destination_ip),
      destinationPort: Number(row.destination_port),
    };
  }

  private mapTLSRow(row: Record<string, unknown>): TLSHandshakeRecord {
    return {
      id: String(row.id),
      sessionId: String(row.session_id),
      flowId: String(row.flow_id),
      timestamp: new Date(String(row.timestamp)),
      handshakeType: String(row.handshake_type) as TLSHandshakeRecord["handshakeType"],
      tlsVersion: String(row.tls_version),
      sni: row.sni ? String(row.sni) : undefined,
      cipherSuites: row.cipher_suites ? String(row.cipher_suites) : undefined,
      selectedCipherSuite: row.selected_cipher_suite ? String(row.selected_cipher_suite) : undefined,
      alpn: row.alpn ? String(row.alpn) : undefined,
      supportedVersions: row.supported_versions ? String(row.supported_versions) : undefined,
      sourceIP: String(row.source_ip),
      sourcePort: Number(row.source_port),
      destinationIP: String(row.destination_ip),
      destinationPort: Number(row.destination_port),
      ja3Fingerprint: row.ja3_fingerprint ? String(row.ja3_fingerprint) : undefined,
      ja3sFingerprint: row.ja3s_fingerprint ? String(row.ja3s_fingerprint) : undefined,
    };
  }
}

// Helper function to create flow ID from 5-tuple
export function createFlowId(flowKey: FlowKey): string {
  const keyStr = `${flowKey.protocol}:${flowKey.sourceIP}:${flowKey.sourcePort}:${flowKey.destinationIP}:${flowKey.destinationPort}`;
  // Simple hash for ID generation
  let hash = 0;
  for (let i = 0; i < keyStr.length; i++) {
    const char = keyStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `flow-${Math.abs(hash).toString(16)}-${Date.now().toString(36)}`;
}

// Helper to extract flow record from parsed packet
export function extractFlowRecord(
  packet: ParsedPacket,
  flowKey: FlowKey,
  flowStats: FlowStats,
  sessionId: string,
  captureInterface: string
): PacketFlowRecord {
  return {
    id: createFlowId(flowKey),
    sessionId,
    captureInterface,
    captureStartedAt: flowStats.startTime,
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
    packetCount: flowStats.packetCount,
    byteCount: flowStats.byteCount,
    payloadBytes: packet.payloadLength,
    synCount: flowStats.synCount,
    finCount: flowStats.finCount,
    rstCount: flowStats.rstCount,
    retransmitCount: flowStats.retransmits,
    outOfOrderCount: flowStats.outOfOrder,
    tcpState: flowStats.tcpState,
    initialSeqNumber: packet.tcp?.sequenceNumber,
    finalSeqNumber: undefined,
    mss: packet.tcp?.mss,
    windowScale: packet.tcp?.windowScale,
    sackPermitted: packet.tcp?.sackPermitted,
    firstSeenAt: flowStats.startTime,
    lastSeenAt: flowStats.lastSeen,
    durationMs: flowStats.lastSeen.getTime() - flowStats.startTime.getTime(),
    hasHTTP: !!packet.http,
    hasDNS: !!packet.dns,
    hasTLS: !!packet.tls,
    httpSummary: packet.http 
      ? `${packet.http.method || "RESPONSE"} ${packet.http.url || packet.http.statusCode}` 
      : undefined,
    dnsQueryNames: packet.dns?.questions.map((q) => q.name).join(", "),
    tlsSNI: packet.tls?.sni,
    tlsVersion: packet.tls?.version,
    terminated: flowStats.tcpState === "CLOSED",
    terminationReason: flowStats.rstCount > 0 ? "RST" : flowStats.finCount > 0 ? "FIN" : undefined,
  };
}

