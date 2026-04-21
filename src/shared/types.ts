// Mission Data Grid - Shared Types
// Aligns with AutoNet addressing and NetClaw monitoring patterns

export type MeshState = 'FULL' | 'PARTIAL_WAN' | 'HQ_CONTROLLER_LOSS' | 'KIT_TO_KIT_LOSS' | 'FULL_ISOLATION';

export type MissionPriority = 'FLASH' | 'IMMEDIATE' | 'PRIORITY' | 'ROUTINE';

export interface MissionKit {
  id: string;
  name: string;
  missionId: number;
  kitId: number;
  lanSubnet: string;
  wireguardIP: string;
  bgpAS: number;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  lastSeen: Date;
}

export interface MDGDataRecord {
  id: string;
  timestamp: Date;
  kitId: string;
  priority: MissionPriority;
  classification: 'UNCLASSIFIED' | 'FOUO' | 'CONFIDENTIAL' | 'SECRET';
  dataType: 'TELEMETRY' | 'INTEL' | 'LOGISTICS' | 'PERSONNEL' | 'C2';
  payload: Record<string, unknown>;
  synced: boolean;
  syncError?: string;
}

export interface NetworkDevice {
  id: string;
  hostname: string;
  ip: string;
  platform: 'IOS-XE' | 'NX-OS' | 'IOS-XR' | 'ASA' | 'F5' | 'JUNOS' | 'ARISTA' | 'MERAKI' | 'OPENWRT' | 'ALMALINUX' | 'PROXMOX';
  role: 'CORE' | 'DISTRIBUTION' | 'ACCESS' | 'EDGE' | 'FIREWALL' | 'LOAD_BALANCER';
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNREACHABLE';
  metrics: DeviceMetrics;
  lastChecked: Date;
}

export interface DeviceMetrics {
  cpu: number;
  memory: number;
  uptime: number;
  interfacesUp: number;
  interfacesDown: number;
  bgpPeers: number;
  ospfNeighbors: number;
}

export interface TopologyLink {
  source: string;
  target: string;
  type: 'ETHERNET' | 'FIBER' | 'WIRELESS' | 'VPN' | 'TUNNEL';
  status: 'UP' | 'DOWN' | 'DEGRADED';
  bandwidth: number;
  latency: number;
}

export interface CodiceCredentials {
  apiKey: string;
  jwtToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface SyncStatus {
  lastSync: Date | null;
  pendingRecords: number;
  syncedRecords: number;
  failedRecords: number;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'SYNCING';
}

export interface ConnectorStatus {
  name: string;
  status: 'running' | 'stopped' | 'error';
  detail: string;
}

export interface SettingsData {
  credentials: {
    apiKeySet: boolean;
    jwtTokenSet: boolean;
    codiceBaseUrl: string;
    autonetRoot: string;
  };
  runtime: {
    syncIntervalSeconds: number;
    autoSync: boolean;
    networkMode: NetworkMode;
    selectedNetworkInterface: string;
  };
  storage: {
    dbPath: string;
    dbSizeBytes: number;
    records: number;
  };
  connectorStatus: ConnectorStatus[];
}

export type NetworkMode = 'AUTONET_ASSIST' | 'UNIVERSAL_INTEL';

export interface AutoNetDiagnostics {
  projectPath: string;
  loadedHosts: number;
  hasStagedPeers: boolean;
  generatedAt: Date | null;
  lastError?: string;
  totalDevices: number;
  reachableDevices: number;
  totalKits: number;
}

export interface CapabilityEntry {
  id: string;
  label: string;
  available: boolean;
  detail: string;
}

export interface AutoNetCapabilitySnapshot {
  generatedAt: Date;
  projectPath: string;
  lifecycle: CapabilityEntry[];
  validation: CapabilityEntry[];
  controlSurfaces: CapabilityEntry[];
  docs: CapabilityEntry[];
  gaps: string[];
}

export type ValidationStatus = 'PASS' | 'WARN' | 'FAIL' | 'UNKNOWN';

export interface AutoNetValidationSummary {
  generatedAt: Date;
  projectPath: string;
  status: ValidationStatus;
  kitName: string | null;
  exitCode: number | null;
  okCount: number;
  warnCount: number;
  failCount: number;
  summary: string;
  excerpts: string[];
  error?: string;
}

export interface NetworkInterfaceSummary {
  name: string;
  type: 'wifi' | 'ethernet' | 'loopback' | 'tunnel' | 'other';
  status: 'UP' | 'DOWN';
  ipv4?: string;
  ipv6?: string;
  mac?: string;
}

export interface NetworkAlert {
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
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

export interface AutoNetDashboardData {
  mode: NetworkMode;
  active: boolean;
  kits: MissionKit[];
  devices: NetworkDevice[];
  meshState: { state: MeshState; kits: MissionKit[] };
  diagnostics: AutoNetDiagnostics | null;
  capabilities: AutoNetCapabilitySnapshot | null;
  validation: AutoNetValidationSummary | null;
}

export interface UniversalDashboardData {
  mode: NetworkMode;
  active: boolean;
  snapshot: NetworkIntelligenceSnapshot | null;
  events: UniversalTelemetryEvent[];
}

// Health Score Types
export interface HealthCategory {
  score: number;
  label: string;
  detail: string;
  trend: 'up' | 'down' | 'stable';
}

export interface HealthBreakdown {
  overall: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  categories: {
    deviceHealth: HealthCategory;
    syncReliability: HealthCategory;
    meshConnectivity: HealthCategory;
    securityPosture: HealthCategory;
    systemResources: HealthCategory;
  };
  lastCalculated: Date;
}

// Activity Log Types
export interface ActivityEvent {
  id: string;
  timestamp: Date;
  type: 'SYNC' | 'DEVICE' | 'SECURITY' | 'SYSTEM' | 'USER' | 'MESH' | 'AI';
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  title: string;
  detail: string;
  source: string;
}

// System Metrics Types
export interface SystemMetrics {
  cpu: { usage: number; cores: number; model: string };
  memory: { totalBytes: number; usedBytes: number; freeBytes: number; percentage: number };
  disk: { totalBytes: number; usedBytes: number; freeBytes: number; percentage: number };
  network: { hostname: string; interfaces: Array<{ name: string; address: string; family: string }> };
  uptime: number;
  platform: string;
  arch: string;
  bunVersion: string;
}

// AI Assistant Types
export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

// Security Scanner Types
export interface SecurityFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: string;
  title: string;
  detail: string;
  device?: string;
  recommendation: string;
}

export interface SecurityScanResult {
  timestamp: Date;
  scanDurationMs: number;
  devicesScanned: number;
  findings: SecurityFinding[];
  riskScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

// Notification Types
export interface AppNotification {
  id: string;
  timestamp: Date;
  type: 'INFO' | 'WARNING' | 'ALERT' | 'CRITICAL';
  title: string;
  body: string;
  read: boolean;
  source: string;
}

export interface NotificationConfig {
  webhookUrl: string;
  webhookEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  emailFrom: string;
  emailTo: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
}

// RPC Schema Types
export interface MDGRPCSchema {
  bun: {
    requests: {
      getMissionKits: { params: {}; response: MissionKit[] };
      getDataRecords: { params: { limit?: number; kitId?: string }; response: MDGDataRecord[] };
      getNetworkDevices: { params: {}; response: NetworkDevice[] };
      getTopology: { params: {}; response: { devices: NetworkDevice[]; links: TopologyLink[] } };
      getMeshState: { params: {}; response: { state: MeshState; kits: MissionKit[] } };
      getSyncStatus: { params: {}; response: SyncStatus };
      createDataRecord: { params: Omit<MDGDataRecord, 'id' | 'timestamp' | 'synced'>; response: MDGDataRecord };
      syncNow: { params: {}; response: { success: boolean; synced: number; failed: number } };
      updateCredentials: {
        params: {
          apiKey: string;
          jwtToken?: string;
          refreshToken?: string;
          codiceBaseUrl?: string;
          autonetRoot?: string;
        };
        response: boolean;
      };
      getSettingsData: { params: {}; response: SettingsData };
      getAutoNetDiagnostics: { params: {}; response: AutoNetDiagnostics };
      getAutoNetCapabilities: { params: {}; response: AutoNetCapabilitySnapshot };
      getAutoNetValidation: { params: {}; response: AutoNetValidationSummary };
      getNetworkInterfaces: { params: {}; response: NetworkInterfaceSummary[] };
      getNetworkIntelligence: { params: { forceRefresh?: boolean }; response: NetworkIntelligenceSnapshot };
      getCurrentNetworkMode: { params: {}; response: NetworkMode };
      getAutonetDashboardData: { params: {}; response: AutoNetDashboardData };
      getUniversalDashboardData: {
        params: { forceRefresh?: boolean; eventLimit?: number };
        response: UniversalDashboardData;
      };
      getUniversalTelemetryEvents: { params: { limit?: number }; response: UniversalTelemetryEvent[] };
      updateRuntimeSettings: {
        params: {
          syncIntervalSeconds?: number;
          autoSync?: boolean;
          autonetRoot?: string;
          codiceBaseUrl?: string;
          networkMode?: NetworkMode;
          selectedNetworkInterface?: string;
        };
        response: boolean;
      };
      clearLocalCache: { params: {}; response: { deleted: number } };
      // New RPC handlers
      getHealthBreakdown: { params: {}; response: HealthBreakdown };
      getActivityLog: { params: { limit?: number; type?: string }; response: ActivityEvent[] };
      getSystemMetrics: { params: {}; response: SystemMetrics };
      sendAIMessage: { params: { message: string }; response: { reply: string } };
      getAIMessages: { params: { limit?: number }; response: AssistantMessage[] };
      clearAIHistory: { params: {}; response: boolean };
      runSecurityScan: { params: {}; response: SecurityScanResult };
      getNotifications: { params: { limit?: number }; response: AppNotification[] };
      getUnreadNotifications: { params: {}; response: AppNotification[] };
      markNotificationRead: { params: { id: string }; response: boolean };
      markAllNotificationsRead: { params: {}; response: boolean };
      getNotificationConfig: { params: {}; response: NotificationConfig };
      updateNotificationConfig: { params: Partial<NotificationConfig>; response: boolean };
      testWebhook: { params: {}; response: boolean };
    };
    messages: {
      meshStateChanged: { state: MeshState; kitId: string };
      deviceStatusChanged: { deviceId: string; status: NetworkDevice['status'] };
      syncProgress: { pending: number; synced: number; failed: number };
    };
  };
  webview: {
    requests: {
      navigateTo: { params: { view: string }; response: void };
      refreshData: { params: {}; response: void };
    };
    messages: {
      log: { level: 'info' | 'warn' | 'error'; message: string };
    };
  };
}

// Phase 2: Packet Capture Types

export interface PacketCaptureStatus {
  available: boolean;
  active: boolean;
  sessionId?: string;
  interfaceName?: string;
  durationMs?: number;
  packetsCaptured: number;
  bytesCaptured: number;
  flowsTracked: number;
}

export interface PacketFlowView {
  id: string;
  protocol: string;
  sourceIP: string;
  sourcePort: number;
  destinationIP: string;
  destinationPort: number;
  l7Protocol?: string;
  packetCount: number;
  byteCount: number;
  startTime: Date;
  lastActivity: Date;
  state: string;
}

export interface DNSQueryView {
  id: string;
  timestamp: Date;
  queryName: string;
  queryType: string;
  sourceIP: string;
  destinationIP: string;
  latencyMs?: number;
  responseCode?: string;
}

export interface HTTPTransactionView {
  id: string;
  timestamp: Date;
  method: string;
  url: string;
  host?: string;
  statusCode?: number;
  latencyMs?: number;
  sourceIP: string;
  destinationIP: string;
}

export interface TLSHandshakeView {
  id: string;
  timestamp: Date;
  handshakeType: string;
  tlsVersion: string;
  sni?: string;
  sourceIP: string;
  destinationIP: string;
  ja3Fingerprint?: string;
}

export interface CaptureInterface {
  name: string;
  description: string;
  type: 'wifi' | 'ethernet' | 'loopback' | 'tunnel' | 'other';
  status: 'UP' | 'DOWN';
  captureSupported: boolean;
}

export interface RealtimeCaptureMetrics {
  timestamp: Date;
  packetsPerSecond: number;
  bytesPerSecond: number;
  flowCount: number;
  topProtocol: string;
  anomalyCount: number;
}

export interface PacketCaptureEvent {
  type: 'packet' | 'flow_start' | 'flow_end' | 'dns_query' | 'http_request' | 'tls_handshake' | 'anomaly' | 'stats';
  timestamp: Date;
  sessionId: string;
  data: unknown;
}

// Phase 2 RPC Schema Additions
export interface PacketCaptureRPC {
  getPacketCaptureStatus: {
    params: {};
    response: {
      available: boolean;
      active: boolean;
      sessionId?: string;
      interfaceName?: string;
      durationMs?: number;
      packetsCaptured: number;
      bytesCaptured: number;
      flowsTracked: number;
    };
  };
  startPacketCapture: {
    params: { interfaceName?: string; bpfFilter?: string };
    response: { success: boolean; sessionId?: string; error?: string };
  };
  stopPacketCapture: {
    params: {};
    response: { success: boolean; stats?: unknown };
  };
  getPacketFlows: {
    params: { limit?: number };
    response: PacketFlowView[];
  };
  getPacketDNSQueries: {
    params: { limit?: number };
    response: DNSQueryView[];
  };
  getPacketHTTPTransactions: {
    params: { limit?: number };
    response: HTTPTransactionView[];
  };
  getPacketTLSHandshakes: {
    params: { limit?: number };
    response: TLSHandshakeView[];
  };
  getCaptureInterfaces: {
    params: {};
    response: CaptureInterface[];
  };
  subscribeToCaptureEvents: {
    params: {};
    response: { success: boolean; message: string };
  };
}
