export type NetworkMode = "AUTONET_ASSIST" | "UNIVERSAL_INTEL";
export type InterfaceType = "wifi" | "ethernet" | "loopback" | "tunnel" | "other";

export interface NetworkInterfaceSummary {
  name: string;
  type: InterfaceType;
  status: "UP" | "DOWN";
  ipv4?: string;
  ipv6?: string;
  mac?: string;
}

export interface NetworkAlert {
  severity: "INFO" | "WARNING" | "CRITICAL";
  code: string;
  title: string;
  detail: string;
  recommendation: string;
}

export interface ConnectionBreakdown {
  tcpEstablished: number;
  tcpListening: number;
  udpSockets: number;
  localLoopbackEstablished: number;
  remoteEstablished: number;
  arpPeers: number;
}

export interface ThroughputSnapshot {
  rxBytes: number;
  txBytes: number;
  rxBps: number;
  txBps: number;
  sampledAt: Date;
}

export interface WifiContext {
  ssid?: string;
  security?: string;
  bssid?: string;
  interfaceType?: string;
}

export interface NetworkEndpointSummary {
  endpoint: string;
  connections: number;
}

export interface SniffnetParity {
  overviewTelemetry: boolean;
  inspectFlows: boolean;
  notificationEngine: boolean;
  limitations: string[];
}

export type UniversalTelemetryEventType =
  | "ALERT"
  | "ANOMALY"
  | "THROUGHPUT"
  | "FLOW"
  | "CONNECTION_SNAPSHOT"
  | "INTERFACE"
  | "DNS"
  | "WIFI";

export interface UniversalTelemetryEvent {
  id: string;
  capturedAt: Date;
  eventType: UniversalTelemetryEventType;
  severity: "INFO" | "WARNING" | "CRITICAL";
  source: string;
  title: string;
  summary: string;
  detail: string;
  interfaceName?: string;
  data: Record<string, unknown>;
}

export interface NetworkIntelligenceSnapshot {
  generatedAt: Date;
  mode: NetworkMode;
  selectedInterface: string | null;
  defaultInterface: string | null;
  gateway: string | null;
  dnsServers: string[];
  interfaces: NetworkInterfaceSummary[];
  wifi: WifiContext | null;
  throughput: ThroughputSnapshot | null;
  connections: ConnectionBreakdown;
  topEndpoints: NetworkEndpointSummary[];
  anomalyScore: number;
  alerts: NetworkAlert[];
  parity: SniffnetParity;
  telemetryEvents: UniversalTelemetryEvent[];
}

interface ByteCounter {
  rxBytes: number;
  txBytes: number;
  sampledAtMs: number;
}

interface ConnectionParseResult {
  breakdown: ConnectionBreakdown;
  topEndpoints: NetworkEndpointSummary[];
  sampledFlows: Array<{
    protocol: "tcp" | "udp";
    local: string;
    remote: string;
    state: string;
  }>;
}

interface CachedSnapshot {
  snapshot: NetworkIntelligenceSnapshot;
  timestampMs: number;
}

export class NetworkIntelligenceEngine {
  private readonly snapshotTtlMs = 5_000;
  private cached: CachedSnapshot | null = null;
  private lastCounters = new Map<string, ByteCounter>();
  private trafficHistory: number[] = [];

  async listInterfaces(forceRefresh = false): Promise<NetworkInterfaceSummary[]> {
    const snapshot = await this.getSnapshot({
      mode: "UNIVERSAL_INTEL",
      selectedInterface: null,
      forceRefresh,
    });
    return snapshot.interfaces;
  }

  async getSnapshot(config: {
    mode: NetworkMode;
    selectedInterface?: string | null;
    forceRefresh?: boolean;
  }): Promise<NetworkIntelligenceSnapshot> {
    const forceRefresh = Boolean(config.forceRefresh);
    if (!forceRefresh && this.cached && Date.now() - this.cached.timestampMs < this.snapshotTtlMs) {
      if (this.cached.snapshot.mode === config.mode && this.cached.snapshot.selectedInterface === (config.selectedInterface || null)) {
        return this.cached.snapshot;
      }
    }

    const generatedAt = new Date();
    const interfaces = await this.collectInterfaces();
    const { defaultInterface, gateway } = await this.getDefaultRoute();
    const selectedInterface = this.selectInterface(interfaces, defaultInterface, config.selectedInterface || null);

    const dnsServers = await this.getDnsServers();
    const wifi = selectedInterface ? await this.getWifiContext(selectedInterface) : null;
    const throughput = selectedInterface ? await this.getThroughput(selectedInterface, generatedAt) : null;
    const connectionResult = await this.getConnectionBreakdown();

    const anomalyScore = this.calculateAnomalyScore(throughput);
    const alerts = this.generateAlerts({
      selectedInterface,
      gateway,
      wifi,
      throughput,
      dnsServers,
      anomalyScore,
      connectionBreakdown: connectionResult.breakdown,
      topEndpoints: connectionResult.topEndpoints,
    });

    const snapshot: NetworkIntelligenceSnapshot = {
      generatedAt,
      mode: config.mode,
      selectedInterface,
      defaultInterface,
      gateway,
      dnsServers,
      interfaces,
      wifi,
      throughput,
      connections: connectionResult.breakdown,
      topEndpoints: connectionResult.topEndpoints,
      anomalyScore,
      alerts,
      parity: {
        overviewTelemetry: Boolean(selectedInterface && throughput),
        inspectFlows: connectionResult.topEndpoints.length > 0,
        notificationEngine: alerts.length > 0,
        limitations: [
          "No deep packet payload decode in this phase.",
          "No built-in geolocation/ASN enrichment without optional offline DB integration.",
          "Flow intelligence uses host socket tables rather than packet capture engine.",
        ],
      },
      telemetryEvents: this.buildTelemetryEvents({
        generatedAt,
        selectedInterface,
        gateway,
        dnsServers,
        wifi,
        throughput,
        anomalyScore,
        alerts,
        connectionBreakdown: connectionResult.breakdown,
        topEndpoints: connectionResult.topEndpoints,
        sampledFlows: connectionResult.sampledFlows,
      }),
    };

    this.cached = { snapshot, timestampMs: Date.now() };
    return snapshot;
  }

  private async collectInterfaces(): Promise<NetworkInterfaceSummary[]> {
    const listResult = await this.runCommand(["ifconfig", "-l"], 3_000);
    const names = listResult.stdout.trim().split(/\s+/).filter(Boolean);

    const interfaces: NetworkInterfaceSummary[] = [];
    for (const name of names) {
      const result = await this.runCommand(["ifconfig", name], 2_000);
      const info = this.parseIfconfig(name, result.stdout);
      interfaces.push(info);
    }
    return interfaces;
  }

  private parseIfconfig(name: string, text: string): NetworkInterfaceSummary {
    const statusMatch = text.match(/status:\s*([^\n]+)/i);
    const ipv4Match = text.match(/\binet\s+(\d+\.\d+\.\d+\.\d+)/);
    const ipv6Match = text.match(/\binet6\s+([0-9a-f:]+)/i);
    const macMatch = text.match(/\bether\s+([0-9a-f:]+)/i);
    const type = this.guessInterfaceType(name);
    const statusRaw = statusMatch?.[1]?.trim().toLowerCase();

    return {
      name,
      type,
      status: statusRaw === "active" || statusRaw === "up" ? "UP" : "DOWN",
      ipv4: ipv4Match?.[1],
      ipv6: ipv6Match?.[1],
      mac: macMatch?.[1],
    };
  }

  private guessInterfaceType(name: string): InterfaceType {
    if (name.startsWith("lo")) return "loopback";
    if (name.startsWith("en")) return "ethernet";
    if (name.startsWith("awdl") || name.startsWith("llw")) return "wifi";
    if (name.startsWith("utun")) return "tunnel";
    return "other";
  }

  private async getDefaultRoute(): Promise<{ defaultInterface: string | null; gateway: string | null }> {
    const result = await this.runCommand(["route", "-n", "get", "default"], 3_000);
    if (result.exitCode !== 0) {
      return { defaultInterface: null, gateway: null };
    }
    const interfaceMatch = result.stdout.match(/interface:\s*([^\n]+)/i);
    const gatewayMatch = result.stdout.match(/gateway:\s*([^\n]+)/i);
    return {
      defaultInterface: interfaceMatch?.[1]?.trim() || null,
      gateway: gatewayMatch?.[1]?.trim() || null,
    };
  }

  private selectInterface(
    interfaces: NetworkInterfaceSummary[],
    defaultInterface: string | null,
    selectedInterface: string | null,
  ): string | null {
    if (selectedInterface && interfaces.some((item) => item.name === selectedInterface)) {
      return selectedInterface;
    }
    if (defaultInterface && interfaces.some((item) => item.name === defaultInterface)) {
      return defaultInterface;
    }
    const active = interfaces.find((item) => item.status === "UP" && item.type !== "loopback");
    return active?.name || null;
  }

  private async getDnsServers(): Promise<string[]> {
    const result = await this.runCommand(["scutil", "--dns"], 3_000);
    const servers = new Set<string>();

    for (const line of result.stdout.split(/\r?\n/)) {
      const match = line.match(/nameserver\[\d+\]\s*:\s*([^\s]+)/);
      if (match?.[1]) {
        servers.add(match[1].trim());
      }
    }

    return Array.from(servers).slice(0, 8);
  }

  private async getWifiContext(interfaceName: string): Promise<WifiContext | null> {
    const summary = await this.runCommand(["ipconfig", "getsummary", interfaceName], 3_000);
    if (!summary.stdout.trim()) {
      return null;
    }

    const ssidMatch = summary.stdout.match(/SSID\s*:\s*([^\n]+)/);
    const securityMatch = summary.stdout.match(/Security\s*:\s*([^\n]+)/);
    const bssidMatch = summary.stdout.match(/BSSID\s*:\s*([^\n]+)/);
    const typeMatch = summary.stdout.match(/InterfaceType\s*:\s*([^\n]+)/);

    const ssid = ssidMatch?.[1]?.trim();
    const security = securityMatch?.[1]?.trim();
    const bssid = bssidMatch?.[1]?.trim();
    const interfaceType = typeMatch?.[1]?.trim();

    if (!ssid && !security && !bssid && !interfaceType) {
      return null;
    }

    return {
      ssid,
      security,
      bssid,
      interfaceType,
    };
  }

  private async getThroughput(interfaceName: string, generatedAt: Date): Promise<ThroughputSnapshot | null> {
    const result = await this.runCommand(["netstat", "-bI", interfaceName], 3_000);
    if (!result.stdout.trim()) {
      return null;
    }

    const line = result.stdout
      .split(/\r?\n/)
      .find((row) => row.trim().startsWith(`${interfaceName} `) && row.trim().split(/\s+/).length >= 10);
    if (!line) {
      return null;
    }

    const parts = line.trim().split(/\s+/);
    const rxBytes = Number(parts[6]);
    const txBytes = Number(parts[9]);
    if (!Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) {
      return null;
    }

    const nowMs = generatedAt.getTime();
    const previous = this.lastCounters.get(interfaceName);
    let rxBps = 0;
    let txBps = 0;
    if (previous) {
      const elapsedSec = (nowMs - previous.sampledAtMs) / 1000;
      if (elapsedSec > 0) {
        rxBps = Math.max(0, Math.round((rxBytes - previous.rxBytes) / elapsedSec));
        txBps = Math.max(0, Math.round((txBytes - previous.txBytes) / elapsedSec));
      }
    }

    this.lastCounters.set(interfaceName, {
      rxBytes,
      txBytes,
      sampledAtMs: nowMs,
    });

    return {
      rxBytes,
      txBytes,
      rxBps,
      txBps,
      sampledAt: generatedAt,
    };
  }

  private async getConnectionBreakdown(): Promise<ConnectionParseResult> {
    const result = await this.runCommand(["netstat", "-an"], 4_000);
    const lines = result.stdout.split(/\r?\n/);
    let tcpEstablished = 0;
    let tcpListening = 0;
    let udpSockets = 0;
    let localLoopbackEstablished = 0;
    let remoteEstablished = 0;
    const endpointCounter = new Map<string, number>();
    const sampledFlows: ConnectionParseResult["sampledFlows"] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("udp")) {
        udpSockets += 1;
        const udpParts = trimmed.split(/\s+/);
        if (udpParts.length >= 5 && sampledFlows.length < 80) {
          sampledFlows.push({
            protocol: "udp",
            local: udpParts[3] || "",
            remote: udpParts[4] || "",
            state: "UNCONNECTED",
          });
        }
        continue;
      }
      if (!trimmed.startsWith("tcp")) {
        continue;
      }

      const parts = trimmed.split(/\s+/);
      if (parts.length < 5) continue;
      const local = parts[3] || "";
      const foreign = parts[4] || "";
      const state = parts[parts.length - 1] || "";

      if (state === "ESTABLISHED") {
        tcpEstablished += 1;
        const isLoopback = foreign.startsWith("127.") || foreign.startsWith("::1.");
        if (isLoopback) {
          localLoopbackEstablished += 1;
        } else {
          remoteEstablished += 1;
          endpointCounter.set(foreign, (endpointCounter.get(foreign) || 0) + 1);
          if (sampledFlows.length < 240) {
            sampledFlows.push({
              protocol: "tcp",
              local,
              remote: foreign,
              state,
            });
          }
        }
      } else if (state === "LISTEN") {
        tcpListening += 1;
        if (sampledFlows.length < 240) {
          sampledFlows.push({
            protocol: "tcp",
            local,
            remote: foreign,
            state,
          });
        }
      }
    }

    const arpResult = await this.runCommand(["arp", "-an"], 2_000);
    const arpPeers = arpResult.stdout
      .split(/\r?\n/)
      .filter((row) => /\(\d+\.\d+\.\d+\.\d+\)/.test(row))
      .filter((row) => !row.includes("(224.0.0.251)"))
      .length;

    const topEndpoints = Array.from(endpointCounter.entries())
      .map(([endpoint, connections]) => ({ endpoint, connections }))
      .sort((a, b) => b.connections - a.connections)
      .slice(0, 8);

    return {
      breakdown: {
        tcpEstablished,
        tcpListening,
        udpSockets,
        localLoopbackEstablished,
        remoteEstablished,
        arpPeers,
      },
      topEndpoints,
      sampledFlows,
    };
  }

  private buildTelemetryEvents(params: {
    generatedAt: Date;
    selectedInterface: string | null;
    gateway: string | null;
    dnsServers: string[];
    wifi: WifiContext | null;
    throughput: ThroughputSnapshot | null;
    anomalyScore: number;
    alerts: NetworkAlert[];
    connectionBreakdown: ConnectionBreakdown;
    topEndpoints: NetworkEndpointSummary[];
    sampledFlows: ConnectionParseResult["sampledFlows"];
  }): UniversalTelemetryEvent[] {
    const events: UniversalTelemetryEvent[] = [];

    if (params.selectedInterface) {
      events.push({
        id: crypto.randomUUID(),
        capturedAt: params.generatedAt,
        eventType: "INTERFACE",
        severity: "INFO",
        source: "interface-observer",
        title: "Interface capture context updated",
        summary: `Observing ${params.selectedInterface}${params.gateway ? ` via ${params.gateway}` : ""}.`,
        detail: `Active collection targets interface ${params.selectedInterface}.`,
        interfaceName: params.selectedInterface,
        data: {
          selectedInterface: params.selectedInterface,
          gateway: params.gateway,
        },
      });
    }

    if (params.dnsServers.length > 0) {
      events.push({
        id: crypto.randomUUID(),
        capturedAt: params.generatedAt,
        eventType: "DNS",
        severity: "INFO",
        source: "resolver-observer",
        title: "Resolver set observed",
        summary: `${params.dnsServers.length} DNS resolver(s) active.`,
        detail: `Current resolver list: ${params.dnsServers.join(", ")}`,
        interfaceName: params.selectedInterface || undefined,
        data: { dnsServers: params.dnsServers },
      });
    }

    if (params.wifi) {
      events.push({
        id: crypto.randomUUID(),
        capturedAt: params.generatedAt,
        eventType: "WIFI",
        severity: "INFO",
        source: "wifi-context",
        title: "Wireless context captured",
        summary: `SSID ${params.wifi.ssid || "unknown"} security ${params.wifi.security || "unknown"}.`,
        detail: `BSSID ${params.wifi.bssid || "unknown"} · Interface type ${params.wifi.interfaceType || "unknown"}.`,
        interfaceName: params.selectedInterface || undefined,
        data: {
          ssid: params.wifi.ssid,
          security: params.wifi.security,
          bssid: params.wifi.bssid,
          interfaceType: params.wifi.interfaceType,
        },
      });
    }

    if (params.throughput) {
      events.push({
        id: crypto.randomUUID(),
        capturedAt: params.generatedAt,
        eventType: "THROUGHPUT",
        severity: params.anomalyScore >= 75 ? "WARNING" : "INFO",
        source: "throughput-sampler",
        title: "Interface throughput sampled",
        summary: `RX ${this.formatBitsPerSecond(params.throughput.rxBps)} / TX ${this.formatBitsPerSecond(params.throughput.txBps)}.`,
        detail:
          `Counters rx=${params.throughput.rxBytes} tx=${params.throughput.txBytes} bytes with anomaly score ${params.anomalyScore}/100.`,
        interfaceName: params.selectedInterface || undefined,
        data: {
          rxBytes: params.throughput.rxBytes,
          txBytes: params.throughput.txBytes,
          rxBps: params.throughput.rxBps,
          txBps: params.throughput.txBps,
          anomalyScore: params.anomalyScore,
        },
      });
    }

    events.push({
      id: crypto.randomUUID(),
      capturedAt: params.generatedAt,
      eventType: "CONNECTION_SNAPSHOT",
      severity: params.connectionBreakdown.remoteEstablished > 120 ? "WARNING" : "INFO",
      source: "socket-census",
      title: "Connection census refreshed",
      summary:
        `${params.connectionBreakdown.tcpEstablished} TCP established, ${params.connectionBreakdown.udpSockets} UDP sockets, ${params.connectionBreakdown.arpPeers} ARP peers.`,
      detail:
        `Listening sockets ${params.connectionBreakdown.tcpListening}, remote established ${params.connectionBreakdown.remoteEstablished}, loopback established ${params.connectionBreakdown.localLoopbackEstablished}.`,
      interfaceName: params.selectedInterface || undefined,
      data: { ...params.connectionBreakdown },
    });

    for (const endpoint of params.topEndpoints.slice(0, 10)) {
      events.push({
        id: crypto.randomUUID(),
        capturedAt: params.generatedAt,
        eventType: "FLOW",
        severity: endpoint.connections >= 10 ? "WARNING" : "INFO",
        source: "endpoint-ranker",
        title: "Remote endpoint observed",
        summary: `${endpoint.endpoint} with ${endpoint.connections} connection(s).`,
        detail: `Endpoint ${endpoint.endpoint} currently appears in the active socket table ${endpoint.connections} time(s).`,
        interfaceName: params.selectedInterface || undefined,
        data: endpoint,
      });
    }

    for (const flow of params.sampledFlows.slice(0, 120)) {
      events.push({
        id: crypto.randomUUID(),
        capturedAt: params.generatedAt,
        eventType: "FLOW",
        severity: flow.state === "ESTABLISHED" ? "INFO" : "WARNING",
        source: "flow-sampler",
        title: `${flow.protocol.toUpperCase()} ${flow.state}`,
        summary: `${flow.local} -> ${flow.remote}`,
        detail: `Flow sample protocol=${flow.protocol} state=${flow.state} local=${flow.local} remote=${flow.remote}`,
        interfaceName: params.selectedInterface || undefined,
        data: flow,
      });
    }

    if (params.anomalyScore >= 55) {
      events.push({
        id: crypto.randomUUID(),
        capturedAt: params.generatedAt,
        eventType: "ANOMALY",
        severity: params.anomalyScore >= 75 ? "WARNING" : "INFO",
        source: "anomaly-detector",
        title: "Traffic anomaly signal",
        summary: `Anomaly score ${params.anomalyScore}/100.`,
        detail: `Traffic profile deviates from recent baseline with anomaly score ${params.anomalyScore}/100.`,
        interfaceName: params.selectedInterface || undefined,
        data: {
          anomalyScore: params.anomalyScore,
          baselineWindow: this.trafficHistory.length,
        },
      });
    }

    for (const alert of params.alerts) {
      events.push({
        id: crypto.randomUUID(),
        capturedAt: params.generatedAt,
        eventType: "ALERT",
        severity: alert.severity,
        source: "alert-engine",
        title: alert.title,
        summary: alert.detail,
        detail: `${alert.detail} Recommendation: ${alert.recommendation}`,
        interfaceName: params.selectedInterface || undefined,
        data: {
          code: alert.code,
          recommendation: alert.recommendation,
        },
      });
    }

    return events;
  }

  private formatBitsPerSecond(bytesPerSecond: number): string {
    const bitsPerSecond = Math.max(0, bytesPerSecond * 8);
    if (bitsPerSecond >= 1_000_000_000) {
      return `${(bitsPerSecond / 1_000_000_000).toFixed(2)} Gbps`;
    }
    if (bitsPerSecond >= 1_000_000) {
      return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`;
    }
    if (bitsPerSecond >= 1_000) {
      return `${(bitsPerSecond / 1_000).toFixed(1)} Kbps`;
    }
    return `${bitsPerSecond.toFixed(0)} bps`;
  }

  private calculateAnomalyScore(throughput: ThroughputSnapshot | null): number {
    if (!throughput) {
      return 0;
    }
    const current = throughput.rxBps + throughput.txBps;
    if (!Number.isFinite(current) || current <= 0) {
      return 0;
    }

    this.trafficHistory.push(current);
    if (this.trafficHistory.length > 60) {
      this.trafficHistory.shift();
    }
    if (this.trafficHistory.length < 8) {
      return 5;
    }

    const values = this.trafficHistory;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const stdev = Math.sqrt(Math.max(variance, 1));
    const z = (current - mean) / stdev;

    if (z <= 0.5) {
      return 5;
    }
    if (z <= 1.5) {
      return 25;
    }
    if (z <= 2.5) {
      return 55;
    }
    if (z <= 3.5) {
      return 75;
    }
    return 92;
  }

  private generateAlerts(params: {
    selectedInterface: string | null;
    gateway: string | null;
    wifi: WifiContext | null;
    throughput: ThroughputSnapshot | null;
    dnsServers: string[];
    anomalyScore: number;
    connectionBreakdown: ConnectionBreakdown;
    topEndpoints: NetworkEndpointSummary[];
  }): NetworkAlert[] {
    const alerts: NetworkAlert[] = [];

    if (!params.selectedInterface) {
      alerts.push({
        severity: "CRITICAL",
        code: "NO_ACTIVE_INTERFACE",
        title: "No active network interface selected",
        detail: "Universal network intelligence cannot observe live traffic without an active interface.",
        recommendation: "Select an interface in Settings > Mission & Universal Mode.",
      });
      return alerts;
    }

    if (!params.gateway) {
      alerts.push({
        severity: "CRITICAL",
        code: "NO_DEFAULT_GATEWAY",
        title: "No default gateway detected",
        detail: "System route table does not expose a default path.",
        recommendation: "Verify interface connectivity and mission routing policy.",
      });
    }

    if (params.wifi?.security) {
      const security = params.wifi.security.toUpperCase();
      if (security.includes("NONE") || security.includes("OPEN") || security.includes("WEP")) {
        alerts.push({
          severity: "CRITICAL",
          code: "WEAK_WIFI_SECURITY",
          title: "Weak wireless security detected",
          detail: `Connected Wi-Fi security mode reported as ${params.wifi.security}.`,
          recommendation: "Use WPA2/WPA3 authenticated links for operational traffic.",
        });
      }
    }

    if (params.connectionBreakdown.tcpListening > 24) {
      alerts.push({
        severity: "WARNING",
        code: "HIGH_LISTEN_PORTS",
        title: "Large listening socket surface",
        detail: `${params.connectionBreakdown.tcpListening} TCP listening sockets detected locally.`,
        recommendation: "Review exposed local services and close unnecessary listeners.",
      });
    }

    if (params.connectionBreakdown.remoteEstablished > 120) {
      alerts.push({
        severity: "WARNING",
        code: "HIGH_REMOTE_FLOWS",
        title: "High remote connection volume",
        detail: `${params.connectionBreakdown.remoteEstablished} established remote TCP sessions detected.`,
        recommendation: "Inspect top endpoints and validate expected traffic profile.",
      });
    }

    if (params.anomalyScore >= 75 && params.throughput) {
      const totalMbps = ((params.throughput.rxBps + params.throughput.txBps) * 8) / 1_000_000;
      alerts.push({
        severity: "WARNING",
        code: "TRAFFIC_ANOMALY",
        title: "Traffic anomaly detected",
        detail: `Live throughput anomaly score ${params.anomalyScore}/100 at ${totalMbps.toFixed(2)} Mbps aggregate.`,
        recommendation: "Correlate with mission tasks and inspect top remote endpoints for unexpected spikes.",
      });
    }

    const hasPublicDns = params.dnsServers.some((server) =>
      ["8.8.8.8", "1.1.1.1", "9.9.9.9", "8.8.4.4"].includes(server),
    );
    if (hasPublicDns) {
      alerts.push({
        severity: "INFO",
        code: "PUBLIC_DNS_IN_USE",
        title: "Public DNS resolver detected",
        detail: `DNS list includes public resolver(s): ${params.dnsServers.join(", ")}`,
        recommendation: "For mission or restricted enclaves, route DNS through approved internal resolvers.",
      });
    }

    if (params.topEndpoints.length === 0) {
      alerts.push({
        severity: "INFO",
        code: "NO_REMOTE_ENDPOINTS",
        title: "No active remote endpoint flows",
        detail: "Socket table currently shows no remote established TCP endpoints.",
        recommendation: "This is expected for isolated/air-gapped posture.",
      });
    }

    return alerts;
  }

  private async runCommand(args: string[], timeoutMs: number): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const process = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        process.kill();
      } catch {
        // No-op
      }
    }, timeoutMs);

    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ]);

    clearTimeout(timeout);

    if (timedOut) {
      return { exitCode: 124, stdout, stderr: `${stderr}\nCommand timed out after ${timeoutMs}ms`.trim() };
    }
    return { exitCode, stdout, stderr };
  }
}
