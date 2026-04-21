import { ApplicationMenu, BrowserView, BrowserWindow, Tray } from "electrobun/bun";
import { existsSync } from "fs";
import { Database } from "./database";
import { MCPServerManager } from "./mcp-server-manager";
import { HealthEngine } from "./health-engine";
import { ActivityLogger } from "./activity-logger";
import { SystemMonitor } from "./system-monitor";
import { AIAssistant } from "./ai-assistant";
import { SecurityScanner } from "./security-scanner";
import { NotificationEngine } from "./notification-engine";
import { NetworkIntelligenceEngine } from "./network-intelligence";
import { PacketCaptureService, createPacketCaptureService } from "./packet-capture-service";
import { AutonetConfigValidator } from "./autonet-config-validator";
import { AutonetPlaybookHelper } from "./autonet-playbook-helper";
import { AutonetKitBuilder } from "./autonet-kit-builder";
import { AutonetFileWatcher } from "./file-watcher";
import { LogAggregator } from "./log-aggregator";

// === 10 New Feature Modules ===
import { MeshTopologyEngine } from "./mesh-topology-engine";
import { KitApiAggregator } from "./kit-api-aggregator";
import { DegradationClassifier } from "./degradation-classifier";
import { PkiMonitor } from "./pki-monitor";
import { ConfigDriftDetector } from "./config-drift-detector";
import { TransportMonitor } from "./transport-monitor";
import { ZitiIdentityManager } from "./ziti-identity-manager";
import { CotEventGenerator } from "./cot-event-generator";
import { EmergencyProceduresEngine } from "./emergency-procedures";
import { KnowledgeBaseEngine } from "./knowledge-base";

// === 10 Phase 10 AutoNet Intelligence Modules ===
import { WireGuardMeshMonitor } from "./wireguard-mesh-monitor";
import { BGPRouteIntelligence } from "./bgp-route-intelligence";
import { ZitiFabricAnalyzer } from "./ziti-fabric-analyzer";
import { KitReadinessValidator } from "./kit-readiness-validator";
import { ThreatIntelCorrelator } from "./threat-intel-correlator";
import { TransportFailoverPredictor } from "./transport-failover-predictor";
import { OperationalStateClassifier } from "./operational-state-classifier";
import { MissionPriorityQueue } from "./mission-priority-queue";
import { PKIChainValidator } from "./pki-chain-validator";
import { AnsibleRunbookIntelligence } from "./ansible-runbook-intelligence";

console.log("[MDG] Mission Data Grid starting...");

const db = new Database();
const storedConfig = db.getCredentials();
const mcpManager = new MCPServerManager(storedConfig.autonetRoot);
const healthEngine = new HealthEngine();
const activityLogger = new ActivityLogger(db);
const systemMonitor = new SystemMonitor();
const aiAssistant = new AIAssistant(db);
const securityScanner = new SecurityScanner();
const notificationEngine = new NotificationEngine(db);
const networkIntelligence = new NetworkIntelligenceEngine();
const packetCaptureService = createPacketCaptureService(db);

// New assistant modules (lazy-initialized with root path)
let configValidator: AutonetConfigValidator | null = null;
let playbookHelper: AutonetPlaybookHelper | null = null;
let kitBuilder = new AutonetKitBuilder();
let fileWatcher: AutonetFileWatcher | null = null;
let logAggregator: LogAggregator | null = null;

// === 10 New Feature Module Instances ===
let topologyEngine: MeshTopologyEngine | null = null;
let kitApiAggregator: KitApiAggregator | null = null;
let degradationClassifier: DegradationClassifier | null = null;
let pkiMonitor: PkiMonitor | null = null;
let driftDetector: ConfigDriftDetector | null = null;
let transportMonitor: TransportMonitor | null = null;
let zitiIdentityManager: ZitiIdentityManager | null = null;
let cotGenerator = new CotEventGenerator();
let emergencyEngine: EmergencyProceduresEngine | null = null;
let knowledgeBase: KnowledgeBaseEngine | null = null;

// === 10 Phase 10 AutoNet Intelligence Module Instances ===
let wireguardMonitor: WireGuardMeshMonitor | null = null;
let bgpIntelligence: BGPRouteIntelligence | null = null;
let zitiFabricAnalyzer: ZitiFabricAnalyzer | null = null;
let kitReadinessValidator: KitReadinessValidator | null = null;
let threatCorrelator: ThreatIntelCorrelator | null = null;
let failoverPredictor: TransportFailoverPredictor | null = null;
let stateClassifier: OperationalStateClassifier | null = null;
let priorityQueue: MissionPriorityQueue | null = null;
let pkiChainValidator: PKIChainValidator | null = null;
let runbookIntelligence: AnsibleRunbookIntelligence | null = null;

let monitoringEnabled = db.getRuntimeSettings().autonetMonitoringEnabled;

function refreshAutonetModules() {
  const root = mcpManager.getAutoNetRoot();
  if (root && root !== "/dev/null" && existsSync(root)) {
    configValidator = new AutonetConfigValidator(root);
    playbookHelper = new AutonetPlaybookHelper(root);
    logAggregator = new LogAggregator(root);
    topologyEngine = new MeshTopologyEngine(root);
    kitApiAggregator = new KitApiAggregator(root);
    degradationClassifier = new DegradationClassifier(root);
    pkiMonitor = new PkiMonitor(root);
    driftDetector = new ConfigDriftDetector(root);
    transportMonitor = new TransportMonitor(root);
    zitiIdentityManager = new ZitiIdentityManager(root);
    emergencyEngine = new EmergencyProceduresEngine(root);
    knowledgeBase = new KnowledgeBaseEngine(root);

    // Phase 10 modules
    wireguardMonitor = new WireGuardMeshMonitor(root);
    bgpIntelligence = new BGPRouteIntelligence(root);
    zitiFabricAnalyzer = new ZitiFabricAnalyzer(root);
    kitReadinessValidator = new KitReadinessValidator(root);
    threatCorrelator = new ThreatIntelCorrelator(root);
    failoverPredictor = new TransportFailoverPredictor(root);
    stateClassifier = new OperationalStateClassifier(root);
    priorityQueue = new MissionPriorityQueue(root);
    pkiChainValidator = new PKIChainValidator(root);
    runbookIntelligence = new AnsibleRunbookIntelligence(root);

    if (fileWatcher) fileWatcher.stopWatching();
    fileWatcher = new AutonetFileWatcher(root);
    fileWatcher.onChange((changes) => {
      for (const change of changes) {
        activityLogger.info("File changed", `${change.relativePath} ${change.type}`, "file-watcher", "SYSTEM");
      }
    });
    if (monitoringEnabled) {
      fileWatcher.startWatching();
    }
  }
}

// Initial module setup (without starting probes)
refreshAutonetModules();

// Auto-enable monitoring if autonet root is valid
if (!monitoringEnabled) {
  const autonetRoot = mcpManager.getAutoNetRoot();
  if (autonetRoot && existsSync(autonetRoot)) {
    monitoringEnabled = true;
    db.saveRuntimeSettings({ autonetMonitoringEnabled: true });
  }
}

let cachedSystemMetrics: { cpuUsage: number; memoryPercent: number; diskPercent: number } | null = null;

const mainWindowRPC = BrowserView.defineRPC({
  maxRequestTime: 120_000,
  handlers: {
    requests: {
      // === Monitoring Control ===
      getMonitoringStatus: async () => {
        return {
          enabled: monitoringEnabled,
          rootPath: mcpManager.getAutoNetRoot(),
          rootValid: existsSync(mcpManager.getAutoNetRoot()),
        };
      },

      enableMonitoring: async () => {
        monitoringEnabled = true;
        db.saveRuntimeSettings({ autonetMonitoringEnabled: true });
        await mcpManager.startAll().catch(() => {});
        fileWatcher?.startWatching();
        activityLogger.info("Monitoring enabled", "AutoNet monitoring activated by user", "system", "USER");
        return { success: true };
      },

      disableMonitoring: async () => {
        monitoringEnabled = false;
        db.saveRuntimeSettings({ autonetMonitoringEnabled: false });
        fileWatcher?.stopWatching();
        activityLogger.info("Monitoring disabled", "AutoNet monitoring deactivated by user", "system", "USER");
        return { success: true };
      },

      // === Core AutoNet Overview ===
      getAutonetOverview: async () => {
        // Always attempt YAML read regardless of monitoring flag.
        // monitoringEnabled only gates live network probing, not inventory reads.
        const root = mcpManager.getAutoNetRoot();
        const rootValid = root && existsSync(root);
        if (!rootValid) {
          return { active: false, mode: "AUTONET_ASSIST", data: null, monitoring: false };
        }
        const [kits, devices, meshStatus, diagnostics, capabilities, validation] = await Promise.all([
          mcpManager.queryMissionKits().catch((e) => { console.warn("[MDG] queryMissionKits failed:", e?.message); return []; }),
          mcpManager.queryDevices().catch(() => []),
          mcpManager.queryMeshStatus().catch(() => ({ state: "FULL_ISOLATION", peers: 0 })),
          mcpManager.getAutoNetDiagnostics().catch(() => null),
          mcpManager.getAutoNetCapabilities().catch(() => null),
          mcpManager.getAutoNetValidation().catch(() => null),
        ]);
        console.log(`[MDG] getAutonetOverview: ${kits.length} kits, ${devices.length} devices`);
        if (kits.length > 0) db.saveMissionKits(kits);
        // Normalize Date fields to strings so Electrobun IPC serializes correctly
        // Also normalize field name case differences between backend types and frontend expectations
        const normalizeKit = (k: any) => ({
          ...k,
          lastSeen: k.lastSeen instanceof Date ? k.lastSeen.toISOString() : (k.lastSeen ?? null),
          proxmoxIp: k.proxmoxIp ?? k.proxmoxIP ?? k.host ?? null,
          wireguardIp: k.wireguardIp ?? k.wireguardIP ?? k.wgIp ?? null,
          bgpAs: k.bgpAs ?? k.bgpAS ?? k.as ?? null,
        });
        return {
          active: true,
          mode: "AUTONET_ASSIST",
          monitoring: monitoringEnabled,
          data: { kits: kits.map(normalizeKit), devices, meshStatus, diagnostics, capabilities, validation },
        };
      },

      // === Network Intelligence ===
      getNetworkStatus: async () => {
        const snapshot = await networkIntelligence.getSnapshot({
          mode: "UNIVERSAL_INTEL",
          selectedInterface: db.getRuntimeSettings().selectedNetworkInterface || null,
          forceRefresh: true,
        });
        db.saveUniversalTelemetryEvents(snapshot.telemetryEvents || []);
        return snapshot;
      },

      // === System Metrics ===
      getSystemStatus: async () => {
        const metrics = await systemMonitor.getMetrics();
        cachedSystemMetrics = { cpuUsage: metrics.cpu.usage, memoryPercent: metrics.memory.percentage, diskPercent: metrics.disk.percentage };
        return metrics;
      },

      // === Security ===
      getSecurityStatus: async () => {
        const devices = monitoringEnabled ? await mcpManager.queryDevices().catch(() => []) : [];
        const result = await securityScanner.scanDevices(devices);
        const criticalCount = result.findings.filter((f) => f.severity === "CRITICAL").length;
        if (criticalCount > 0) {
          notificationEngine.sendCritical("Security Alert", `${criticalCount} critical finding(s) detected`, "security-scanner");
        }
        return result;
      },

      // === Health Score ===
      getHealthScore: async () => {
        if (!monitoringEnabled) {
          return healthEngine.calculate([], db.getSyncStats(), "FULL_ISOLATION", cachedSystemMetrics ?? undefined);
        }
        const [devices, meshStatus] = await Promise.all([
          mcpManager.queryDevices().catch(() => []),
          mcpManager.queryMeshStatus().catch(() => ({ state: "FULL_ISOLATION" as const })),
        ]);
        return healthEngine.calculate(devices, db.getSyncStats(), meshStatus.state, cachedSystemMetrics ?? undefined);
      },

      // === Activity Stream ===
      getActivityStream: async ({ limit = 100 }: { limit?: number }) => {
        return activityLogger.getRecent(limit);
      },

      // === AI Assistant ===
      sendAIMessage: async ({ message }: { message: string }) => {
        try {
          const [devices, kits, meshStatus] = monitoringEnabled
            ? await Promise.all([
                mcpManager.queryDevices().catch(() => []),
                mcpManager.queryMissionKits().catch(() => []),
                mcpManager.queryMeshStatus().catch(() => ({ state: "FULL_ISOLATION" as const })),
              ])
            : [[] as any, [] as any, { state: "FULL_ISOLATION" as const }];
          const health = await healthEngine.calculate(devices, db.getSyncStats(), meshStatus.state, cachedSystemMetrics ?? undefined);
          aiAssistant.updateContext({ devices, kits, meshState: meshStatus.state, health, syncStats: db.getSyncStats(), systemMetrics: cachedSystemMetrics });
        } catch { /* use stale context */ }
        const reply = await aiAssistant.processMessage(message);
        return { reply };
      },

      getAIMessages: async ({ limit = 50 }: { limit?: number }) => aiAssistant.getMessages(limit),
      clearAIHistory: async () => { aiAssistant.clearHistory(); return true; },

      // === Notifications ===
      getNotifications: async ({ limit = 100 }: { limit?: number }) => notificationEngine.getAll(limit),
      markNotificationRead: async ({ id }: { id: string }) => { notificationEngine.markRead(id); return true; },
      markAllNotificationsRead: async () => { notificationEngine.markAllRead(); return true; },

      // === Config Validator ===
      validateAutonetConfig: async () => {
        if (!configValidator) return { valid: false, issues: [{ severity: "ERROR", file: "", message: "AutoNet path not configured", recommendation: "Set AutoNet root in Settings" }], summary: { kitsFound: 0, hostsFound: 0, playbooksFound: 0, variablesDefined: 0, stagedPeers: 0 }, checkedAt: new Date() };
        return configValidator.validate();
      },

      // === Playbook Helper ===
      listPlaybooks: async () => {
        if (!playbookHelper) return [];
        return playbookHelper.listPlaybooks();
      },

      runPlaybookCheck: async ({ playbook, limit, tags }: { playbook: string; limit?: string; tags?: string[] }) => {
        if (!playbookHelper) return { success: false, stderr: "AutoNet path not configured", parsedTasks: { ok: 0, changed: 0, unreachable: 0, failed: 0, skipped: 0, rescued: 0, ignored: 0 } };
        activityLogger.info("Playbook check", `Dry-run ${playbook}`, "playbook-helper", "USER");
        return playbookHelper.runPlaybook(playbook, { dryRun: true, limit, tags });
      },

      checkAnsibleVersion: async () => {
        if (!playbookHelper) return { installed: false };
        return playbookHelper.checkAnsibleVersion();
      },

      // === Kit Builder ===
      getKitAddressPlan: async (params: { kitName: string; missionId: number; kitId: number; proxmoxIp: string; vmidBase: number; lanBase: string; wgBase: string }) => {
        const errors = kitBuilder.validateKitParams(params);
        if (errors.length > 0) return { valid: false, errors, plan: null };
        const plan = kitBuilder.buildAddressPlan(params);
        const template = kitBuilder.generateHostVarsTemplate(plan, params);
        const yaml = kitBuilder.renderHostVarsYAML(template);
        const inventory = kitBuilder.renderInventoryEntry(params, plan);
        return { valid: true, errors: [], plan, yaml, inventory };
      },

      // === File Watcher ===
      getFileChanges: async () => {
        if (!fileWatcher) return [];
        return fileWatcher.scan();
      },

      // === Log Aggregator ===
      getRecentLogs: async ({ limit = 100 }: { limit?: number }) => {
        if (!logAggregator) return [];
        return logAggregator.getRecentLogs(limit);
      },

      // === FEATURE 1: Mesh Topology ===
      getMeshTopology: async () => {
        if (!topologyEngine) return { generatedAt: new Date(), nodes: [], links: [], degradationStates: {} };
        return topologyEngine.generateTopology();
      },

      // === FEATURE 2: Kit API Health ===
      getKitApiHealth: async () => {
        if (!kitApiAggregator) return [];
        return kitApiAggregator.pollAllKits();
      },

      // === FEATURE 3: Degradation States ===
      getDegradationStates: async () => {
        if (!degradationClassifier) return [];
        return degradationClassifier.classifyAllKits();
      },

      // === FEATURE 4: PKI Monitor ===
      getPkiStatus: async () => {
        if (!pkiMonitor) return [];
        return pkiMonitor.scanCertificates();
      },

      // === FEATURE 5: Config Drift ===
      getConfigDrift: async () => {
        if (!driftDetector) return [];
        return driftDetector.checkAllKits();
      },

      // === FEATURE 6: Transport Monitor ===
      getTransportLinks: async () => {
        if (!transportMonitor) return [];
        return transportMonitor.monitorAllLinks();
      },

      // === FEATURE 7: Ziti Identity Manager ===
      getZitiIdentities: async () => {
        if (!zitiIdentityManager) return [];
        return zitiIdentityManager.scanAllKits();
      },

      // === FEATURE 8: CoT Events ===
      generateCoTEvent: async ({ kitId, kitName, state, lat, lon }: { kitId: string; kitName: string; state: string; lat: number; lon: number }) => {
        const event = cotGenerator.generateMeshStateEvent(kitId, kitName, state, lat, lon);
        return { xml: cotGenerator.toXml(event), event };
      },

      // === FEATURE 9: Emergency Procedures ===
      getEmergencyProcedures: async () => {
        if (!emergencyEngine) return [];
        return emergencyEngine.getAvailableProcedures();
      },

      runEmergencyProcedure: async ({ procedureId, targetKit }: { procedureId: string; targetKit?: string }) => {
        if (!emergencyEngine) return { procedureId, success: false, output: "Engine not initialized", durationMs: 0 };
        activityLogger.critical("Emergency procedure initiated", `${procedureId} on ${targetKit || "all kits"}`, "emergency", "USER");
        notificationEngine.sendCritical("Emergency Procedure", `${procedureId} initiated`, "emergency");
        return emergencyEngine.executeProcedure(procedureId, targetKit);
      },

      getEmergencyRunbook: async ({ targetKit }: { targetKit?: string }) => {
        if (!emergencyEngine) return "# Emergency Runbook\n\nEngine not initialized.";
        return emergencyEngine.generateEmergencyRunbook(targetKit);
      },

      // === FEATURE 10: Knowledge Base ===
      searchKnowledgeBase: async ({ query }: { query: string }) => {
        if (!knowledgeBase) return [];
        return knowledgeBase.search(query);
      },

      getKnowledgeCategories: async () => {
        if (!knowledgeBase) return [];
        return knowledgeBase.getCategories();
      },

      getKnowledgeArticle: async ({ id }: { id: string }) => {
        if (!knowledgeBase) return null;
        return knowledgeBase.getArticle(id);
      },

      getTroubleshootingTrees: async () => {
        if (!knowledgeBase) return [];
        return knowledgeBase.getTroubleshootingTrees();
      },

      // === Packet Capture ===
      getPacketCaptureStatus: async () => {
        return packetCaptureService.getSessionInfo() || { available: false, active: false, packetsCaptured: 0, bytesCaptured: 0, flowsTracked: 0 };
      },

      startPacketCapture: async ({ interfaceName, bpfFilter }: { interfaceName?: string; bpfFilter?: string }) => {
        activityLogger.info("Packet capture starting", `Interface: ${interfaceName || "default"}`, "packet-capture", "USER");
        return packetCaptureService.startCapture({ targetInterface: interfaceName, bpfFilter: bpfFilter || "", enableDeepInspection: true, trackDNSQueries: true, trackHTTPTransactions: true });
      },

      stopPacketCapture: async () => packetCaptureService.stopCapture(),

      getCaptureInterfaces: async () => {
        const status = await packetCaptureService.initialize();
        const baseInterfaces = await networkIntelligence.listInterfaces();
        return baseInterfaces.map((iface) => ({
          name: iface.name,
          description: `${iface.type} interface`,
          type: iface.type,
          status: iface.status,
          captureSupported: status.available && status.interfaces.includes(iface.name),
        }));
      },

      // === Settings ===
      getSettings: async () => {
        const credentials = db.getCredentials();
        const runtime = db.getRuntimeSettings();
        const storage = db.getStorageStats();
        const connectorStatus = mcpManager.getStatus();
        return { credentials, runtime, storage, connectorStatus };
      },

      updateSettings: async (settings: {
        autonetRoot?: string;
        networkMode?: "AUTONET_ASSIST" | "UNIVERSAL_INTEL";
        selectedNetworkInterface?: string;
        syncIntervalSeconds?: number;
        autoSync?: boolean;
      }) => {
        db.saveRuntimeSettings({
          networkMode: settings.networkMode,
          selectedNetworkInterface: settings.selectedNetworkInterface,
          syncIntervalSeconds: settings.syncIntervalSeconds,
          autoSync: settings.autoSync,
        });
        if (settings.autonetRoot) {
          db.saveCredentials({ ...db.getCredentials(), autonetRoot: settings.autonetRoot });
          await mcpManager.updateAutoNetRoot(settings.autonetRoot);
          refreshAutonetModules();
        }
        return true;
      },

      clearCache: async () => {
        const deletedRecords = db.clearDataRecords();
        const deletedUniversal = db.clearUniversalTelemetryEvents();
        activityLogger.info("Cache cleared", `Deleted ${deletedRecords} records and ${deletedUniversal} telemetry events`, "settings", "USER");
        return { deleted: deletedRecords + deletedUniversal };
      },

      // === Data Export ===
      exportData: async ({ format, dataType }: { format: "json" | "csv"; dataType: string }) => {
        const kits = db.getMissionKits();
        const records = db.getDataRecords(1000);
        const events = db.getUniversalTelemetryEvents(1000);
        const payload = { exportedAt: new Date().toISOString(), kits, records, events };
        if (format === "json") {
          return { success: true, data: JSON.stringify(payload, null, 2), mimeType: "application/json" };
        }
        const csv = ["id,timestamp,kitId,priority,classification,dataType,synced", ...records.map((r) => `${r.id},${r.timestamp.toISOString()},${r.kitId},${r.priority},${r.classification},${r.dataType},${r.synced}`)].join("\n");
        return { success: true, data: csv, mimeType: "text/csv" };
      },

      // === PHASE 9: Intelligence Tiers - Predictive Failure Analytics ===
      predictNetworkFailures: async ({ kitId, hoursAhead = 24 }: { kitId: string; hoursAhead?: number }) => {
        // Placeholder - full implementation in next step
        return { kitId, predictions: [] };
      },

      forecastCapacity: async ({ kitId, metricName, hoursAhead = 24 }: { kitId: string; metricName: string; hoursAhead?: number }) => {
        return { kitId, metricName, forecast: [] };
      },

      getAnomalyPatterns: async ({ kitId, hoursBack = 24 }: { kitId: string; hoursBack?: number }) => {
        return { kitId, anomalies: [] };
      },

      detectMetricAnomalies: async ({ kitId, metricName, values }: { kitId: string; metricName: string; values: number[] }) => {
        return { kitId, metricName, anomalies: [] };
      },

      // === PHASE 9: Intelligence Tiers - Coalition Health Correlation ===
      getCoalitionDependencies: async ({ kitId }: { kitId: string }) => {
        return { kitId, dependencies: [] };
      },

      registerDependency: async ({
        sourceKitId,
        targetKitId,
        dependencyType,
        criticality,
      }: {
        sourceKitId: string;
        targetKitId: string;
        dependencyType: string;
        criticality: string;
      }) => {
        return { success: true };
      },

      analyzeFailurePropagation: async ({ sourceKitId }: { sourceKitId: string }) => {
        return { sourceKitId, propagation: null };
      },

      getCoalitionScore: async ({ kitIds }: { kitIds: string[] }) => {
        return { score: null };
      },

      detectResourceContention: async ({ kitIds }: { kitIds: string[] }) => {
        return { contention: {} };
      },

      simulateCascadeFailure: async ({
        initialFailedKit,
        allKits,
      }: {
        initialFailedKit: string;
        allKits: string[];
      }) => {
        return { simulation: null };
      },

      // === PHASE 9: Intelligence Tiers - Network Optimization Engine ===
      optimizeBandwidth: async ({ paths }: { paths: Array<any> }) => {
        return { suggestions: [] };
      },

      suggestRoutingChanges: async ({ paths }: { paths: Array<any> }) => {
        return { suggestions: new Map() };
      },

      simulateQueue: async ({
        arrivalRate,
        serviceRate,
        bufferSize,
        durationMs,
      }: {
        arrivalRate: number;
        serviceRate: number;
        bufferSize: number;
        durationMs: number;
      }) => {
        return { simulation: null };
      },

      analyzeTrafficPattern: async ({ pathId, hoursBack = 24 }: { pathId: string; hoursBack?: number }) => {
        return { pathId, pattern: null };
      },

      // === PHASE 9: Intelligence Tiers - Configuration Drift Intelligence ===
      detectConfigDrift: async ({ kitId, currentConfig }: { kitId: string; currentConfig: Record<string, any> }) => {
        return { kitId, drift: null };
      },

      predictChangeImpact: async ({
        kitId,
        proposedConfig,
        currentConfig,
      }: {
        kitId: string;
        proposedConfig: Record<string, any>;
        currentConfig: Record<string, any>;
      }) => {
        return { impact: null };
      },

      suggestConfigOptimizations: async ({ kitId, currentConfig }: { kitId: string; currentConfig: Record<string, any> }) => {
        return { suggestions: [] };
      },

      approveConfigVariation: async ({
        kitId,
        configField,
        approvedValues,
        reason,
        expiresAt,
      }: {
        kitId: string;
        configField: string;
        approvedValues: string[];
        reason: string;
        expiresAt?: Date;
      }) => {
        return { success: true };
      },

      getConfigTimeline: async ({ kitId, hoursBack = 168 }: { kitId: string; hoursBack?: number }) => {
        return { kitId, timeline: [] };
      },

      // === PHASE 9: Intelligence Tiers - Performance Intelligence ===
      trackSLO: async ({
        kitId,
        serviceName,
        metrics,
      }: {
        kitId: string;
        serviceName: string;
        metrics: Array<{
          timestamp: Date;
          metricType: string;
          value: number;
        }>;
      }) => {
        return { slos: [] };
      },

      analyzeLatency: async ({ kitId, applicationName, hoursBack = 24 }: { kitId: string; applicationName: string; hoursBack?: number }) => {
        return { analysis: null };
      },

      assessUXImpact: async ({ kitId, timeWindowHours = 1 }: { kitId: string; timeWindowHours?: number }) => {
        return { assessment: null };
      },

      identifyBottlenecks: async ({ kitId }: { kitId: string }) => {
        return { bottlenecks: [] };
      },

      recordPerformanceMetric: async ({
        kitId,
        applicationName,
        metricType,
        value,
        unit,
      }: {
        kitId: string;
        applicationName: string;
        metricType: string;
        value: number;
        unit: string;
      }) => {
        return { success: true };
      },

      recordErrorEvent: async ({
        kitId,
        serviceName,
        errorType,
        errorRate,
        errorCount,
        affectedRequests,
      }: {
        kitId: string;
        serviceName: string;
        errorType: string;
        errorRate: number;
        errorCount: number;
        affectedRequests: number;
      }) => {
        return { success: true };
      },

      // =====================================================================
      // PHASE 10: WireGuard Mesh Monitor
      // =====================================================================
      getWireGuardStatus: async () => {
        if (!wireguardMonitor) return { tunnels: [], totalPeers: 0, activePeers: 0, overallHealth: 0 };
        return wireguardMonitor.getWireGuardStatus();
      },
      validateMTUCompliance: async () => {
        if (!wireguardMonitor) return { compliant: [], nonCompliant: [], compliancePercent: 0 };
        return wireguardMonitor.validateMTUCompliance();
      },
      getPeerMatrix: async () => {
        if (!wireguardMonitor) return { kits: [], matrix: [] };
        return wireguardMonitor.getPeerMatrix();
      },
      getTunnelHealth: async () => {
        if (!wireguardMonitor) return [];
        return wireguardMonitor.getTunnelHealth();
      },
      getKeyRotationStatus: async () => {
        if (!wireguardMonitor) return [];
        return wireguardMonitor.getKeyRotationStatus();
      },

      // =====================================================================
      // PHASE 10: BGP Route Intelligence
      // =====================================================================
      getBGPOverview: async () => {
        if (!bgpIntelligence) return { asNumbers: [], totalPeers: 0, establishedPeers: 0, convergencePercent: 0 };
        return bgpIntelligence.getBGPOverview();
      },
      getASPathAnalysis: async () => {
        if (!bgpIntelligence) return [];
        return bgpIntelligence.getASPathAnalysis();
      },
      getRouteConvergence: async () => {
        if (!bgpIntelligence) return { convergencePercent: 0, estimatedTimeMs: 0, stableRoutes: 0, flapCount: 0 };
        return bgpIntelligence.getRouteConvergence();
      },
      getTopologyType: async () => {
        if (!bgpIntelligence) return { type: "UNKNOWN", description: "", kitCount: 0, recommended: "" };
        return bgpIntelligence.getTopologyType();
      },
      getPeerRelationships: async () => {
        if (!bgpIntelligence) return [];
        return bgpIntelligence.getPeerRelationships();
      },

      // =====================================================================
      // PHASE 10: Ziti Fabric Analyzer
      // =====================================================================
      getFabricOverview: async () => {
        if (!zitiFabricAnalyzer) return { totalRouters: 0, healthyRouters: 0, fabricLinks: 0, federationStatus: "UNKNOWN" };
        return zitiFabricAnalyzer.getFabricOverview();
      },
      getRouterHealth: async () => {
        if (!zitiFabricAnalyzer) return [];
        return zitiFabricAnalyzer.getRouterHealth();
      },
      getPlaneIsolationStatus: async () => {
        if (!zitiFabricAnalyzer) return { localPlane: { status: "UNKNOWN" }, meshPlane: { status: "UNKNOWN" }, hqPlane: { status: "UNKNOWN" } };
        return zitiFabricAnalyzer.getPlaneIsolationStatus();
      },
      getFabricLinkCosts: async () => {
        if (!zitiFabricAnalyzer) return [];
        return zitiFabricAnalyzer.getFabricLinkCosts();
      },
      analyzeRouterFailureImpact: async ({ routerType }: { routerType: string }) => {
        if (!zitiFabricAnalyzer) return { routerType, impact: "Unknown", affectedServices: [], mitigations: [] };
        return zitiFabricAnalyzer.analyzeRouterFailureImpact(routerType);
      },

      // =====================================================================
      // PHASE 10: Kit Readiness Validator
      // =====================================================================
      validateAllKits: async () => {
        if (!kitReadinessValidator) return [];
        return kitReadinessValidator.validateAllKits();
      },
      validateKit: async ({ name }: { name: string }) => {
        if (!kitReadinessValidator) return { kitName: name, score: 0, checks: [], overall: "FAIL" };
        return kitReadinessValidator.validateKit(name);
      },
      getReadinessScore: async ({ name }: { name: string }) => {
        if (!kitReadinessValidator) return { kitName: name, score: 0 };
        return kitReadinessValidator.getReadinessScore(name);
      },
      generatePreFieldChecklist: async ({ name }: { name: string }) => {
        if (!kitReadinessValidator) return "# Pre-Field Checklist\n\nValidator not initialized.";
        return kitReadinessValidator.generatePreFieldChecklist(name);
      },

      // =====================================================================
      // PHASE 10: Threat Intelligence Correlator
      // =====================================================================
      getThreatOverview: async () => {
        if (!threatCorrelator) return { overallThreatLevel: "UNKNOWN", activeIOCs: 0, correlatedEvents: 0, sshAttackCount: 0, kits: [] };
        return threatCorrelator.getThreatOverview();
      },
      getKitThreatScore: async ({ kitId }: { kitId: string }) => {
        if (!threatCorrelator) return { kitId, score: 0, level: "UNKNOWN", indicators: [] };
        return threatCorrelator.getKitThreatScore(kitId);
      },
      getThreatTimeline: async ({ hours = 24 }: { hours?: number }) => {
        if (!threatCorrelator) return [];
        return threatCorrelator.getThreatTimeline(hours);
      },
      analyzeSSHPatterns: async () => {
        if (!threatCorrelator) return { patterns: [], topSources: [], attackMethods: [] };
        return threatCorrelator.analyzeSSHPatterns();
      },
      getIOCSummary: async () => {
        if (!threatCorrelator) return [];
        return threatCorrelator.getIOCSummary();
      },
      correlateEvents: async () => {
        if (!threatCorrelator) return [];
        return threatCorrelator.correlateEvents();
      },

      // =====================================================================
      // PHASE 10: Transport Failover Predictor
      // =====================================================================
      getTransportPredictions: async () => {
        if (!failoverPredictor) return [];
        return failoverPredictor.getTransportPredictions();
      },
      getFailoverChain: async ({ kitId }: { kitId: string }) => {
        if (!failoverPredictor) return { kitId, chain: [] };
        return failoverPredictor.getFailoverChain(kitId);
      },
      predictTimeToFailover: async ({ kitId }: { kitId: string }) => {
        if (!failoverPredictor) return { kitId, predictions: [] };
        return failoverPredictor.predictTimeToFailover(kitId);
      },
      getTransportDiversityScore: async ({ kitId }: { kitId: string }) => {
        if (!failoverPredictor) return { kitId, score: 0, details: [] };
        return failoverPredictor.getTransportDiversityScore(kitId);
      },
      getSignalTrends: async () => {
        if (!failoverPredictor) return [];
        return failoverPredictor.getSignalTrends();
      },

      // =====================================================================
      // PHASE 10: Operational State Classifier
      // =====================================================================
      getAllKitStates: async () => {
        if (!stateClassifier) return [];
        return stateClassifier.getAllKitStates();
      },
      getStateHistory: async ({ kitId }: { kitId: string }) => {
        if (!stateClassifier) return [];
        return stateClassifier.getStateHistory(kitId);
      },
      getAutonomousCapabilities: async ({ state }: { state: string }) => {
        if (!stateClassifier) return { state, capabilities: [] };
        return stateClassifier.getAutonomousCapabilities(state as any);
      },
      predictStateTransition: async ({ kitId }: { kitId: string }) => {
        if (!stateClassifier) return { kitId, prediction: null };
        return stateClassifier.predictStateTransition(kitId);
      },
      getStateDurations: async () => {
        if (!stateClassifier) return [];
        return stateClassifier.getStateDurations();
      },

      // =====================================================================
      // PHASE 10: Mission Priority Queue
      // =====================================================================
      getQueueStatus: async () => {
        if (!priorityQueue) return { totalItems: 0, byPriority: {}, throughput: 0 };
        return priorityQueue.getQueueStatus();
      },
      getBandwidthAllocation: async () => {
        if (!priorityQueue) return [];
        return priorityQueue.getBandwidthAllocation();
      },
      getPriorityDistribution: async () => {
        if (!priorityQueue) return [];
        return priorityQueue.getPriorityDistribution();
      },
      getLatencyEstimates: async () => {
        if (!priorityQueue) return [];
        return priorityQueue.getLatencyEstimates();
      },
      detectStarvation: async () => {
        if (!priorityQueue) return [];
        return priorityQueue.detectStarvation();
      },
      getQoSRecommendations: async () => {
        if (!priorityQueue) return [];
        return priorityQueue.getQoSRecommendations();
      },
      enqueueTestItem: async () => {
        if (!priorityQueue) return { success: false };
        const priorities: Array<"FLASH" | "IMMEDIATE" | "PRIORITY" | "ROUTINE"> = ["FLASH", "IMMEDIATE", "PRIORITY", "ROUTINE"];
        const priority = priorities[Math.floor(Math.random() * priorities.length)] || "ROUTINE";
        priorityQueue.enqueue({
          priority,
          sourceKitId: "test-kit",
          destinationKitId: "hq",
          dataType: "TELEMETRY",
          sizeBytes: Math.floor(Math.random() * 10000) + 100,
          expiresAt: null,
          description: `Test ${priority} item generated at ${new Date().toISOString()}`,
          maxRetries: 3,
        });
        return { success: true, priority };
      },

      // =====================================================================
      // PHASE 10: PKI Chain Validator
      // =====================================================================
      getCertificateInventory: async () => {
        if (!pkiChainValidator) return [];
        return pkiChainValidator.getCertificateInventory();
      },
      getTrustModelHealth: async () => {
        if (!pkiChainValidator) return { score: 0, status: "UNKNOWN", details: [] };
        return pkiChainValidator.getTrustModelHealth();
      },
      getExpiryAlerts: async () => {
        if (!pkiChainValidator) return [];
        return pkiChainValidator.getExpiryAlerts();
      },
      getRevocationStatus: async () => {
        if (!pkiChainValidator) return [];
        return pkiChainValidator.getRevocationStatus();
      },
      validateCrossKitTrust: async () => {
        if (!pkiChainValidator) return { pairs: [], overallTrust: "UNKNOWN" };
        return pkiChainValidator.validateCrossKitTrust();
      },
      validateChain: async ({ kitName }: { kitName: string }) => {
        if (!pkiChainValidator) return { kitName, valid: false, chain: [], issues: ["Validator not initialized"] };
        return pkiChainValidator.validateChain(kitName);
      },

      // =====================================================================
      // PHASE 10: Ansible Runbook Intelligence
      // =====================================================================
      getPlaybookAnalysis: async () => {
        if (!runbookIntelligence) return [];
        return runbookIntelligence.getPlaybookAnalysis();
      },
      getTagDependencyMap: async () => {
        if (!runbookIntelligence) return [];
        return runbookIntelligence.getTagDependencyMap();
      },
      getImpactAnalysis: async ({ playbook }: { playbook: string }) => {
        if (!runbookIntelligence) return { playbook, impact: null };
        return runbookIntelligence.getImpactAnalysis(playbook);
      },
      getRoleDependencyGraph: async () => {
        if (!runbookIntelligence) return [];
        return runbookIntelligence.getRoleDependencyGraph();
      },
      suggestExecutionPlan: async ({ description }: { description: string }) => {
        if (!runbookIntelligence) return { plan: null };
        return runbookIntelligence.suggestExecutionPlan(description);
      },
      getRiskScore: async ({ playbook }: { playbook: string }) => {
        if (!runbookIntelligence) return { playbook, score: 0, level: "UNKNOWN" };
        return runbookIntelligence.getRiskScore(playbook);
      },
      getRollbackAssessment: async ({ playbook }: { playbook: string }) => {
        if (!runbookIntelligence) return { playbook, rollbackable: false, assessment: null };
        return runbookIntelligence.getRollbackAssessment(playbook);
      },
    },
    messages: {
      log: ({ level, message }: { level: string; message: string }) => {
        console.log(`[${level.toUpperCase()}] ${message}`);
      },
    },
  },
});

let mainWindow: BrowserWindow;

mainWindow = new BrowserWindow({
  title: "Mission Data Grid - AutoNet Assistant",
  url: "views://dashboard/index.html",
  frame: { width: 1500, height: 950, minWidth: 1100, minHeight: 700 },
  rpc: mainWindowRPC,
});

ApplicationMenu.setApplicationMenu([
  {
    label: "Mission Data Grid",
    submenu: [
      { label: "Dashboard", action: () => mainWindow.webview.loadURL("views://dashboard/index.html") },
      { type: "separator" },
      { label: "Quit", role: "quit" },
    ],
  },
]);

try {
  const tray = new Tray({
    icon: "assets/icon.svg",
    menu: [
      { label: "Open", action: "open" },
      { label: "Quit", action: "quit" },
    ],
  });
  tray.on("click", () => mainWindow.show());
} catch (error) {
  console.warn("Tray initialization failed:", error);
}

// Periodic system metrics collection (local only, always safe)
setInterval(async () => {
  try {
    const metrics = await systemMonitor.getMetrics();
    cachedSystemMetrics = { cpuUsage: metrics.cpu.usage, memoryPercent: metrics.memory.percentage, diskPercent: metrics.disk.percentage };
  } catch { /* ignore */ }
}, 30_000);

// Startup sequence — DO NOT auto-start monitoring
setTimeout(() => {
  const root = mcpManager.getAutoNetRoot();
  const rootValid = root && existsSync(root);
  activityLogger.info("Application started", `Mission Data Grid v3.0.0 | AutoNet root: ${rootValid ? root : "not configured"} | Monitoring: ${monitoringEnabled ? "enabled" : "disabled (user controlled)"}`, "system", "SYSTEM");
  console.log(`[MDG] Started. Monitoring: ${monitoringEnabled}. Root valid: ${rootValid}`);

  // Initialize packet capture service (local-only, safe)
  packetCaptureService.initialize().catch((err) => console.warn("Packet capture init failed:", err));

  // If monitoring was previously enabled, start it now
  if (monitoringEnabled && rootValid) {
    mcpManager.startAll().then(async () => {
      const kits = await mcpManager.queryMissionKits().catch(() => []);
      db.saveMissionKits(kits);
      fileWatcher?.startWatching();
      activityLogger.info("Monitoring auto-resumed", `Resumed with ${kits.length} kit(s)`, "system", "SYSTEM");
    }).catch((error) => {
      // Do NOT disable monitoring on startup probe failure — kits are still readable from YAML
      console.warn("[MDG] Auto-resume probe failed (kits still readable from inventory):", error?.message ?? error);
    });
  }
}, 1_000);
