// Phase 2: Packet Capture Engine
// True pcap/libpcap integration for packet-level visibility

import { Utils } from "electrobun/bun";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface PacketCaptureConfig {
  interfaceName: string;
  bufferSize: number;
  snapLength: number;
  promiscuous: boolean;
  bpfFilter: string;
  maxPacketsPerBatch: number;
}

export interface RawPacket {
  timestamp: Date;
  interfaceName: string;
  snapLength: number;
  originalLength: number;
  data: Uint8Array;
  linkType: LinkType;
}

export type LinkType =
  | "ETHERNET"
  | "RAW_IP"
  | "IEEE802_11"
  | "LINUX_SLL"
  | "NULL"
  | "UNKNOWN";

export interface CaptureSession {
  id: string;
  interfaceName: string;
  startedAt: Date;
  packetCount: number;
  byteCount: number;
  status: "running" | "paused" | "stopped" | "error";
  errorMessage?: string;
}

export interface CaptureStats {
  packetsReceived: number;
  packetsDropped: number;
  packetsDroppedByInterface: number;
  packetsCaptured: number;
}

// Protocol Detection Results
export interface ProtocolDetection {
  l2: L2Protocol;
  l3: L3Protocol;
  l4: L4Protocol;
  l7?: L7Protocol;
  encapsulation: EncapsulationType[];
}

export type L2Protocol =
  | "ETHERNET_II"
  | "ETHERNET_802_3"
  | "IEEE_802_1Q"
  | "IEEE_802_1AD"
  | "PPP"
  | "HDLC"
  | "UNKNOWN";

export type L3Protocol =
  | "IPv4"
  | "IPv6"
  | "ARP"
  | "ICMPv4"
  | "ICMPv6"
  | "IGMP"
  | "MPLS"
  | "UNKNOWN";

export type L4Protocol =
  | "TCP"
  | "UDP"
  | "SCTP"
  | "DCCP"
  | "ICMP"
  | "ICMPv6"
  | "GRE"
  | "ESP"
  | "AH"
  | "UNKNOWN";

export type L7Protocol =
  | "HTTP"
  | "HTTPS"
  | "DNS"
  | "DHCP"
  | "SSH"
  | "FTP"
  | "SMTP"
  | "POP3"
  | "IMAP"
  | "NTP"
  | "SNMP"
  | "TELNET"
  | "TLS"
  | "QUIC"
  | "UNKNOWN";

export type EncapsulationType =
  | "VLAN"
  | "MPLS"
  | "PPPoE"
  | "PPP"
  | "GRE"
  | "IP-in-IP"
  | "IPv6-in-IP"
  | "VXLAN"
  | "GENEVE"
  | "STT";

// Parsed Packet Structure
export interface ParsedPacket {
  raw: RawPacket;
  protocols: ProtocolDetection;
  
  // L2 - Data Link
  ethernet?: EthernetHeader;
  vlan?: VLANTag[];
  
  // L3 - Network
  ipv4?: IPv4Header;
  ipv6?: IPv6Header;
  arp?: ARPHeader;
  icmp?: ICMPHeader;
  
  // L4 - Transport
  tcp?: TCPHeader;
  udp?: UDPHeader;
  sctp?: SCTPHeader;
  
  // L7 - Application
  http?: HTTPData;
  dns?: DNSData;
  tls?: TLSData;
  
  // Payload
  payload: Uint8Array;
  payloadLength: number;
}

export interface EthernetHeader {
  destinationMAC: string;
  sourceMAC: string;
  etherType: number;
  vlanTagged: boolean;
}

export interface VLANTag {
  priority: number;
  cfi: boolean;
  vlanId: number;
  etherType: number;
}

export interface IPv4Header {
  version: number;
  headerLength: number;
  dscp: number;
  ecn: number;
  totalLength: number;
  identification: number;
  flags: {
    reserved: boolean;
    dontFragment: boolean;
    moreFragments: boolean;
  };
  fragmentOffset: number;
  ttl: number;
  protocol: number;
  headerChecksum: number;
  sourceIP: string;
  destinationIP: string;
  options?: Uint8Array;
}

export interface IPv6Header {
  version: number;
  trafficClass: number;
  flowLabel: number;
  payloadLength: number;
  nextHeader: number;
  hopLimit: number;
  sourceIP: string;
  destinationIP: string;
  extensionHeaders?: IPv6ExtensionHeader[];
}

export interface IPv6ExtensionHeader {
  type: number;
  length: number;
  data: Uint8Array;
}

export interface ARPHeader {
  hardwareType: number;
  protocolType: number;
  hardwareAddressLength: number;
  protocolAddressLength: number;
  operation: "REQUEST" | "REPLY" | "UNKNOWN";
  senderMAC: string;
  senderIP: string;
  targetMAC: string;
  targetIP: string;
}

export interface ICMPHeader {
  type: number;
  code: number;
  checksum: number;
  data: Uint8Array;
  // ICMP-specific fields based on type/code
  echo?: {
    identifier: number;
    sequence: number;
  };
  redirect?: {
    gatewayIP: string;
  };
  timeExceeded?: {
    originalLength: number;
  };
}

export interface TCPHeader {
  sourcePort: number;
  destinationPort: number;
  sequenceNumber: number;
  acknowledgmentNumber: number;
  dataOffset: number;
  reserved: number;
  flags: TCPFlags;
  windowSize: number;
  checksum: number;
  urgentPointer: number;
  options?: TCPOptions;
  mss?: number;
  windowScale?: number;
  sackPermitted?: boolean;
  sackBlocks?: Array<{ left: number; right: number }>;
  timestamp?: {
    value: number;
    echoReply: number;
  };
}

export interface TCPFlags {
  cwr: boolean;
  ece: boolean;
  urg: boolean;
  ack: boolean;
  psh: boolean;
  rst: boolean;
  syn: boolean;
  fin: boolean;
}

export interface TCPOptions {
  mss?: number;
  windowScale?: number;
  sackPermitted?: boolean;
  sackBlocks?: Array<{ left: number; right: number }>;
  timestamp?: {
    value: number;
    echoReply: number;
  };
  nop?: boolean;
}

export interface UDPHeader {
  sourcePort: number;
  destinationPort: number;
  length: number;
  checksum: number;
}

export interface SCTPHeader {
  sourcePort: number;
  destinationPort: number;
  verificationTag: number;
  checksum: number;
  chunks: SCTPChunk[];
}

export interface SCTPChunk {
  type: number;
  flags: number;
  length: number;
  data: Uint8Array;
}

// L7 Protocol Data
export interface HTTPData {
  isRequest: boolean;
  method?: string;
  url?: string;
  version?: string;
  statusCode?: number;
  statusText?: string;
  headers: Record<string, string>;
  body?: Uint8Array;
  bodyLength: number;
  chunked: boolean;
  contentLength?: number;
  keepAlive: boolean;
  upgrade?: string;
}

export interface DNSData {
  transactionId: number;
  flags: DNSFlags;
  questions: DNSQuestion[];
  answers: DNSAnswer[];
  authority: DNSRecord[];
  additional: DNSRecord[];
}

export interface DNSFlags {
  qr: boolean; // Query (false) or Response (true)
  opcode: number;
  aa: boolean; // Authoritative Answer
  tc: boolean; // Truncated
  rd: boolean; // Recursion Desired
  ra: boolean; // Recursion Available
  z: number; // Reserved
  rcode: number; // Response Code
}

export interface DNSQuestion {
  name: string;
  type: number;
  class: number;
}

export interface DNSAnswer extends DNSRecord {
  ttl: number;
}

export interface DNSRecord {
  name: string;
  type: number;
  class: number;
  rdata: Uint8Array;
  rdataString?: string;
}

export interface TLSData {
  version: string;
  handshake?: TLSHandshake;
  cipherSuite?: number;
  compressionMethod?: number;
  extensions?: TLSExtension[];
  sni?: string;
  alpn?: string[];
  ja3Fingerprint?: string;
  ja3sFingerprint?: string;
}

export interface TLSHandshake {
  type: "client_hello" | "server_hello" | "certificate" | "key_exchange" | "finished" | "unknown";
  version: string;
  random: Uint8Array;
  sessionId?: Uint8Array;
  cipherSuites?: number[];
  compressionMethods?: number[];
}

export interface TLSExtension {
  type: number;
  name?: string;
  data: Uint8Array;
  parsed?: unknown;
}

// Flow tracking
export interface FlowKey {
  protocol: "TCP" | "UDP" | "ICMP" | "OTHER";
  sourceIP: string;
  destinationIP: string;
  sourcePort: number;
  destinationPort: number;
}

export interface FlowStats {
  packetCount: number;
  byteCount: number;
  synCount: number;
  finCount: number;
  rstCount: number;
  retransmits: number;
  outOfOrder: number;
  startTime: Date;
  lastSeen: Date;
  tcpState?: "SYN_SENT" | "SYN_RECV" | "ESTABLISHED" | "FIN_WAIT" | "CLOSE_WAIT" | "CLOSED";
}

export interface PacketCaptureEvent {
  type: "packet" | "flow_start" | "flow_update" | "flow_end" | "error" | "stats";
  timestamp: Date;
  sessionId: string;
  packet?: ParsedPacket;
  flowKey?: FlowKey;
  flowStats?: FlowStats;
  stats?: CaptureStats;
  error?: string;
}

export type PacketCaptureHandler = (event: PacketCaptureEvent) => void | Promise<void>;

// Default configuration
const DEFAULT_CONFIG: PacketCaptureConfig = {
  interfaceName: "any",
  bufferSize: 10 * 1024 * 1024, // 10MB
  snapLength: 65535, // Full packet capture
  promiscuous: true,
  bpfFilter: "",
  maxPacketsPerBatch: 100,
};

/**
 * Packet Capture Engine - Phase 2 Implementation
 * 
 * Uses tcpdump as the capture backend for cross-platform compatibility.
 * On macOS, this provides true libpcap functionality via the system tcpdump.
 */
export class PacketCaptureEngine {
  private config: PacketCaptureConfig;
  private session: CaptureSession | null = null;
  private process: ReturnType<typeof Bun.spawn> | null = null;
  private handlers: PacketCaptureHandler[] = [];
  private packetQueue: RawPacket[] = [];
  private processingInterval: Timer | null = null;
  private flowTable = new Map<string, FlowStats>();
  private captureFileDir: string;
  private tempCaptureFile: string | null = null;

  constructor(config: Partial<PacketCaptureConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Set up capture file directory
    this.captureFileDir = join(homedir(), "Library/Application Support/MissionDataGrid", "captures");
    if (!existsSync(this.captureFileDir)) {
      mkdirSync(this.captureFileDir, { recursive: true });
    }
  }

  /**
   * Check if packet capture is available (requires root/admin on most systems)
   */
  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    try {
      // Check if tcpdump exists
      const result = await this.runCommand(["which", "tcpdump"], 2000);
      if (result.exitCode !== 0) {
        return { available: false, reason: "tcpdump not found. Install libpcap/tcpdump." };
      }

      // Try to list interfaces (doesn't require root)
      const listResult = await this.runCommand(["tcpdump", "-D"], 2000);
      if (listResult.exitCode !== 0) {
        return { available: false, reason: "tcpdump cannot list interfaces." };
      }

      // Try a very short capture to test permissions
      const testResult = await this.runCommand(
        ["tcpdump", "-i", "lo0", "-c", "1", "-W", "1"],
        3000
      );
      
      // Exit code 1 usually means permission denied
      if (testResult.exitCode === 1 && testResult.stderr.includes("permission")) {
        return { 
          available: false, 
          reason: "Root/Administrator privileges required for packet capture." 
        };
      }

      return { available: true };
    } catch (error) {
      return { 
        available: false, 
        reason: `Error checking availability: ${error}` 
      };
    }
  }

  /**
   * List available capture interfaces
   */
  async listInterfaces(): Promise<Array<{ name: string; description: string }>> {
    const result = await this.runCommand(["tcpdump", "-D"], 3000);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to list interfaces: ${result.stderr}`);
    }

    const interfaces: Array<{ name: string; description: string }> = [];
    for (const line of result.stdout.split("\n")) {
      // Parse lines like: "1.en0 [Up, Running]"
      const match = line.match(/^\d+\.(\S+)\s+\[(.+)\]$/);
      if (match) {
        interfaces.push({
          name: match[1],
          description: match[2],
        });
      }
    }

    return interfaces;
  }

  /**
   * Start packet capture session
   */
  async start(): Promise<CaptureSession> {
    if (this.session?.status === "running") {
      throw new Error("Capture session already running");
    }

    const availability = await this.checkAvailability();
    if (!availability.available) {
      throw new Error(`Packet capture unavailable: ${availability.reason}`);
    }

    const sessionId = crypto.randomUUID();
    this.tempCaptureFile = join(this.captureFileDir, `capture-${sessionId}.pcap`);

    this.session = {
      id: sessionId,
      interfaceName: this.config.interfaceName,
      startedAt: new Date(),
      packetCount: 0,
      byteCount: 0,
      status: "running",
    };

    // Build tcpdump arguments
    const args: string[] = [
      "tcpdump",
      "-i", this.config.interfaceName,
      "-s", String(this.config.snapLength),
      "-w", "-", // Write to stdout for parsing
      "-U", // Unbuffered output
      "-n", // Don't resolve names
      "-nn", // Don't resolve port names either
    ];

    if (!this.config.promiscuous) {
      args.push("-p");
    }

    if (this.config.bpfFilter) {
      args.push(this.config.bpfFilter);
    }

    // Spawn tcpdump process
    this.process = Bun.spawn(args.slice(1), {
      stdout: "pipe",
      stderr: "pipe",
    });

    // Start processing packets
    this.startPacketProcessing();

    return this.session;
  }

  /**
   * Pause capture (keeps session alive)
   */
  pause(): void {
    if (this.session && this.session.status === "running") {
      this.session.status = "paused";
      if (this.process) {
        try {
          this.process.kill("SIGSTOP");
        } catch {
          // Process might have already exited
        }
      }
    }
  }

  /**
   * Resume paused capture
   */
  resume(): void {
    if (this.session && this.session.status === "paused") {
      this.session.status = "running";
      if (this.process) {
        try {
          this.process.kill("SIGCONT");
        } catch {
          // Process might have already exited
        }
      }
    }
  }

  /**
   * Stop capture session
   */
  async stop(): Promise<CaptureSession> {
    if (!this.session) {
      throw new Error("No active capture session");
    }

    this.session.status = "stopped";

    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // Process might have already exited
      }
      this.process = null;
    }

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Process remaining packets
    await this.processPacketQueue();

    return this.session;
  }

  /**
   * Register event handler
   */
  onPacket(handler: PacketCaptureHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const index = this.handlers.indexOf(handler);
      if (index > -1) {
        this.handlers.splice(index, 1);
      }
    };
  }

  /**
   * Get current session stats
   */
  getStats(): CaptureSession | null {
    return this.session;
  }

  /**
   * Get active flow table
   */
  getFlows(): Array<{ key: FlowKey; stats: FlowStats }> {
    return Array.from(this.flowTable.entries()).map(([key, stats]) => ({
      key: this.deserializeFlowKey(key),
      stats,
    }));
  }

  /**
   * Clear flow table
   */
  clearFlows(): void {
    this.flowTable.clear();
  }

  /**
   * Parse a raw packet from pcap format
   */
  parsePacket(raw: RawPacket): ParsedPacket | null {
    try {
      const data = raw.data;
      let offset = 0;

      // Parse based on link type
      let ethernet: EthernetHeader | undefined;
      let vlan: VLANTag[] | undefined;

      switch (raw.linkType) {
        case "ETHERNET":
          ({ ethernet, vlan, offset } = this.parseEthernetHeader(data, offset));
          break;
        case "RAW_IP":
          // Raw IP, no L2 header
          break;
        default:
          // Unknown link type, treat entire packet as payload
          return {
            raw,
            protocols: {
              l2: "UNKNOWN",
              l3: "UNKNOWN",
              l4: "UNKNOWN",
              encapsulation: [],
            },
            payload: data,
            payloadLength: data.length,
          };
      }

      // Parse L3 based on EtherType
      let ipv4: IPv4Header | undefined;
      let ipv6: IPv6Header | undefined;
      let arp: ARPHeader | undefined;
      let icmp: ICMPHeader | undefined;
      let l3Protocol: L3Protocol = "UNKNOWN";

      if (ethernet) {
        const etherType = ethernet.etherType;
        if (etherType === 0x0800) {
          ({ ipv4, offset } = this.parseIPv4Header(data, offset));
          l3Protocol = "IPv4";
        } else if (etherType === 0x86dd) {
          ({ ipv6, offset } = this.parseIPv6Header(data, offset));
          l3Protocol = "IPv6";
        } else if (etherType === 0x0806) {
          ({ arp, offset } = this.parseARPHeader(data, offset));
          l3Protocol = "ARP";
        } else if (etherType === 0x8100 || etherType === 0x88a8) {
          // VLAN tagged - already handled in parseEthernetHeader
          // Continue parsing inner EtherType
          if (ethernet.vlanTagged && vlan && vlan.length > 0) {
            const innerEtherType = vlan[vlan.length - 1].etherType;
            if (innerEtherType === 0x0800) {
              ({ ipv4, offset } = this.parseIPv4Header(data, offset));
              l3Protocol = "IPv4";
            } else if (innerEtherType === 0x86dd) {
              ({ ipv6, offset } = this.parseIPv6Header(data, offset));
              l3Protocol = "IPv6";
            }
          }
        }
      } else if (raw.linkType === "RAW_IP") {
        // Raw IP - determine version from first nibble
        const version = data[0] >> 4;
        if (version === 4) {
          ({ ipv4, offset } = this.parseIPv4Header(data, offset));
          l3Protocol = "IPv4";
        } else if (version === 6) {
          ({ ipv6, offset } = this.parseIPv6Header(data, offset));
          l3Protocol = "IPv6";
        }
      }

      // Parse L4 based on protocol/next-header
      let tcp: TCPHeader | undefined;
      let udp: UDPHeader | undefined;
      let sctp: SCTPHeader | undefined;
      let l4Protocol: L4Protocol = "UNKNOWN";
      let l7Protocol: L7Protocol | undefined;

      const protocolNumber = ipv4?.protocol ?? ipv6?.nextHeader;
      
      if (protocolNumber === 6) {
        // TCP
        ({ tcp, offset } = this.parseTCPHeader(data, offset));
        l4Protocol = "TCP";
        l7Protocol = this.detectL7Protocol(tcp.sourcePort, tcp.destinationPort, data.slice(offset));
      } else if (protocolNumber === 17) {
        // UDP
        ({ udp, offset } = this.parseUDPHeader(data, offset));
        l4Protocol = "UDP";
        l7Protocol = this.detectL7Protocol(udp.sourcePort, udp.destinationPort, data.slice(offset));
      } else if (protocolNumber === 1) {
        // ICMP
        ({ icmp, offset } = this.parseICMPHeader(data, offset));
        l4Protocol = "ICMP";
      } else if (protocolNumber === 132) {
        // SCTP
        ({ sctp, offset } = this.parseSCTPHeader(data, offset));
        l4Protocol = "SCTP";
      }

      // Parse L7 if detected
      let http: HTTPData | undefined;
      let dns: DNSData | undefined;
      let tls: TLSData | undefined;

      const payload = data.slice(offset);
      
      if (l7Protocol === "HTTP" || l7Protocol === "HTTPS") {
        http = this.parseHTTP(payload, tcp !== undefined);
        if (l7Protocol === "HTTPS" && !http) {
          // Try to parse TLS
          tls = this.parseTLS(payload);
        }
      } else if (l7Protocol === "DNS") {
        dns = this.parseDNS(payload);
      } else if (l7Protocol === "TLS" || (l7Protocol === "UNKNOWN" && tcp)) {
        tls = this.parseTLS(payload);
        if (tls) {
          l7Protocol = "TLS";
        }
      }

      return {
        raw,
        protocols: {
          l2: ethernet ? "ETHERNET_II" : "UNKNOWN",
          l3: l3Protocol,
          l4: l4Protocol,
          l7: l7Protocol,
          encapsulation: vlan ? ["VLAN"] : [],
        },
        ethernet,
        vlan,
        ipv4,
        ipv6,
        arp,
        icmp,
        tcp,
        udp,
        sctp,
        http,
        dns,
        tls,
        payload,
        payloadLength: payload.length,
      };
    } catch (error) {
      console.error("Error parsing packet:", error);
      return null;
    }
  }

  // Private methods for protocol parsing

  private parseEthernetHeader(
    data: Uint8Array,
    offset: number
  ): { ethernet: EthernetHeader; vlan?: VLANTag[]; offset: number } {
    const dstMAC = this.formatMAC(data.slice(offset, offset + 6));
    const srcMAC = this.formatMAC(data.slice(offset + 6, offset + 12));
    let etherType = (data[offset + 12] << 8) | data[offset + 13];
    offset += 14;

    const vlan: VLANTag[] = [];
    let vlanTagged = false;

    // Handle VLAN tagging (802.1Q or 802.1AD)
    while (etherType === 0x8100 || etherType === 0x88a8) {
      vlanTagged = true;
      const tci = (data[offset] << 8) | data[offset + 1];
      vlan.push({
        priority: (tci >> 13) & 0x7,
        cfi: ((tci >> 12) & 0x1) === 1,
        vlanId: tci & 0xfff,
        etherType: (data[offset + 2] << 8) | data[offset + 3],
      });
      etherType = vlan[vlan.length - 1].etherType;
      offset += 4;
    }

    return {
      ethernet: {
        destinationMAC: dstMAC,
        sourceMAC: srcMAC,
        etherType,
        vlanTagged,
      },
      vlan: vlan.length > 0 ? vlan : undefined,
      offset,
    };
  }

  private parseIPv4Header(data: Uint8Array, offset: number): { ipv4: IPv4Header; offset: number } {
    const version = (data[offset] >> 4) & 0xf;
    const headerLength = (data[offset] & 0xf) * 4;
    const dscp = (data[offset + 1] >> 2) & 0x3f;
    const ecn = data[offset + 1] & 0x3;
    const totalLength = (data[offset + 2] << 8) | data[offset + 3];
    const identification = (data[offset + 4] << 8) | data[offset + 5];
    const flags = data[offset + 6] >> 5;
    const fragmentOffset = ((data[offset + 6] & 0x1f) << 8) | data[offset + 7];
    const ttl = data[offset + 8];
    const protocol = data[offset + 9];
    const headerChecksum = (data[offset + 10] << 8) | data[offset + 11];
    const sourceIP = this.formatIPv4(data.slice(offset + 12, offset + 16));
    const destinationIP = this.formatIPv4(data.slice(offset + 16, offset + 20));

    const options = headerLength > 20 
      ? data.slice(offset + 20, offset + headerLength) 
      : undefined;

    return {
      ipv4: {
        version,
        headerLength,
        dscp,
        ecn,
        totalLength,
        identification,
        flags: {
          reserved: (flags & 0x4) !== 0,
          dontFragment: (flags & 0x2) !== 0,
          moreFragments: (flags & 0x1) !== 0,
        },
        fragmentOffset,
        ttl,
        protocol,
        headerChecksum,
        sourceIP,
        destinationIP,
        options,
      },
      offset: offset + headerLength,
    };
  }

  private parseIPv6Header(data: Uint8Array, offset: number): { ipv6: IPv6Header; offset: number } {
    const version = (data[offset] >> 4) & 0xf;
    const trafficClass = ((data[offset] & 0xf) << 4) | ((data[offset + 1] >> 4) & 0xf);
    const flowLabel = ((data[offset + 1] & 0xf) << 16) | (data[offset + 2] << 8) | data[offset + 3];
    const payloadLength = (data[offset + 4] << 8) | data[offset + 5];
    const nextHeader = data[offset + 6];
    const hopLimit = data[offset + 7];
    const sourceIP = this.formatIPv6(data.slice(offset + 8, offset + 24));
    const destinationIP = this.formatIPv6(data.slice(offset + 24, offset + 40));

    return {
      ipv6: {
        version,
        trafficClass,
        flowLabel,
        payloadLength,
        nextHeader,
        hopLimit,
        sourceIP,
        destinationIP,
      },
      offset: offset + 40,
    };
  }

  private parseARPHeader(data: Uint8Array, offset: number): { arp: ARPHeader; offset: number } {
    const hardwareType = (data[offset] << 8) | data[offset + 1];
    const protocolType = (data[offset + 2] << 8) | data[offset + 3];
    const hardwareAddressLength = data[offset + 4];
    const protocolAddressLength = data[offset + 5];
    const operation = (data[offset + 6] << 8) | data[offset + 7];

    let pos = offset + 8;
    const senderMAC = this.formatMAC(data.slice(pos, pos + hardwareAddressLength));
    pos += hardwareAddressLength;
    const senderIP = this.formatIPv4(data.slice(pos, pos + protocolAddressLength));
    pos += protocolAddressLength;
    const targetMAC = this.formatMAC(data.slice(pos, pos + hardwareAddressLength));
    pos += hardwareAddressLength;
    const targetIP = this.formatIPv4(data.slice(pos, pos + protocolAddressLength));
    pos += protocolAddressLength;

    const operationStr = operation === 1 ? "REQUEST" : operation === 2 ? "REPLY" : "UNKNOWN";

    return {
      arp: {
        hardwareType,
        protocolType,
        hardwareAddressLength,
        protocolAddressLength,
        operation: operationStr,
        senderMAC,
        senderIP,
        targetMAC,
        targetIP,
      },
      offset: pos,
    };
  }

  private parseICMPHeader(data: Uint8Array, offset: number): { icmp: ICMPHeader; offset: number } {
    const type = data[offset];
    const code = data[offset + 1];
    const checksum = (data[offset + 2] << 8) | data[offset + 3];
    const icmpData = data.slice(offset + 4);

    const result: ICMPHeader = {
      type,
      code,
      checksum,
      data: icmpData,
    };

    // Parse specific ICMP types
    if ((type === 8 || type === 0) && icmpData.length >= 4) {
      // Echo Request/Reply
      result.echo = {
        identifier: (icmpData[0] << 8) | icmpData[1],
        sequence: (icmpData[2] << 8) | icmpData[3],
      };
    }

    return { icmp: result, offset: offset + 4 + icmpData.length };
  }

  private parseTCPHeader(data: Uint8Array, offset: number): { tcp: TCPHeader; offset: number } {
    const sourcePort = (data[offset] << 8) | data[offset + 1];
    const destinationPort = (data[offset + 2] << 8) | data[offset + 3];
    const sequenceNumber = 
      (data[offset + 4] << 24) | 
      (data[offset + 5] << 16) | 
      (data[offset + 6] << 8) | 
      data[offset + 7];
    const acknowledgmentNumber = 
      (data[offset + 8] << 24) | 
      (data[offset + 9] << 16) | 
      (data[offset + 10] << 8) | 
      data[offset + 11];
    const dataOffset = (data[offset + 12] >> 4) * 4;
    const reserved = data[offset + 12] & 0xf;
    const flags = data[offset + 13];
    const windowSize = (data[offset + 14] << 8) | data[offset + 15];
    const checksum = (data[offset + 16] << 8) | data[offset + 17];
    const urgentPointer = (data[offset + 18] << 8) | data[offset + 19];

    const flagsObj: TCPFlags = {
      cwr: (flags & 0x80) !== 0,
      ece: (flags & 0x40) !== 0,
      urg: (flags & 0x20) !== 0,
      ack: (flags & 0x10) !== 0,
      psh: (flags & 0x08) !== 0,
      rst: (flags & 0x04) !== 0,
      syn: (flags & 0x02) !== 0,
      fin: (flags & 0x01) !== 0,
    };

    // Parse TCP options if present
    let options: TCPOptions | undefined;
    if (dataOffset > 20) {
      options = this.parseTCPOptions(data.slice(offset + 20, offset + dataOffset));
    }

    return {
      tcp: {
        sourcePort,
        destinationPort,
        sequenceNumber,
        acknowledgmentNumber,
        dataOffset,
        reserved,
        flags: flagsObj,
        windowSize,
        checksum,
        urgentPointer,
        options,
        mss: options?.mss,
        windowScale: options?.windowScale,
        sackPermitted: options?.sackPermitted,
        sackBlocks: options?.sackBlocks,
        timestamp: options?.timestamp,
      },
      offset: offset + dataOffset,
    };
  }

  private parseTCPOptions(data: Uint8Array): TCPOptions | undefined {
    const options: TCPOptions = {};
    let offset = 0;

    while (offset < data.length) {
      const kind = data[offset];

      if (kind === 0) break; // End of options
      if (kind === 1) {
        // NOP
        options.nop = true;
        offset++;
        continue;
      }

      if (offset + 1 >= data.length) break;
      const length = data[offset + 1];
      if (length < 2 || offset + length > data.length) break;

      switch (kind) {
        case 2: // MSS
          if (length === 4) {
            options.mss = (data[offset + 2] << 8) | data[offset + 3];
          }
          break;
        case 3: // Window Scale
          if (length === 3) {
            options.windowScale = data[offset + 2];
          }
          break;
        case 4: // SACK Permitted
          if (length === 2) {
            options.sackPermitted = true;
          }
          break;
        case 5: // SACK
          if (length >= 10 && (length - 2) % 8 === 0) {
            options.sackBlocks = [];
            for (let i = offset + 2; i < offset + length; i += 8) {
              options.sackBlocks.push({
                left: 
                  (data[i] << 24) | 
                  (data[i + 1] << 16) | 
                  (data[i + 2] << 8) | 
                  data[i + 3],
                right: 
                  (data[i + 4] << 24) | 
                  (data[i + 5] << 16) | 
                  (data[i + 6] << 8) | 
                  data[i + 7],
              });
            }
          }
          break;
        case 8: // Timestamp
          if (length === 10) {
            options.timestamp = {
              value: 
                (data[offset + 2] << 24) | 
                (data[offset + 3] << 16) | 
                (data[offset + 4] << 8) | 
                data[offset + 5],
              echoReply: 
                (data[offset + 6] << 24) | 
                (data[offset + 7] << 16) | 
                (data[offset + 8] << 8) | 
                data[offset + 9],
            };
          }
          break;
      }

      offset += length;
    }

    return Object.keys(options).length > 0 ? options : undefined;
  }

  private parseUDPHeader(data: Uint8Array, offset: number): { udp: UDPHeader; offset: number } {
    const sourcePort = (data[offset] << 8) | data[offset + 1];
    const destinationPort = (data[offset + 2] << 8) | data[offset + 3];
    const length = (data[offset + 4] << 8) | data[offset + 5];
    const checksum = (data[offset + 6] << 8) | data[offset + 7];

    return {
      udp: {
        sourcePort,
        destinationPort,
        length,
        checksum,
      },
      offset: offset + 8,
    };
  }

  private parseSCTPHeader(data: Uint8Array, offset: number): { sctp: SCTPHeader; offset: number } {
    const sourcePort = (data[offset] << 8) | data[offset + 1];
    const destinationPort = (data[offset + 2] << 8) | data[offset + 3];
    const verificationTag = 
      (data[offset + 4] << 24) | 
      (data[offset + 5] << 16) | 
      (data[offset + 6] << 8) | 
      data[offset + 7];
    const checksum = 
      (data[offset + 8] << 24) | 
      (data[offset + 9] << 16) | 
      (data[offset + 10] << 8) | 
      data[offset + 11];

    const chunks: SCTPChunk[] = [];
    let chunkOffset = offset + 12;

    while (chunkOffset < data.length) {
      const chunkType = data[chunkOffset];
      const chunkFlags = data[chunkOffset + 1];
      const chunkLength = (data[chunkOffset + 2] << 8) | data[chunkOffset + 3];

      if (chunkLength < 4) break;

      chunks.push({
        type: chunkType,
        flags: chunkFlags,
        length: chunkLength,
        data: data.slice(chunkOffset + 4, chunkOffset + chunkLength),
      });

      // Pad to 4-byte boundary
      chunkOffset += Math.ceil(chunkLength / 4) * 4;
    }

    return {
      sctp: {
        sourcePort,
        destinationPort,
        verificationTag,
        checksum,
        chunks,
      },
      offset: chunkOffset,
    };
  }

  private detectL7Protocol(sourcePort: number, destinationPort: number, payload: Uint8Array): L7Protocol {
    const ports = [sourcePort, destinationPort];

    // Port-based detection
    if (ports.includes(53)) return "DNS";
    if (ports.includes(80)) return "HTTP";
    if (ports.includes(443)) return "HTTPS";
    if (ports.includes(22)) return "SSH";
    if (ports.includes(21) || ports.includes(20)) return "FTP";
    if (ports.includes(25)) return "SMTP";
    if (ports.includes(110)) return "POP3";
    if (ports.includes(143)) return "IMAP";
    if (ports.includes(23)) return "TELNET";
    if (ports.includes(123)) return "NTP";
    if (ports.includes(161) || ports.includes(162)) return "SNMP";
    if (ports.includes(67) || ports.includes(68)) return "DHCP";

    // Content-based detection
    if (payload.length > 0) {
      const text = new TextDecoder().decode(payload.slice(0, 20)).toUpperCase();
      
      if (text.startsWith("GET ") || 
          text.startsWith("POST ") || 
          text.startsWith("PUT ") || 
          text.startsWith("DELETE ") ||
          text.startsWith("HTTP/")) {
        return "HTTP";
      }

      if (text.startsWith("SSH-")) {
        return "SSH";
      }

      // TLS handshake detection
      if (payload[0] === 0x16 && payload.length > 5) {
        return "TLS";
      }

      // QUIC detection
      if ((payload[0] & 0x80) !== 0 && payload.length > 5) {
        // Check for QUIC version
        const version = 
          (payload[1] << 24) | 
          (payload[2] << 16) | 
          (payload[3] << 8) | 
          payload[4];
        if ((version & 0xff000000) === 0xff000000) {
          return "QUIC";
        }
      }
    }

    return "UNKNOWN";
  }

  private parseHTTP(payload: Uint8Array, hasTCP: boolean): HTTPData | undefined {
    const text = new TextDecoder().decode(payload);
    const lines = text.split("\r\n");
    
    if (lines.length === 0) return undefined;

    const firstLine = lines[0];
    const isRequest = /^[A-Z]+\s+\S+\s+HTTP\/\d\.\d$/.test(firstLine);
    
    const headers: Record<string, string> = {};
    let bodyOffset = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === "") {
        bodyOffset = text.indexOf("\r\n\r\n") + 4;
        break;
      }
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const name = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        headers[name.toLowerCase()] = value;
      }
    }

    const contentLength = headers["content-length"] 
      ? parseInt(headers["content-length"], 10) 
      : undefined;
    const chunked = headers["transfer-encoding"]?.includes("chunked") ?? false;
    const keepAlive = headers["connection"]?.includes("keep-alive") ?? true;
    const upgrade = headers["upgrade"];

    if (isRequest) {
      const parts = firstLine.split(" ");
      return {
        isRequest: true,
        method: parts[0],
        url: parts[1],
        version: parts[2],
        headers,
        body: bodyOffset > 0 ? payload.slice(bodyOffset) : undefined,
        bodyLength: contentLength ?? (bodyOffset > 0 ? payload.length - bodyOffset : 0),
        chunked,
        contentLength,
        keepAlive,
        upgrade,
      };
    } else {
      const parts = firstLine.split(" ");
      const statusCode = parseInt(parts[1], 10);
      const statusText = parts.slice(2).join(" ");
      
      return {
        isRequest: false,
        version: parts[0],
        statusCode,
        statusText,
        headers,
        body: bodyOffset > 0 ? payload.slice(bodyOffset) : undefined,
        bodyLength: contentLength ?? (bodyOffset > 0 ? payload.length - bodyOffset : 0),
        chunked,
        contentLength,
        keepAlive,
        upgrade,
      };
    }
  }

  private parseDNS(payload: Uint8Array): DNSData | undefined {
    if (payload.length < 12) return undefined;

    const transactionId = (payload[0] << 8) | payload[1];
    const flags = (payload[2] << 8) | payload[3];
    const qdcount = (payload[4] << 8) | payload[5];
    const ancount = (payload[6] << 8) | payload[7];
    const nscount = (payload[8] << 8) | payload[9];
    const arcount = (payload[10] << 8) | payload[11];

    const flagsObj: DNSFlags = {
      qr: ((flags >> 15) & 0x1) === 1,
      opcode: (flags >> 11) & 0xf,
      aa: ((flags >> 10) & 0x1) === 1,
      tc: ((flags >> 9) & 0x1) === 1,
      rd: ((flags >> 8) & 0x1) === 1,
      ra: ((flags >> 7) & 0x1) === 1,
      z: (flags >> 4) & 0x7,
      rcode: flags & 0xf,
    };

    let offset = 12;
    const questions: DNSQuestion[] = [];

    for (let i = 0; i < qdcount && offset < payload.length; i++) {
      const name = this.parseDNSName(payload, offset);
      if (!name) break;
      offset = name.newOffset;
      
      if (offset + 4 > payload.length) break;
      const type = (payload[offset] << 8) | payload[offset + 1];
      const qclass = (payload[offset + 2] << 8) | payload[offset + 3];
      offset += 4;

      questions.push({ name: name.name, type, class: qclass });
    }

    const answers: DNSAnswer[] = [];
    for (let i = 0; i < ancount && offset < payload.length; i++) {
      const record = this.parseDNSRecord(payload, offset);
      if (!record) break;
      offset = record.newOffset;
      answers.push(record as DNSAnswer);
    }

    const authority: DNSRecord[] = [];
    for (let i = 0; i < nscount && offset < payload.length; i++) {
      const record = this.parseDNSRecord(payload, offset);
      if (!record) break;
      offset = record.newOffset;
      authority.push(record);
    }

    const additional: DNSRecord[] = [];
    for (let i = 0; i < arcount && offset < payload.length; i++) {
      const record = this.parseDNSRecord(payload, offset);
      if (!record) break;
      offset = record.newOffset;
      additional.push(record);
    }

    return {
      transactionId,
      flags: flagsObj,
      questions,
      answers,
      authority,
      additional,
    };
  }

  private parseDNSName(data: Uint8Array, offset: number): { name: string; newOffset: number } | null {
    const labels: string[] = [];
    let jumped = false;
    let jumpOffset = 0;
    let maxJumps = 5;

    while (offset < data.length) {
      const length = data[offset];

      if (length === 0) {
        offset++;
        break;
      }

      // Compression pointer
      if ((length & 0xc0) === 0xc0) {
        if (offset + 1 >= data.length) return null;
        
        if (!jumped) {
          jumpOffset = offset + 2;
        }
        
        offset = ((length & 0x3f) << 8) | data[offset + 1];
        jumped = true;
        maxJumps--;
        
        if (maxJumps === 0) return null;
        continue;
      }

      if (length > 63) return null;
      
      if (offset + 1 + length > data.length) return null;
      
      const label = new TextDecoder().decode(data.slice(offset + 1, offset + 1 + length));
      labels.push(label);
      offset += 1 + length;
    }

    return { 
      name: labels.join("."), 
      newOffset: jumped ? jumpOffset : offset 
    };
  }

  private parseDNSRecord(
    data: Uint8Array, 
    offset: number
  ): (DNSRecord & { newOffset: number }) | null {
    const name = this.parseDNSName(data, offset);
    if (!name) return null;
    offset = name.newOffset;

    if (offset + 10 > data.length) return null;

    const type = (data[offset] << 8) | data[offset + 1];
    const rclass = (data[offset + 2] << 8) | data[offset + 3];
    const ttl = 
      (data[offset + 4] << 24) | 
      (data[offset + 5] << 16) | 
      (data[offset + 6] << 8) | 
      data[offset + 7];
    const rdlength = (data[offset + 8] << 8) | data[offset + 9];
    offset += 10;

    if (offset + rdlength > data.length) return null;

    const rdata = data.slice(offset, offset + rdlength);
    let rdataString: string | undefined;

    // Parse common record types
    if (type === 1 && rdlength === 4) {
      // A record
      rdataString = this.formatIPv4(rdata);
    } else if (type === 28 && rdlength === 16) {
      // AAAA record
      rdataString = this.formatIPv6(rdata);
    } else if (type === 5 || type === 2 || type === 12) {
      // CNAME, NS, PTR
      const parsed = this.parseDNSName(data, offset);
      if (parsed) {
        rdataString = parsed.name;
      }
    }

    return {
      name: name.name,
      type,
      class: rclass,
      rdata,
      rdataString,
      ttl,
      newOffset: offset + rdlength,
    };
  }

  private parseTLS(payload: Uint8Array): TLSData | undefined {
    if (payload.length < 6) return undefined;

    const contentType = payload[0];
    if (contentType !== 0x16) return undefined; // Not a handshake

    const version = (payload[1] << 8) | payload[2];
    const length = (payload[3] << 8) | payload[4];

    if (payload.length < 5 + length) return undefined;

    const handshakeType = payload[5];
    const handshakeLength = 
      (payload[6] << 16) | 
      (payload[7] << 8) | 
      payload[8];

    let handshake: TLSHandshake | undefined;
    let sni: string | undefined;
    let alpn: string[] | undefined;

    if (handshakeType === 1) {
      // Client Hello
      handshake = this.parseClientHello(payload.slice(9, 9 + handshakeLength));
      if (handshake) {
        sni = this.extractSNI(payload.slice(9, 9 + handshakeLength));
        alpn = this.extractALPN(payload.slice(9, 9 + handshakeLength));
      }
    } else if (handshakeType === 2) {
      // Server Hello
      handshake = this.parseServerHello(payload.slice(9, 9 + handshakeLength));
    }

    const versionStr = version === 0x0301 ? "TLS 1.0" :
                       version === 0x0302 ? "TLS 1.1" :
                       version === 0x0303 ? "TLS 1.2" :
                       version === 0x0304 ? "TLS 1.3" :
                       `0x${version.toString(16)}`;

    return {
      version: versionStr,
      handshake,
      sni,
      alpn,
    };
  }

  private parseClientHello(data: Uint8Array): TLSHandshake | undefined {
    if (data.length < 34) return undefined;

    const version = (data[0] << 8) | data[1];
    const random = data.slice(2, 34);

    let offset = 34;
    const sessionIdLength = data[offset];
    offset += 1 + sessionIdLength;

    if (offset + 2 > data.length) return undefined;
    const cipherSuitesLength = (data[offset] << 8) | data[offset + 1];
    offset += 2;

    const cipherSuites: number[] = [];
    for (let i = 0; i < cipherSuitesLength; i += 2) {
      if (offset + i + 1 < data.length) {
        cipherSuites.push((data[offset + i] << 8) | data[offset + i + 1]);
      }
    }
    offset += cipherSuitesLength;

    if (offset >= data.length) return undefined;
    const compressionMethodsLength = data[offset];
    offset += 1 + compressionMethodsLength;

    return {
      type: "client_hello",
      version: `0x${version.toString(16)}`,
      random,
      sessionId: sessionIdLength > 0 ? data.slice(34, 34 + sessionIdLength) : undefined,
      cipherSuites,
      compressionMethods: [],
    };
  }

  private parseServerHello(data: Uint8Array): TLSHandshake | undefined {
    if (data.length < 34) return undefined;

    const version = (data[0] << 8) | data[1];
    const random = data.slice(2, 34);

    let offset = 34;
    const sessionIdLength = data[offset];
    offset += 1 + sessionIdLength;

    if (offset + 2 > data.length) return undefined;
    const cipherSuite = (data[offset] << 8) | data[offset + 1];
    offset += 2;

    return {
      type: "server_hello",
      version: `0x${version.toString(16)}`,
      random,
      sessionId: sessionIdLength > 0 ? data.slice(34, 34 + sessionIdLength) : undefined,
      cipherSuites: [cipherSuite],
    };
  }

  private extractSNI(data: Uint8Array): string | undefined {
    // Simplified SNI extraction - would need full extension parsing
    return undefined;
  }

  private extractALPN(data: Uint8Array): string[] | undefined {
    // Simplified ALPN extraction - would need full extension parsing
    return undefined;
  }

  // Utility methods

  private formatMAC(data: Uint8Array): string {
    return Array.from(data)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(":");
  }

  private formatIPv4(data: Uint8Array): string {
    return Array.from(data).join(".");
  }

  private formatIPv6(data: Uint8Array): string {
    const parts: string[] = [];
    for (let i = 0; i < 16; i += 2) {
      parts.push(((data[i] << 8) | data[i + 1]).toString(16));
    }
    return parts.join(":");
  }

  private serializeFlowKey(key: FlowKey): string {
    return `${key.protocol}:${key.sourceIP}:${key.sourcePort}:${key.destinationIP}:${key.destinationPort}`;
  }

  private deserializeFlowKey(serialized: string): FlowKey {
    const parts = serialized.split(":");
    return {
      protocol: parts[0] as FlowKey["protocol"],
      sourceIP: parts[1],
      sourcePort: parseInt(parts[2], 10),
      destinationIP: parts[3],
      destinationPort: parseInt(parts[4], 10),
    };
  }

  private async startPacketProcessing(): Promise<void> {
    if (!this.process) return;

    // Read from tcpdump stdout
    const reader = this.process.stdout.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // tcpdump outputs pcap format to stdout
        // Parse pcap records
        await this.processPcapData(value);
      }
    } catch (error) {
      console.error("Error reading from capture process:", error);
      if (this.session) {
        this.session.status = "error";
        this.session.errorMessage = String(error);
      }
    }
  }

  private async processPcapData(data: Uint8Array): Promise<void> {
    // Parse pcap records (global header already handled by tcpdump -w -)
    // Each packet record: ts_sec(4) + ts_usec(4) + incl_len(4) + orig_len(4) + data
    
    let offset = 0;
    while (offset + 16 <= data.length) {
      const tsSec = 
        (data[offset] << 24) | 
        (data[offset + 1] << 16) | 
        (data[offset + 2] << 8) | 
        data[offset + 3];
      const tsUsec = 
        (data[offset + 4] << 24) | 
        (data[offset + 5] << 16) | 
        (data[offset + 6] << 8) | 
        data[offset + 7];
      const inclLen = 
        (data[offset + 8] << 24) | 
        (data[offset + 9] << 16) | 
        (data[offset + 10] << 8) | 
        data[offset + 11];
      const origLen = 
        (data[offset + 12] << 24) | 
        (data[offset + 13] << 16) | 
        (data[offset + 14] << 8) | 
        data[offset + 15];

      if (offset + 16 + inclLen > data.length) break;

      const packetData = data.slice(offset + 16, offset + 16 + inclLen);
      const timestamp = new Date(tsSec * 1000 + Math.floor(tsUsec / 1000));

      const rawPacket: RawPacket = {
        timestamp,
        interfaceName: this.config.interfaceName,
        snapLength: inclLen,
        originalLength: origLen,
        data: packetData,
        linkType: "ETHERNET", // Assuming Ethernet for tcpdump
      };

      this.packetQueue.push(rawPacket);
      
      if (this.packetQueue.length >= this.config.maxPacketsPerBatch) {
        await this.processPacketQueue();
      }

      offset += 16 + inclLen;
    }
  }

  private async processPacketQueue(): Promise<void> {
    while (this.packetQueue.length > 0) {
      const raw = this.packetQueue.shift()!;
      const parsed = this.parsePacket(raw);

      if (parsed) {
        // Update session stats
        if (this.session) {
          this.session.packetCount++;
          this.session.byteCount += raw.originalLength;
        }

        // Update flow table
        const flowKey = this.extractFlowKey(parsed);
        if (flowKey) {
          this.updateFlowTable(flowKey, parsed);
        }

        // Notify handlers
        const event: PacketCaptureEvent = {
          type: "packet",
          timestamp: raw.timestamp,
          sessionId: this.session?.id ?? "unknown",
          packet: parsed,
          flowKey,
        };

        for (const handler of this.handlers) {
          try {
            await handler(event);
          } catch (error) {
            console.error("Handler error:", error);
          }
        }
      }
    }
  }

  private extractFlowKey(packet: ParsedPacket): FlowKey | undefined {
    const srcIP = packet.ipv4?.sourceIP ?? packet.ipv6?.sourceIP;
    const dstIP = packet.ipv4?.destinationIP ?? packet.ipv6?.destinationIP;

    if (!srcIP || !dstIP) return undefined;

    let protocol: FlowKey["protocol"];
    let srcPort = 0;
    let dstPort = 0;

    if (packet.tcp) {
      protocol = "TCP";
      srcPort = packet.tcp.sourcePort;
      dstPort = packet.tcp.destinationPort;
    } else if (packet.udp) {
      protocol = "UDP";
      srcPort = packet.udp.sourcePort;
      dstPort = packet.udp.destinationPort;
    } else if (packet.icmp) {
      protocol = "ICMP";
    } else {
      protocol = "OTHER";
    }

    // Normalize flow key (lower IP/port first for consistency)
    if (srcIP > dstIP || (srcIP === dstIP && srcPort > dstPort)) {
      return {
        protocol,
        sourceIP: dstIP,
        destinationIP: srcIP,
        sourcePort: dstPort,
        destinationPort: srcPort,
      };
    }

    return {
      protocol,
      sourceIP: srcIP,
      destinationIP: dstIP,
      sourcePort: srcPort,
      destinationPort: dstPort,
    };
  }

  private updateFlowTable(key: FlowKey, packet: ParsedPacket): void {
    const serialized = this.serializeFlowKey(key);
    const now = new Date();

    let stats = this.flowTable.get(serialized);
    if (!stats) {
      stats = {
        packetCount: 0,
        byteCount: 0,
        synCount: 0,
        finCount: 0,
        rstCount: 0,
        retransmits: 0,
        outOfOrder: 0,
        startTime: now,
        lastSeen: now,
        tcpState: "SYN_SENT",
      };
      this.flowTable.set(serialized, stats);

      // Emit flow start event
      this.emitFlowEvent("flow_start", key, stats);
    }

    stats.packetCount++;
    stats.byteCount += packet.payloadLength;
    stats.lastSeen = now;

    // Track TCP state
    if (packet.tcp) {
      if (packet.tcp.flags.syn) stats.synCount++;
      if (packet.tcp.flags.fin) stats.finCount++;
      if (packet.tcp.flags.rst) stats.rstCount++;

      // Simple state machine
      if (packet.tcp.flags.rst) {
        stats.tcpState = "CLOSED";
      } else if (packet.tcp.flags.fin) {
        stats.tcpState = stats.tcpState === "ESTABLISHED" ? "FIN_WAIT" : "CLOSE_WAIT";
      } else if (packet.tcp.flags.syn && packet.tcp.flags.ack) {
        stats.tcpState = "ESTABLISHED";
      }
    }

    // Emit flow update event periodically (every 10 packets)
    if (stats.packetCount % 10 === 0) {
      this.emitFlowEvent("flow_update", key, stats);
    }
  }

  private emitFlowEvent(
    type: "flow_start" | "flow_update" | "flow_end",
    flowKey: FlowKey,
    flowStats: FlowStats
  ): void {
    const event: PacketCaptureEvent = {
      type,
      timestamp: new Date(),
      sessionId: this.session?.id ?? "unknown",
      flowKey,
      flowStats,
    };

    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error("Handler error:", error);
      }
    }
  }

  private async runCommand(
    args: string[],
    timeoutMs: number
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // Process might have already exited
      }
    }, timeoutMs);

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    clearTimeout(timeout);

    return { exitCode, stdout, stderr };
  }
}

// Convenience function to create capture engine
export function createPacketCaptureEngine(
  config?: Partial<PacketCaptureConfig>
): PacketCaptureEngine {
  return new PacketCaptureEngine(config);
}

// Helper to get well-known port mappings
export const WELL_KNOWN_PORTS: Record<number, string> = {
  20: "FTP-DATA",
  21: "FTP",
  22: "SSH",
  23: "TELNET",
  25: "SMTP",
  53: "DNS",
  67: "DHCP-SERVER",
  68: "DHCP-CLIENT",
  80: "HTTP",
  110: "POP3",
  123: "NTP",
  143: "IMAP",
  161: "SNMP",
  162: "SNMP-TRAP",
  443: "HTTPS",
  445: "SMB",
  587: "SMTP-SUBMISSION",
  853: "DNS-OVER-TLS",
  990: "FTPS",
  993: "IMAPS",
  995: "POP3S",
  1883: "MQTT",
  3306: "MYSQL",
  3389: "RDP",
  5432: "POSTGRESQL",
  5672: "AMQP",
  6379: "REDIS",
  8080: "HTTP-ALT",
  8443: "HTTPS-ALT",
  9200: "ELASTICSEARCH",
  27017: "MONGODB",
};

// Export default configuration values
export { DEFAULT_CONFIG };
