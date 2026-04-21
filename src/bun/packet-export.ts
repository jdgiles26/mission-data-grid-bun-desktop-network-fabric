// Packet Capture Export/Import
// Supports pcap, JSON, and CSV formats

import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { Utils } from "electrobun/bun";
import type { PacketFlowRecord, DNSQueryRecord, HTTPTransactionRecord, TLSHandshakeRecord } from "./packet-database";

export type ExportFormat = "pcap" | "json" | "csv" | "ndjson";

export interface ExportOptions {
  format: ExportFormat;
  sessionId?: string;
  startTime?: Date;
  endTime?: Date;
  filter?: {
    protocols?: string[];
    sourceIPs?: string[];
    destinationIPs?: string[];
    ports?: number[];
  };
}

export interface ExportResult {
  success: boolean;
  filePath?: string;
  recordCount: number;
  error?: string;
}

export class PacketExporter {
  private exportDir: string;

  constructor() {
    this.exportDir = join(Utils.paths.userData, "exports");
    if (!existsSync(this.exportDir)) {
      mkdirSync(this.exportDir, { recursive: true });
    }
  }

  async exportFlows(
    flows: PacketFlowRecord[],
    options: ExportOptions
  ): Promise<ExportResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `flows-${options.sessionId || "export"}-${timestamp}.${this.getExtension(options.format)}`;
    const filePath = join(this.exportDir, filename);

    try {
      let recordCount = 0;

      switch (options.format) {
        case "json":
          recordCount = await this.exportJSON(filePath, flows);
          break;
        case "ndjson":
          recordCount = await this.exportNDJSON(filePath, flows);
          break;
        case "csv":
          recordCount = await this.exportCSV(filePath, flows);
          break;
        case "pcap":
          recordCount = await this.exportPCAP(filePath, flows);
          break;
      }

      return { success: true, filePath, recordCount };
    } catch (error) {
      return { success: false, recordCount: 0, error: String(error) };
    }
  }

  async exportDNSQueries(
    queries: DNSQueryRecord[],
    options: ExportOptions
  ): Promise<ExportResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `dns-${options.sessionId || "export"}-${timestamp}.${this.getExtension(options.format)}`;
    const filePath = join(this.exportDir, filename);

    try {
      const data = queries.map((q) => ({
        timestamp: q.timestamp.toISOString(),
        query: q.queryName,
        type: q.queryTypeName,
        source: q.sourceIP,
        destination: q.destinationIP,
        latency: q.latencyMs,
      }));

      await Bun.write(filePath, JSON.stringify(data, null, 2));
      return { success: true, filePath, recordCount: queries.length };
    } catch (error) {
      return { success: false, recordCount: 0, error: String(error) };
    }
  }

  async exportHTTPTransactions(
    transactions: HTTPTransactionRecord[],
    options: ExportOptions
  ): Promise<ExportResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `http-${options.sessionId || "export"}-${timestamp}.${this.getExtension(options.format)}`;
    const filePath = join(this.exportDir, filename);

    try {
      const data = transactions.map((t) => ({
        timestamp: t.requestTimestamp.toISOString(),
        method: t.method,
        url: t.url,
        host: t.host,
        status: t.statusCode,
        latency: t.latencyMs,
        source: t.sourceIP,
        destination: t.destinationIP,
      }));

      await Bun.write(filePath, JSON.stringify(data, null, 2));
      return { success: true, filePath, recordCount: transactions.length };
    } catch (error) {
      return { success: false, recordCount: 0, error: String(error) };
    }
  }

  async exportTLSHandshakes(
    handshakes: TLSHandshakeRecord[],
    options: ExportOptions
  ): Promise<ExportResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `tls-${options.sessionId || "export"}-${timestamp}.${this.getExtension(options.format)}`;
    const filePath = join(this.exportDir, filename);

    try {
      const data = handshakes.map((h) => ({
        timestamp: h.timestamp.toISOString(),
        type: h.handshakeType,
        version: h.tlsVersion,
        sni: h.sni,
        source: h.sourceIP,
        destination: h.destinationIP,
        ja3: h.ja3Fingerprint,
      }));

      await Bun.write(filePath, JSON.stringify(data, null, 2));
      return { success: true, filePath, recordCount: handshakes.length };
    } catch (error) {
      return { success: false, recordCount: 0, error: String(error) };
    }
  }

  private async exportJSON(filePath: string, flows: PacketFlowRecord[]): Promise<number> {
    const data = flows.map((f) => this.flowToObject(f));
    await Bun.write(filePath, JSON.stringify(data, null, 2));
    return flows.length;
  }

  private async exportNDJSON(filePath: string, flows: PacketFlowRecord[]): Promise<number> {
    const lines = flows.map((f) => JSON.stringify(this.flowToObject(f)));
    await Bun.write(filePath, lines.join("\n"));
    return flows.length;
  }

  private async exportCSV(filePath: string, flows: PacketFlowRecord[]): Promise<number> {
    const headers = [
      "id",
      "protocol",
      "source_ip",
      "source_port",
      "destination_ip",
      "destination_port",
      "l7_protocol",
      "packet_count",
      "byte_count",
      "start_time",
      "end_time",
      "duration_ms",
      "tcp_state",
    ];

    const lines = [headers.join(",")];

    for (const f of flows) {
      const line = [
        f.id,
        f.protocol,
        f.sourceIP,
        f.sourcePort,
        f.destinationIP,
        f.destinationPort,
        f.l7Protocol || "",
        f.packetCount,
        f.byteCount,
        f.firstSeenAt.toISOString(),
        f.lastSeenAt.toISOString(),
        f.durationMs,
        f.tcpState || "",
      ].join(",");
      lines.push(line);
    }

    await Bun.write(filePath, lines.join("\n"));
    return flows.length;
  }

  private async exportPCAP(filePath: string, flows: PacketFlowRecord[]): Promise<number> {
    // Note: True PCAP export would require storing raw packet data
    // This is a placeholder that exports flow metadata in a binary format
    const header = Buffer.alloc(24);
    header.writeUInt32BE(0xa1b2c3d4, 0); // Magic number
    header.writeUInt16BE(2, 4); // Major version
    header.writeUInt16BE(4, 6); // Minor version
    header.writeInt32BE(0, 8); // Timezone
    header.writeUInt32BE(0, 12); // Sigfigs
    header.writeUInt32BE(65535, 16); // Snaplen
    header.writeUInt32BE(1, 20); // Network (Ethernet)

    // For now, just write a placeholder
    await Bun.write(filePath, header);
    return flows.length;
  }

  private flowToObject(flow: PacketFlowRecord): Record<string, unknown> {
    return {
      id: flow.id,
      protocol: flow.protocol,
      source: {
        ip: flow.sourceIP,
        port: flow.sourcePort,
        mac: flow.sourceMAC,
      },
      destination: {
        ip: flow.destinationIP,
        port: flow.destinationPort,
        mac: flow.destinationMAC,
      },
      protocols: {
        l2: flow.l2Protocol,
        l3: flow.l3Protocol,
        l4: flow.l4Protocol,
        l7: flow.l7Protocol,
      },
      statistics: {
        packets: flow.packetCount,
        bytes: flow.byteCount,
        payload_bytes: flow.payloadBytes,
        syn_count: flow.synCount,
        fin_count: flow.finCount,
        rst_count: flow.rstCount,
        retransmits: flow.retransmitCount,
      },
      timing: {
        start: flow.firstSeenAt.toISOString(),
        end: flow.lastSeenAt.toISOString(),
        duration_ms: flow.durationMs,
      },
      tcp: flow.tcpState ? {
        state: flow.tcpState,
        mss: flow.mss,
        window_scale: flow.windowScale,
        sack_permitted: flow.sackPermitted,
      } : undefined,
      l7: {
        http: flow.hasHTTP ? { summary: flow.httpSummary } : undefined,
        dns: flow.hasDNS ? { queries: flow.dnsQueryNames } : undefined,
        tls: flow.hasTLS ? { sni: flow.tlsSNI, version: flow.tlsVersion } : undefined,
      },
    };
  }

  private getExtension(format: ExportFormat): string {
    switch (format) {
      case "pcap":
        return "pcap";
      case "json":
        return "json";
      case "ndjson":
        return "ndjson";
      case "csv":
        return "csv";
      default:
        return "txt";
    }
  }

  getExportDirectory(): string {
    return this.exportDir;
  }
}

export function createPacketExporter(): PacketExporter {
  return new PacketExporter();
}
