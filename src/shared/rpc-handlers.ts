/**
 * Typed RPC Handlers - Frontend interface to all backend capabilities
 * This module provides type-safe access to all backend RPC methods
 */

import { rpcClient } from "./rpc-client";

// ============================================================================
// Type Definitions (matching backend responses)
// ============================================================================

export interface MeshNode {
  id: string;
  name: string;
  type: "KIT" | "GATEWAY" | "CONTROLLER" | "SENSOR";
  status: "ONLINE" | "OFFLINE" | "DEGRADED";
  lat?: number;
  lon?: number;
  location?: string;
  kits?: number;
  devices?: number;
}

export interface MeshLink {
  source: string;
  target: string;
  quality: number;
  latency: number;
  bandwidth: number;
  state: "HEALTHY" | "DEGRADED" | "FAILED";
}

export interface MeshTopology {
  generatedAt: Date;
  nodes: MeshNode[];
  links: MeshLink[];
  degradationStates: Record<string, any>;
}

export interface HealthMetric {
  label: string;
  value: number;
  unit: string;
  trend: "UP" | "DOWN" | "STABLE";
  status: "HEALTHY" | "WARNING" | "CRITICAL";
}

export interface HealthScore {
  overall: number;
  timestamp: Date;
  metrics: HealthMetric[];
  deviceHealth: Array<{ name: string; status: string; issues: number }>;
  alerts: Array<{ severity: string; message: string; timestamp: Date }>;
}

export interface PacketFlow {
  id: string;
  sourceIp: string;
  destIp: string;
  sourcePort: number;
  destPort: number;
  protocol: string;
  packetCount: number;
  byteCount: number;
  state: string;
  duration: number;
  firstSeen: Date;
  lastSeen: Date;
  threat?: { level: string; category: string; indicators: string[] };
}

export interface SecurityEvent {
  id: string;
  timestamp: Date;
  severity: "INFO" | "WARNING" | "CRITICAL";
  category: string;
  description: string;
  sourceIp?: string;
  destIp?: string;
  protocol?: string;
}

export interface PacketCaptureSession {
  available: boolean;
  active: boolean;
  packetsCaptured: number;
  bytesCaptured: number;
  flowsTracked: number;
}

export interface KitApiHealth {
  kitId: string;
  kitName: string;
  apiUrl: string;
  status: "HEALTHY" | "SLOW" | "UNREACHABLE" | "UNKNOWN";
  responseTime: number;
  lastCheck: Date;
  uptime: number;
}

export interface DegradationState {
  kitId: string;
  kitName: string;
  level: "FULL" | "PARTIAL" | "NONE";
  reason: string;
  affectedServices: string[];
  recoveryEstimate: number;
}

export interface Certificate {
  kitId: string;
  kitName: string;
  subject: string;
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  daysUntilExpiry: number;
  isValid: boolean;
}

export interface ConfigDrift {
  kitId: string;
  kitName: string;
  driftDetected: boolean;
  driftItems: Array<{
    parameter: string;
    expectedValue: string;
    actualValue: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
  }>;
  lastSync: Date;
}

export interface TransportLink {
  kitId: string;
  linkId: string;
  sourceKit: string;
  destKit: string;
  transportType: string;
  status: string;
  latency: number;
  throughput: number;
  packetLoss: number;
}

export interface ZitiIdentity {
  kitId: string;
  identityId: string;
  name: string;
  type: string;
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED";
  lastAuth: Date;
  posture: { status: string; score: number };
}

export interface EmergencyProcedure {
  id: string;
  name: string;
  description: string;
  severity: "LOW" | "HIGH" | "CRITICAL";
  estimatedDuration: number;
  applicableToKits: string[];
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
  relevanceScore?: number;
}

// ============================================================================
// RPC Handler Functions
// ============================================================================

export const rpcHandlers = {
  // Topology & Network
  async getMeshTopology(): Promise<MeshTopology> {
    return rpcClient.call("getMeshTopology", {});
  },

  // Health & Metrics
  async getHealthScore(): Promise<HealthScore> {
    return rpcClient.call("getHealthScore", {});
  },

  async getKitApiHealth(): Promise<KitApiHealth[]> {
    return rpcClient.call("getKitApiHealth", {});
  },

  // Degradation & Performance
  async getDegradationStates(): Promise<DegradationState[]> {
    return rpcClient.call("getDegradationStates", {});
  },

  // Packet Capture & Intelligence
  async getPacketCaptureStatus(): Promise<PacketCaptureSession> {
    return rpcClient.call("getPacketCaptureStatus", {});
  },

  async startPacketCapture(params?: { interfaceName?: string; bpfFilter?: string }) {
    return rpcClient.call("startPacketCapture", params || {});
  },

  async stopPacketCapture() {
    return rpcClient.call("stopPacketCapture", {});
  },

  async getCaptureInterfaces() {
    return rpcClient.call("getCaptureInterfaces", {});
  },

  // Security & PKI
  async getPkiStatus(): Promise<Certificate[]> {
    return rpcClient.call("getPkiStatus", {});
  },

  async getSecurityStatus() {
    return rpcClient.call("getSecurityStatus", {});
  },

  // Configuration
  async getConfigDrift(): Promise<ConfigDrift[]> {
    return rpcClient.call("getConfigDrift", {});
  },

  async validateAutonetConfig() {
    return rpcClient.call("validateAutonetConfig", {});
  },

  // Transport & Connectivity
  async getTransportLinks(): Promise<TransportLink[]> {
    return rpcClient.call("getTransportLinks", {});
  },

  // Identity & Access
  async getZitiIdentities(): Promise<ZitiIdentity[]> {
    return rpcClient.call("getZitiIdentities", {});
  },

  // Ansible
  async checkAnsibleVersion(): Promise<{ installed: boolean; version?: string }> {
    return rpcClient.call("checkAnsibleVersion", {});
  },

  // Notifications
  async getNotifications(params?: { limit?: number }) {
    return rpcClient.call("getNotifications", params || { limit: 100 });
  },

  async markNotificationRead(params: { id: string }) {
    return rpcClient.call("markNotificationRead", params);
  },

  async markAllNotificationsRead() {
    return rpcClient.call("markAllNotificationsRead", {});
  },

  // Automation & Orchestration
  async listPlaybooks() {
    return rpcClient.call("listPlaybooks", {});
  },

  async runPlaybookCheck(params: { playbook: string; limit?: string; tags?: string[] }) {
    return rpcClient.call("runPlaybookCheck", params);
  },

  async getKitAddressPlan(params: {
    kitName: string;
    missionId: number;
    kitId: number;
    proxmoxIp: string;
    vmidBase: number;
    lanBase: string;
    wgBase: string;
  }) {
    return rpcClient.call("getKitAddressPlan", params);
  },

  // Emergency & Failover
  async getEmergencyProcedures(): Promise<EmergencyProcedure[]> {
    return rpcClient.call("getEmergencyProcedures", {});
  },

  async runEmergencyProcedure(params: { procedureId: string; targetKit?: string }) {
    return rpcClient.call("runEmergencyProcedure", params);
  },

  async getEmergencyRunbook(params?: { targetKit?: string }) {
    return rpcClient.call("getEmergencyRunbook", params || {});
  },

  // Knowledge & Intelligence
  async searchKnowledgeBase(params: { query: string }): Promise<KnowledgeArticle[]> {
    return rpcClient.call("searchKnowledgeBase", params);
  },

  async getKnowledgeCategories() {
    return rpcClient.call("getKnowledgeCategories", {});
  },

  async getKnowledgeArticle(params: { id: string }): Promise<KnowledgeArticle | null> {
    return rpcClient.call("getKnowledgeArticle", params);
  },

  async getTroubleshootingTrees() {
    return rpcClient.call("getTroubleshootingTrees", {});
  },

  // Monitoring Control
  async getMonitoringStatus() {
    return rpcClient.call("getMonitoringStatus", {});
  },

  async enableMonitoring() {
    return rpcClient.call("enableMonitoring", {});
  },

  async disableMonitoring() {
    return rpcClient.call("disableMonitoring", {});
  },

  // Activity & Logging
  async getActivityStream(params?: { limit?: number }) {
    return rpcClient.call("getActivityStream", params || { limit: 100 });
  },

  async getRecentLogs(params?: { limit?: number }) {
    return rpcClient.call("getRecentLogs", params || { limit: 100 });
  },

  // System Status
  async getSystemStatus() {
    return rpcClient.call("getSystemStatus", {});
  },

  async getAutonetOverview() {
    return rpcClient.call("getAutonetOverview", {});
  },

  async getNetworkStatus() {
    return rpcClient.call("getNetworkStatus", {});
  },

  // Settings
  async getSettings() {
    return rpcClient.call("getSettings", {});
  },

  async updateSettings(params: {
    autonetRoot?: string;
    networkMode?: "AUTONET_ASSIST" | "UNIVERSAL_INTEL";
    selectedNetworkInterface?: string;
    syncIntervalSeconds?: number;
    autoSync?: boolean;
  }) {
    return rpcClient.call("updateSettings", params);
  },

  // Phase 9: Intelligence Tiers - Predictive Failure Analytics
  async predictNetworkFailures(params: { kitId: string; hoursAhead?: number }) {
    return rpcClient.call("predictNetworkFailures", params);
  },

  async forecastCapacity(params: { kitId: string; metricName: string; hoursAhead?: number }) {
    return rpcClient.call("forecastCapacity", params);
  },

  async getAnomalyPatterns(params: { kitId: string; hoursBack?: number }) {
    return rpcClient.call("getAnomalyPatterns", params);
  },

  async detectMetricAnomalies(params: { kitId: string; metricName: string; values: number[] }) {
    return rpcClient.call("detectMetricAnomalies", params);
  },

  // Phase 9: Intelligence Tiers - Coalition Health Correlation
  async getCoalitionDependencies(params: { kitId: string }) {
    return rpcClient.call("getCoalitionDependencies", params);
  },

  async registerDependency(params: {
    sourceKitId: string;
    targetKitId: string;
    dependencyType: string;
    criticality: string;
  }) {
    return rpcClient.call("registerDependency", params);
  },

  async analyzeFailurePropagation(params: { sourceKitId: string }) {
    return rpcClient.call("analyzeFailurePropagation", params);
  },

  async getCoalitionScore(params: { kitIds: string[] }) {
    return rpcClient.call("getCoalitionScore", params);
  },

  async detectResourceContention(params: { kitIds: string[] }) {
    return rpcClient.call("detectResourceContention", params);
  },

  async simulateCascadeFailure(params: { initialFailedKit: string; allKits: string[] }) {
    return rpcClient.call("simulateCascadeFailure", params);
  },

  // Phase 9: Intelligence Tiers - Network Optimization Engine
  async optimizeBandwidth(params: { paths: Array<any> }) {
    return rpcClient.call("optimizeBandwidth", params);
  },

  async suggestRoutingChanges(params: { paths: Array<any> }) {
    return rpcClient.call("suggestRoutingChanges", params);
  },

  async simulateQueue(params: {
    arrivalRate: number;
    serviceRate: number;
    bufferSize: number;
    durationMs: number;
  }) {
    return rpcClient.call("simulateQueue", params);
  },

  async analyzeTrafficPattern(params: { pathId: string; hoursBack?: number }) {
    return rpcClient.call("analyzeTrafficPattern", params);
  },

  // Phase 9: Intelligence Tiers - Configuration Drift Intelligence
  async detectConfigDrift(params: { kitId: string; currentConfig: Record<string, any> }) {
    return rpcClient.call("detectConfigDrift", params);
  },

  async predictChangeImpact(params: {
    kitId: string;
    proposedConfig: Record<string, any>;
    currentConfig: Record<string, any>;
  }) {
    return rpcClient.call("predictChangeImpact", params);
  },

  async suggestConfigOptimizations(params: { kitId: string; currentConfig: Record<string, any> }) {
    return rpcClient.call("suggestConfigOptimizations", params);
  },

  async approveConfigVariation(params: {
    kitId: string;
    configField: string;
    approvedValues: string[];
    reason: string;
    expiresAt?: Date;
  }) {
    return rpcClient.call("approveConfigVariation", params);
  },

  async getConfigTimeline(params: { kitId: string; hoursBack?: number }) {
    return rpcClient.call("getConfigTimeline", params);
  },

  // Phase 9: Intelligence Tiers - Performance Intelligence
  async trackSLO(params: {
    kitId: string;
    serviceName: string;
    metrics: Array<{
      timestamp: Date;
      metricType: string;
      value: number;
    }>;
  }) {
    return rpcClient.call("trackSLO", params);
  },

  async analyzeLatency(params: { kitId: string; applicationName: string; hoursBack?: number }) {
    return rpcClient.call("analyzeLatency", params);
  },

  async assessUXImpact(params: { kitId: string; timeWindowHours?: number }) {
    return rpcClient.call("assessUXImpact", params);
  },

  async identifyBottlenecks(params: { kitId: string }) {
    return rpcClient.call("identifyBottlenecks", params);
  },

  async recordPerformanceMetric(params: {
    kitId: string;
    applicationName: string;
    metricType: string;
    value: number;
    unit: string;
  }) {
    return rpcClient.call("recordPerformanceMetric", params);
  },

  async recordErrorEvent(params: {
    kitId: string;
    serviceName: string;
    errorType: string;
    errorRate: number;
    errorCount: number;
    affectedRequests: number;
  }) {
    return rpcClient.call("recordErrorEvent", params);
  },

  async clearCache(): Promise<{ deleted: number }> {
    return rpcClient.call("clearCache", {});
  },

  // =========================================================================
  // Phase 4: WireGuard Monitor
  // =========================================================================

  async getWireGuardStatus() {
    return rpcClient.call("getWireGuardStatus", {});
  },

  async validateMTUCompliance() {
    return rpcClient.call("validateMTUCompliance", {});
  },

  async getPeerMatrix() {
    return rpcClient.call("getPeerMatrix", {});
  },

  async getTunnelHealth() {
    return rpcClient.call("getTunnelHealth", {});
  },

  async getKeyRotationStatus() {
    return rpcClient.call("getKeyRotationStatus", {});
  },

  // =========================================================================
  // Phase 4: BGP Intelligence
  // =========================================================================

  async getBGPOverview() {
    return rpcClient.call("getBGPOverview", {});
  },

  async getASPathAnalysis() {
    return rpcClient.call("getASPathAnalysis", {});
  },

  async getRouteConvergence() {
    return rpcClient.call("getRouteConvergence", {});
  },

  async getTopologyType() {
    return rpcClient.call("getTopologyType", {});
  },

  async getPeerRelationships() {
    return rpcClient.call("getPeerRelationships", {});
  },

  // =========================================================================
  // Phase 4: Ziti Fabric
  // =========================================================================

  async getFabricOverview() {
    return rpcClient.call("getFabricOverview", {});
  },

  async getRouterHealth() {
    return rpcClient.call("getRouterHealth", {});
  },

  async getPlaneIsolationStatus() {
    return rpcClient.call("getPlaneIsolationStatus", {});
  },

  async getFabricLinkCosts() {
    return rpcClient.call("getFabricLinkCosts", {});
  },

  async analyzeRouterFailureImpact(routerType: string) {
    return rpcClient.call("analyzeRouterFailureImpact", { routerType });
  },

  // =========================================================================
  // Phase 4: Kit Readiness
  // =========================================================================

  async validateAllKits() {
    return rpcClient.call("validateAllKits", {});
  },

  async validateKit(name: string) {
    return rpcClient.call("validateKit", { name });
  },

  async getReadinessScore(name: string) {
    return rpcClient.call("getReadinessScore", { name });
  },

  async generatePreFieldChecklist(name: string) {
    return rpcClient.call("generatePreFieldChecklist", { name });
  },

  // =========================================================================
  // Phase 4: Threat Intelligence
  // =========================================================================

  async getThreatOverview() {
    return rpcClient.call("getThreatOverview", {});
  },

  async getKitThreatScore(kitId: string) {
    return rpcClient.call("getKitThreatScore", { kitId });
  },

  async getThreatTimeline(hours: number) {
    return rpcClient.call("getThreatTimeline", { hours });
  },

  async analyzeSSHPatterns() {
    return rpcClient.call("analyzeSSHPatterns", {});
  },

  async getIOCSummary() {
    return rpcClient.call("getIOCSummary", {});
  },

  async correlateEvents() {
    return rpcClient.call("correlateEvents", {});
  },

  // =========================================================================
  // Phase 5: Transport Failover Prediction
  // =========================================================================

  async getTransportPredictions() {
    return rpcClient.call("getTransportPredictions", {});
  },

  async getFailoverChain(kitId: string) {
    return rpcClient.call("getFailoverChain", { kitId });
  },

  async predictTimeToFailover(kitId: string) {
    return rpcClient.call("predictTimeToFailover", { kitId });
  },

  async getTransportDiversityScore(kitId: string) {
    return rpcClient.call("getTransportDiversityScore", { kitId });
  },

  async getSignalTrends() {
    return rpcClient.call("getSignalTrends", {});
  },

  // =========================================================================
  // Phase 5: Operational State Classifier
  // =========================================================================

  async getAllKitStates() {
    return rpcClient.call("getAllKitStates", {});
  },

  async getStateHistory(kitId: string) {
    return rpcClient.call("getStateHistory", { kitId });
  },

  async getAutonomousCapabilities(state: string) {
    return rpcClient.call("getAutonomousCapabilities", { state });
  },

  async predictStateTransition(kitId: string) {
    return rpcClient.call("predictStateTransition", { kitId });
  },

  async getStateDurations() {
    return rpcClient.call("getStateDurations", {});
  },

  // =========================================================================
  // Phase 5: Priority Queue Management
  // =========================================================================

  async getQueueStatus() {
    return rpcClient.call("getQueueStatus", {});
  },

  async getBandwidthAllocation() {
    return rpcClient.call("getBandwidthAllocation", {});
  },

  async getPriorityDistribution() {
    return rpcClient.call("getPriorityDistribution", {});
  },

  async getLatencyEstimates() {
    return rpcClient.call("getLatencyEstimates", {});
  },

  async detectStarvation() {
    return rpcClient.call("detectStarvation", {});
  },

  async getQoSRecommendations() {
    return rpcClient.call("getQoSRecommendations", {});
  },

  async enqueueTestItem() {
    return rpcClient.call("enqueueTestItem", {});
  },

  // =========================================================================
  // Phase 5: PKI Chain Validator
  // =========================================================================

  async getCertificateInventory() {
    return rpcClient.call("getCertificateInventory", {});
  },

  async getTrustModelHealth() {
    return rpcClient.call("getTrustModelHealth", {});
  },

  async getExpiryAlerts() {
    return rpcClient.call("getExpiryAlerts", {});
  },

  async getRevocationStatus() {
    return rpcClient.call("getRevocationStatus", {});
  },

  async validateCrossKitTrust() {
    return rpcClient.call("validateCrossKitTrust", {});
  },

  async validateChain(kitName: string) {
    return rpcClient.call("validateChain", { kitName });
  },

  // =========================================================================
  // Phase 5: Runbook Intelligence
  // =========================================================================

  async getPlaybookAnalysis() {
    return rpcClient.call("getPlaybookAnalysis", {});
  },

  async getTagDependencyMap() {
    return rpcClient.call("getTagDependencyMap", {});
  },

  async getImpactAnalysis(playbook: string) {
    return rpcClient.call("getImpactAnalysis", { playbook });
  },

  async getRoleDependencyGraph() {
    return rpcClient.call("getRoleDependencyGraph", {});
  },

  async suggestExecutionPlan(description: string) {
    return rpcClient.call("suggestExecutionPlan", { description });
  },

  async getRiskScore(playbook: string) {
    return rpcClient.call("getRiskScore", { playbook });
  },

  async getRollbackAssessment(playbook: string) {
    return rpcClient.call("getRollbackAssessment", { playbook });
  },
};
