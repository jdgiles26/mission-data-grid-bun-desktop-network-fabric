import type { NetworkDevice, MissionKit, MeshState } from "../shared/types";
import type { HealthBreakdown } from "./health-engine";
import type { Database } from "./database";

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface CommandHandler {
  pattern: RegExp;
  description: string;
  handler: (match: RegExpMatchArray, context: AssistantContext) => Promise<string>;
}

interface AssistantContext {
  devices: NetworkDevice[];
  kits: MissionKit[];
  meshState: MeshState;
  health: HealthBreakdown | null;
  syncStats: { pending: number; synced: number; failed: number };
  systemMetrics: { cpuUsage: number; memoryPercent: number; diskPercent: number } | null;
}

export class AIAssistant {
  private readonly db: Database;
  private messages: AssistantMessage[] = [];
  private modelPath: string | null = null;
  private modelLoaded = false;
  private context: AssistantContext = {
    devices: [],
    kits: [],
    meshState: "FULL",
    health: null,
    syncStats: { pending: 0, synced: 0, failed: 0 },
    systemMetrics: null,
  };

  private readonly commands: CommandHandler[] = [
    {
      pattern: /^\/?(status|overview|report)\b/i,
      description: "Get system status overview",
      handler: async (_m, ctx) => this.generateStatusReport(ctx),
    },
    {
      pattern: /^\/?(devices?|nodes?)\b/i,
      description: "List and analyze network devices",
      handler: async (_m, ctx) => this.analyzeDevices(ctx),
    },
    {
      pattern: /^\/?(health|score)\b/i,
      description: "Explain health score breakdown",
      handler: async (_m, ctx) => this.explainHealth(ctx),
    },
    {
      pattern: /^\/?(mesh|connectivity|network)\b/i,
      description: "Analyze mesh connectivity status",
      handler: async (_m, ctx) => this.analyzeMesh(ctx),
    },
    {
      pattern: /^\/?(sync|records?)\b/i,
      description: "Show sync status and record statistics",
      handler: async (_m, ctx) => this.analyzeSyncStatus(ctx),
    },
    {
      pattern: /^\/?(security|threats?|vuln)\b/i,
      description: "Security posture analysis",
      handler: async (_m, ctx) => this.analyzeSecurityPosture(ctx),
    },
    {
      pattern: /^\/?(kits?|missions?)\b/i,
      description: "List mission kits and their status",
      handler: async (_m, ctx) => this.analyzeKits(ctx),
    },
    {
      pattern: /^\/?(suggest|recommend|improve)\b/i,
      description: "Get improvement suggestions",
      handler: async (_m, ctx) => this.suggestImprovements(ctx),
    },
    {
      pattern: /^\/?(system|resources?|cpu|memory|disk)\b/i,
      description: "Show local system resource usage",
      handler: async (_m, ctx) => this.analyzeSystemResources(ctx),
    },
    {
      pattern: /^\/?(help|commands?)\b/i,
      description: "Show available commands",
      handler: async () => this.showHelp(),
    },
    // === Phase 10: AutoNet Intelligence Commands ===
    {
      pattern: /^\/?(wireguard|wg|tunnels?)\b/i,
      description: "WireGuard mesh tunnel status and MTU compliance",
      handler: async (_m, ctx) => this.analyzeWireGuard(ctx),
    },
    {
      pattern: /^\/?(bgp|routes?|routing)\b/i,
      description: "BGP routing intelligence and AS path analysis",
      handler: async (_m, ctx) => this.analyzeBGP(ctx),
    },
    {
      pattern: /^\/?(ziti|fabric|zero.?trust)\b/i,
      description: "Ziti fabric health and three-plane isolation status",
      handler: async (_m, ctx) => this.analyzeZitiFabric(ctx),
    },
    {
      pattern: /^\/?(readiness|preflight|deploy)\b/i,
      description: "Kit deployment readiness assessment",
      handler: async (_m, ctx) => this.analyzeReadiness(ctx),
    },
    {
      pattern: /^\/?(threat|ioc|intrusion)\b/i,
      description: "Threat intelligence and IOC correlation",
      handler: async (_m, ctx) => this.analyzeThreatIntel(ctx),
    },
    {
      pattern: /^\/?(failover|transport|wan)\b/i,
      description: "Transport failover prediction and diversity analysis",
      handler: async (_m, ctx) => this.analyzeTransportFailover(ctx),
    },
    {
      pattern: /^\/?(state|operational|island)\b/i,
      description: "Operational state classification across all kits",
      handler: async (_m, ctx) => this.analyzeOperationalState(ctx),
    },
    {
      pattern: /^\/?(priority|queue|qos|flash)\b/i,
      description: "Mission priority queue status and QoS analysis",
      handler: async (_m, ctx) => this.analyzePriorityQueue(ctx),
    },
    {
      pattern: /^\/?(pki|cert|certificate|chain)\b/i,
      description: "PKI chain validation and certificate health",
      handler: async (_m, ctx) => this.analyzePKI(ctx),
    },
    {
      pattern: /^\/?(runbook|playbook|ansible|tag)\b/i,
      description: "Ansible runbook intelligence and execution planning",
      handler: async (_m, ctx) => this.analyzeRunbooks(ctx),
    },
  ];

  constructor(db: Database) {
    this.db = db;
    this.db.initAIMessages();
    this.messages = this.db.getAIMessages(20);
  }

  updateContext(ctx: Partial<AssistantContext>): void {
    Object.assign(this.context, ctx);
  }

  async processMessage(input: string): Promise<string> {
    const userMsg: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };
    this.messages.push(userMsg);
    this.db.saveAIMessage(userMsg);

    let response: string;

    // Check built-in commands first
    for (const cmd of this.commands) {
      const match = input.match(cmd.pattern);
      if (match) {
        response = await cmd.handler(match, this.context);
        break;
      }
    }

    // If no command matched, use intelligent free-form response
    response ??= await this.handleFreeForm(input);

    const assistantMsg: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: response,
      timestamp: new Date(),
    };
    this.messages.push(assistantMsg);
    this.db.saveAIMessage(assistantMsg);

    return response;
  }

  getMessages(limit = 50): AssistantMessage[] {
    return this.messages.slice(-limit);
  }

  clearHistory(): void {
    this.messages = [];
    this.db.clearAIMessages();
  }

  getAvailableCommands(): Array<{ command: string; description: string }> {
    return this.commands.map((cmd) => ({
      command: cmd.pattern.source.replace(/^\^\\\/\?|\(|\)|\b|\\b|\/i$/g, "").split("|")[0] || "unknown",
      description: cmd.description,
    }));
  }

  setModelPath(path: string): void {
    this.modelPath = path;
  }

  getModelPath(): string | null {
    return this.modelPath;
  }

  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  private async handleFreeForm(input: string): Promise<string> {
    const lower = input.toLowerCase();

    // Keyword-based intelligent routing
    if (lower.includes("down") || lower.includes("offline") || lower.includes("unreachable")) {
      const down = this.context.devices.filter((d) => d.status === "UNREACHABLE" || d.status === "CRITICAL");
      if (down.length > 0) {
        return `There are ${down.length} device(s) currently down or unreachable:\n\n` +
          down.map((d) => `  - ${d.hostname} (${d.ip}) - ${d.status} - Last checked: ${d.lastChecked.toISOString()}`).join("\n") +
          `\n\nRecommendation: Check network connectivity and power status for these nodes. Run '/devices' for full device analysis.`;
      }
      return "All monitored devices are currently reachable. No outages detected.";
    }

    if (lower.includes("how many") || lower.includes("count") || lower.includes("total")) {
      return `Current counts:\n` +
        `  - Devices: ${this.context.devices.length}\n` +
        `  - Mission Kits: ${this.context.kits.length}\n` +
        `  - Pending Sync: ${this.context.syncStats.pending}\n` +
        `  - Synced Records: ${this.context.syncStats.synced}\n` +
        `  - Failed Records: ${this.context.syncStats.failed}\n` +
        `  - Mesh State: ${this.context.meshState}`;
    }

    if (lower.includes("problem") || lower.includes("issue") || lower.includes("wrong") || lower.includes("error")) {
      return this.diagnoseProblems();
    }

    // Default: generate contextual response
    if (this.modelPath && this.modelLoaded) {
      return "[GGUF model inference not yet connected - model path configured at: " + this.modelPath + "]\n\n" +
        "Once connected, I will process your query: \"" + input + "\" using the loaded model.\n\n" +
        "For now, try one of the built-in commands. Type '/help' to see them.";
    }

    return `I understand you're asking about: "${input}"\n\n` +
      "I can help with device monitoring, health analysis, sync status, mesh connectivity, and security posture using built-in intelligence.\n\n" +
      "Available commands:\n" +
      this.commands.map((c) => `  /${c.pattern.source.replace(/^\^\\\/\?|\(|\)|\b|\\b$/g, "").split("|")[0]} - ${c.description}`).join("\n") +
      "\n\nFor advanced natural language queries, configure a .gguf model in Settings > AI Configuration.";
  }

  private async generateStatusReport(ctx: AssistantContext): Promise<string> {
    const lines: string[] = [
      "=== MISSION DATA GRID - STATUS REPORT ===",
      `Generated: ${new Date().toISOString()}`,
      "",
      `MESH STATE: ${ctx.meshState}`,
      `DEVICES: ${ctx.devices.length} total | ${ctx.devices.filter((d) => d.status === "HEALTHY").length} healthy | ${ctx.devices.filter((d) => d.status === "UNREACHABLE").length} unreachable`,
      `MISSION KITS: ${ctx.kits.length} configured | ${ctx.kits.filter((k) => k.status === "ONLINE").length} online`,
      `SYNC: ${ctx.syncStats.synced} synced | ${ctx.syncStats.pending} pending | ${ctx.syncStats.failed} failed`,
    ];

    if (ctx.health) {
      lines.push(
        "",
        `HEALTH SCORE: ${ctx.health.overall}/100 (Grade: ${ctx.health.grade})`,
        `  Device Health:     ${ctx.health.categories.deviceHealth.score}% - ${ctx.health.categories.deviceHealth.detail}`,
        `  Sync Reliability:  ${ctx.health.categories.syncReliability.score}% - ${ctx.health.categories.syncReliability.detail}`,
        `  Mesh Connectivity: ${ctx.health.categories.meshConnectivity.score}% - ${ctx.health.categories.meshConnectivity.detail}`,
        `  Security Posture:  ${ctx.health.categories.securityPosture.score}% - ${ctx.health.categories.securityPosture.detail}`,
        `  System Resources:  ${ctx.health.categories.systemResources.score}% - ${ctx.health.categories.systemResources.detail}`,
      );
    }

    if (ctx.systemMetrics) {
      lines.push(
        "",
        `SYSTEM: CPU ${ctx.systemMetrics.cpuUsage}% | Memory ${ctx.systemMetrics.memoryPercent}% | Disk ${ctx.systemMetrics.diskPercent}%`,
      );
    }

    const issues = this.findIssues(ctx);
    if (issues.length > 0) {
      lines.push("", "ACTIVE ISSUES:", ...issues.map((i) => `  [!] ${i}`));
    }

    return lines.join("\n");
  }

  private async analyzeDevices(ctx: AssistantContext): Promise<string> {
    if (ctx.devices.length === 0) {
      return "No devices are currently being monitored. Check your AutoNet configuration in Settings.";
    }

    const byRole = new Map<string, NetworkDevice[]>();
    for (const d of ctx.devices) {
      const list = byRole.get(d.role) || [];
      list.push(d);
      byRole.set(d.role, list);
    }

    const lines: string[] = [`Device Analysis (${ctx.devices.length} total)`, ""];

    for (const [role, devices] of byRole) {
      lines.push(`${role} (${devices.length}):`);
      for (const d of devices) {
        const statusIcon = d.status === "HEALTHY" ? "[OK]" : d.status === "WARNING" ? "[!!]" : "[XX]";
        lines.push(`  ${statusIcon} ${d.hostname} (${d.ip}) - CPU: ${d.metrics.cpu}%, Mem: ${d.metrics.memory}%, Up: ${Math.floor(d.metrics.uptime / 3600)}h`);
      }
      lines.push("");
    }

    const highCpu = ctx.devices.filter((d) => d.metrics.cpu > 80);
    const highMem = ctx.devices.filter((d) => d.metrics.memory > 80);
    if (highCpu.length > 0 || highMem.length > 0) {
      lines.push("Alerts:");
      for (const d of highCpu) lines.push(`  - ${d.hostname}: CPU at ${d.metrics.cpu}% (threshold: 80%)`);
      for (const d of highMem) lines.push(`  - ${d.hostname}: Memory at ${d.metrics.memory}% (threshold: 80%)`);
    }

    return lines.join("\n");
  }

  private async explainHealth(ctx: AssistantContext): Promise<string> {
    if (!ctx.health) {
      return "Health score has not been calculated yet. Loading data...";
    }

    const h = ctx.health;
    return [
      `Health Score: ${h.overall}/100 (Grade: ${h.grade})`,
      "",
      "Breakdown:",
      `  Device Health:     ${h.categories.deviceHealth.score}% (weight: 30%) ${this.trendArrow(h.categories.deviceHealth.trend)}`,
      `    ${h.categories.deviceHealth.detail}`,
      "",
      `  Sync Reliability:  ${h.categories.syncReliability.score}% (weight: 20%) ${this.trendArrow(h.categories.syncReliability.trend)}`,
      `    ${h.categories.syncReliability.detail}`,
      "",
      `  Mesh Connectivity: ${h.categories.meshConnectivity.score}% (weight: 25%) ${this.trendArrow(h.categories.meshConnectivity.trend)}`,
      `    ${h.categories.meshConnectivity.detail}`,
      "",
      `  Security Posture:  ${h.categories.securityPosture.score}% (weight: 15%) ${this.trendArrow(h.categories.securityPosture.trend)}`,
      `    ${h.categories.securityPosture.detail}`,
      "",
      `  System Resources:  ${h.categories.systemResources.score}% (weight: 10%) ${this.trendArrow(h.categories.systemResources.trend)}`,
      `    ${h.categories.systemResources.detail}`,
    ].join("\n");
  }

  private async analyzeMesh(ctx: AssistantContext): Promise<string> {
    const stateDescriptions: Record<MeshState, string> = {
      FULL: "All nodes connected. WireGuard tunnels active. BGP peering established across all kits.",
      PARTIAL_WAN: "Some WAN links are degraded. Kit-to-kit communication may be affected. Check edge gateways.",
      KIT_TO_KIT_LOSS: "Inter-kit tunnels are down. Kits can reach HQ but not each other. Check WireGuard configurations.",
      HQ_CONTROLLER_LOSS: "Cannot reach HQ Ziti controller. Local mesh operational. Check WAN connectivity.",
      FULL_ISOLATION: "Complete mesh failure. No devices reachable. Check physical connectivity and power.",
    };

    const edges = ctx.devices.filter((d) => d.role === "EDGE");
    const controllers = ctx.devices.filter((d) => d.hostname.includes("ziti-ctrl"));

    return [
      `Mesh State: ${ctx.meshState}`,
      stateDescriptions[ctx.meshState],
      "",
      `Edge Gateways: ${edges.filter((d) => d.status !== "UNREACHABLE").length}/${edges.length} reachable`,
      `Ziti Controllers: ${controllers.filter((d) => d.status !== "UNREACHABLE").length}/${controllers.length} reachable`,
      `Active Kits: ${ctx.kits.filter((k) => k.status === "ONLINE").length}/${ctx.kits.length}`,
    ].join("\n");
  }

  private async analyzeSyncStatus(ctx: AssistantContext): Promise<string> {
    const total = ctx.syncStats.pending + ctx.syncStats.synced + ctx.syncStats.failed;
    const successRate = total > 0 ? Math.round((ctx.syncStats.synced / total) * 100) : 100;

    return [
      "Sync Status Report",
      "",
      `Total Records: ${total}`,
      `  Synced:  ${ctx.syncStats.synced} (${successRate}% success rate)`,
      `  Pending: ${ctx.syncStats.pending}`,
      `  Failed:  ${ctx.syncStats.failed}`,
      "",
      ctx.syncStats.failed > 0
        ? "Action Required: There are failed sync records. Try 'Sync Now' from the dashboard or check Codice Alliance credentials in Settings."
        : ctx.syncStats.pending > 0
          ? "Pending records will be synced on next cycle or when you click 'Sync Now'."
          : "All records are synced. No action required.",
    ].join("\n");
  }

  private async analyzeSecurityPosture(ctx: AssistantContext): Promise<string> {
    const unreachable = ctx.devices.filter((d) => d.status === "UNREACHABLE");
    const highResource = ctx.devices.filter((d) => d.metrics.cpu > 85 || d.metrics.memory > 85);
    const noFirewall = ctx.devices.filter((d) => d.role === "FIREWALL").length === 0;

    const findings: string[] = [];

    if (unreachable.length > 0) {
      findings.push(`[HIGH] ${unreachable.length} device(s) unreachable - cannot verify security state`);
      for (const d of unreachable) findings.push(`  - ${d.hostname} (${d.ip})`);
    }

    if (highResource.length > 0) {
      findings.push(`[MEDIUM] ${highResource.length} device(s) under resource pressure - potential DoS indicator`);
    }

    if (noFirewall && ctx.devices.length > 0) {
      findings.push("[MEDIUM] No dedicated firewall devices detected in topology");
    }

    if (ctx.meshState === "FULL_ISOLATION") {
      findings.push("[CRITICAL] Full mesh isolation - all devices unreachable");
    }

    if (ctx.syncStats.failed > 5) {
      findings.push("[LOW] Multiple sync failures - verify API credentials and endpoint accessibility");
    }

    return [
      "Security Posture Analysis",
      "",
      findings.length > 0
        ? `${findings.length} finding(s):\n\n${findings.join("\n\n")}`
        : "No security concerns detected. All monitored systems operating within normal parameters.",
      "",
      "Recommendations:",
      "  1. Ensure all edge gateways have firewall rules configured",
      "  2. Verify WireGuard tunnel encryption is active on all inter-kit links",
      "  3. Monitor BGP peering for unauthorized route advertisements",
      "  4. Review Ziti controller access policies periodically",
    ].join("\n");
  }

  private async analyzeKits(ctx: AssistantContext): Promise<string> {
    if (ctx.kits.length === 0) {
      return "No mission kits loaded. Configure the AutoNet project path in Settings.";
    }

    const lines: string[] = [`Mission Kits (${ctx.kits.length} total)`, ""];

    for (const kit of ctx.kits) {
      const statusTag = kit.status === "ONLINE" ? "[ONLINE]" : kit.status === "DEGRADED" ? "[DEGRADED]" : "[OFFLINE]";
      lines.push(
        `${statusTag} ${kit.name}`,
        `  ID: ${kit.id} | LAN: ${kit.lanSubnet} | WG: ${kit.wireguardIP} | BGP AS: ${kit.bgpAS}`,
        `  Last Seen: ${kit.lastSeen.toISOString()}`,
        "",
      );
    }

    return lines.join("\n");
  }

  private async suggestImprovements(ctx: AssistantContext): Promise<string> {
    const suggestions: string[] = [];

    if (ctx.devices.filter((d) => d.status === "UNREACHABLE").length > 0) {
      suggestions.push("Investigate unreachable devices - they may have network or power issues");
    }

    if (ctx.syncStats.failed > 0) {
      suggestions.push("Review and retry failed sync records - check API credentials");
    }

    if (ctx.meshState !== "FULL") {
      suggestions.push(`Mesh is in ${ctx.meshState} state - investigate WAN connectivity`);
    }

    if (ctx.systemMetrics && ctx.systemMetrics.cpuUsage > 70) {
      suggestions.push("Local system CPU is high - consider closing unused applications");
    }

    if (ctx.systemMetrics && ctx.systemMetrics.diskPercent > 80) {
      suggestions.push("Disk usage is high - consider clearing old data records");
    }

    if (ctx.kits.filter((k) => k.status === "DEGRADED").length > 0) {
      suggestions.push("Some kits are in DEGRADED state - check staged peer configurations");
    }

    if (suggestions.length === 0) {
      suggestions.push("System is operating optimally. No immediate improvements needed.");
    }

    return ["Improvement Suggestions", "", ...suggestions.map((s, i) => `  ${i + 1}. ${s}`)].join("\n");
  }

  private async analyzeSystemResources(ctx: AssistantContext): Promise<string> {
    if (!ctx.systemMetrics) {
      return "System metrics are not yet available. They will be collected shortly.";
    }

    const m = ctx.systemMetrics;
    return [
      "Local System Resources",
      "",
      `  CPU Usage:    ${m.cpuUsage}%`,
      `  Memory Usage: ${m.memoryPercent}%`,
      `  Disk Usage:   ${m.diskPercent}%`,
      "",
      m.cpuUsage > 80 ? "  [!] CPU usage is high" : "  [OK] CPU within normal range",
      m.memoryPercent > 80 ? "  [!] Memory usage is high" : "  [OK] Memory within normal range",
      m.diskPercent > 85 ? "  [!] Disk usage is critically high" : "  [OK] Disk within normal range",
    ].join("\n");
  }

  private async showHelp(): Promise<string> {
    return [
      "MDG AI Assistant - Available Commands",
      "",
      ...this.commands.map((c) => {
        const name = c.pattern.source.replace(/^\^\\\/\?\(/, "").replace(/\)\\b$/, "").split("|")[0];
        return `  /${name} - ${c.description}`;
      }),
      "",
      "You can also ask questions in natural language.",
      "Configure a .gguf model in Settings for enhanced AI capabilities.",
    ].join("\n");
  }

  private diagnoseProblems(): string {
    const issues = this.findIssues(this.context);
    if (issues.length === 0) {
      return "No problems detected. All systems operational.";
    }
    return ["Detected Issues:", "", ...issues.map((i) => `  - ${i}`)].join("\n");
  }

  private findIssues(ctx: AssistantContext): string[] {
    const issues: string[] = [];
    const unreachable = ctx.devices.filter((d) => d.status === "UNREACHABLE");
    if (unreachable.length > 0) issues.push(`${unreachable.length} device(s) unreachable`);
    if (ctx.meshState !== "FULL") issues.push(`Mesh degraded: ${ctx.meshState}`);
    if (ctx.syncStats.failed > 0) issues.push(`${ctx.syncStats.failed} failed sync record(s)`);
    if (ctx.syncStats.pending > 10) issues.push(`${ctx.syncStats.pending} records pending sync`);
    if (ctx.systemMetrics?.cpuUsage && ctx.systemMetrics.cpuUsage > 85) issues.push("High local CPU usage");
    if (ctx.systemMetrics?.diskPercent && ctx.systemMetrics.diskPercent > 90) issues.push("Critical disk usage");
    return issues;
  }

  private trendArrow(trend: "up" | "down" | "stable"): string {
    return trend === "up" ? "(improving)" : trend === "down" ? "(declining)" : "(stable)";
  }

  // === Phase 10: AutoNet Intelligence Analysis Methods ===

  private async analyzeWireGuard(ctx: AssistantContext): Promise<string> {
    const kitCount = ctx.kits.length;
    const onlineKits = ctx.kits.filter(k => k.status === "ONLINE").length;
    return [
      "=== WIREGUARD MESH ANALYSIS ===",
      "",
      `Kits in inventory: ${kitCount} | Online: ${onlineKits}`,
      "",
      "AutoNet WireGuard Architecture:",
      "  - Full-mesh kernel-native WireGuard tunnels",
      "  - CRITICAL MTU: 1300 (not default 1420) - prevents silent fragmentation",
      "  - UDP-based transport, transport-agnostic",
      "  - Formula-derived addressing: WG IP = 10.255.{mission}.{kit}",
      "",
      "Key Checks:",
      `  - MTU Compliance: Check 'WireGuard Mesh' view for per-kit MTU validation`,
      `  - Peer Matrix: See which kits can reach which via WG tunnels`,
      `  - Key Rotation: Run peer-exchange.yml for WireGuard key rotation`,
      `  - Handshake Age: Stale handshakes (>3min) indicate tunnel issues`,
      "",
      "Navigate to 'WireGuard Mesh' in sidebar for full tunnel health dashboard.",
    ].join("\n");
  }

  private async analyzeBGP(ctx: AssistantContext): Promise<string> {
    const kits = ctx.kits;
    return [
      "=== BGP ROUTE INTELLIGENCE ===",
      "",
      "AutoNet BGP Architecture (BIRD2):",
      "  - AS Formula: 4200000000 + (mission * 1000) + kit_id",
      "  - Direct peer cost: 5 | HQ fallback cost: 10",
      "  - Dynamic route distribution with automatic failover",
      "",
      `Mission Kits: ${kits.length}`,
      ...kits.map(k => `  - ${k.name}: AS ${k.bgpAS} | LAN ${k.lanSubnet} | WG ${k.wireguardIP}`),
      "",
      "Topology Options:",
      "  - Option A (2-3 kits): Full mesh",
      "  - Option B (4-6 kits): Dual hub with spokes",
      "  - Option C (7-10 kits): Ring + dual hub",
      "  - Option D (10+ kits): Hierarchical hub of hubs",
      "",
      "Navigate to 'BGP Routes' for AS path analysis and convergence tracking.",
    ].join("\n");
  }

  private async analyzeZitiFabric(ctx: AssistantContext): Promise<string> {
    return [
      "=== ZITI ZERO-TRUST FABRIC ===",
      "",
      "Three-Router Design (per kit):",
      "  router-01 (Local):    Enrolled on local controller, serves field devices",
      "  router-02 (Adjacent): Enrolled on local + adjacent kits, kit-to-kit fabric",
      "  router-hq  (HQ):      Enrolled on HQ controller only, HQ fabric",
      "",
      "Design Principle: A failed HQ router shall NOT disrupt local operations.",
      "The three planes are operationally isolated by design.",
      "",
      "Controller Federation:",
      "  - HQ controller federates with local controllers",
      "  - Identity synchronization across trust boundaries",
      "  - Certificate-based identity (no passwords, no shared secrets)",
      "",
      `Active Kits: ${ctx.kits.filter(k => k.status === "ONLINE").length}/${ctx.kits.length}`,
      `Expected Routers: ${ctx.kits.length * 3} (3 per kit)`,
      "",
      "Navigate to 'Ziti Fabric' for three-plane isolation analysis.",
    ].join("\n");
  }

  private async analyzeReadiness(ctx: AssistantContext): Promise<string> {
    return [
      "=== KIT DEPLOYMENT READINESS ===",
      "",
      "Pre-deployment validation checks (6 groups):",
      "  1. PKI Material  - Root CA, intermediate CA, kit certs staged in files/pki/",
      "  2. SSH Keys       - Per-VM deploy + backup keypairs in files/ssh_keys/",
      "  3. Addressing     - LAN/WG/BGP formula compliance verified",
      "  4. Vault Secrets  - ansible-vault encrypted, no placeholder values",
      "  5. Ansible Reqs   - Galaxy collections installed",
      "  6. FIPS Compliance - FIPS 140-3 mode, approved ciphers, TLS 1.2+",
      "",
      `Kits in inventory: ${ctx.kits.length}`,
      "",
      "Deployment workflow:",
      "  1. ./scripts/new-kit.sh <name> <mission> <kit> <ip> <vmid>",
      "  2. ./scripts/generate-keys.sh <name>",
      "  3. Stage PKI material",
      "  4. Fill vault secrets",
      "  5. ./scripts/validate-kit.sh <name>",
      "  6. ansible-playbook site.yml -l <host> --ask-vault-pass",
      "",
      "Navigate to 'Kit Readiness' for per-kit validation results.",
    ].join("\n");
  }

  private async analyzeThreatIntel(ctx: AssistantContext): Promise<string> {
    return [
      "=== THREAT INTELLIGENCE CORRELATOR ===",
      "",
      "Monitored threat categories:",
      "  - SSH brute force (fail2ban pattern analysis)",
      "  - Ziti policy violations (unauthorized service access)",
      "  - Anomalous traffic (unexpected endpoints/protocols/ports)",
      "  - Certificate anomalies (unexpected issuers, expired certs)",
      "",
      "AutoNet security hardening in place:",
      "  - FIPS 140-3 enforced on all AlmaLinux 9 VMs",
      "  - SELinux in enforcing mode",
      "  - SSH key-only auth with source IP restrictions",
      "  - fail2ban on SSH + Ziti controller port 1280",
      "  - auditd with centralized log forwarding",
      "  - WireGuard is only internet-exposed port",
      "",
      `Mesh state: ${ctx.meshState}`,
      ctx.meshState === "FULL_ISOLATION" ?
        "  WARNING: Full isolation - cannot verify remote kit security state" :
        `  ${ctx.kits.filter(k => k.status === "ONLINE").length} kits reachable for security assessment`,
      "",
      "Navigate to 'Threat Intel' for IOC correlation and threat timeline.",
    ].join("\n");
  }

  private async analyzeTransportFailover(ctx: AssistantContext): Promise<string> {
    return [
      "=== TRANSPORT FAILOVER PREDICTOR ===",
      "",
      "AutoNet transport types (transport-agnostic):",
      "  1. Dejero    - Bonded cellular/satellite",
      "  2. Starlink  - LEO satellite broadband",
      "  3. LTE/5G    - Cellular data",
      "  4. RF/PacStar - Military radio frequency",
      "  5. Wired     - Ethernet/fiber physical link",
      "",
      "Failover behavior:",
      "  - WireGuard runs over ANY transport",
      "  - BGP cost-based failover: preferred path (cost 5) → fallback (cost 10)",
      "  - Automatic reroute with no operator intervention",
      "  - Signal quality trending predicts degradation",
      "",
      `Active kits: ${ctx.kits.filter(k => k.status === "ONLINE").length}`,
      "",
      "Navigate to 'Transport Failover' for signal trends and diversity scoring.",
    ].join("\n");
  }

  private async analyzeOperationalState(ctx: AssistantContext): Promise<string> {
    const stateMap: Record<string, { desc: string; capabilities: string }> = {
      FULL: { desc: "All nodes reachable", capabilities: "Full mesh, full C2, full synchronization" },
      PARTIAL_WAN_LOSS: { desc: "Intermittent HQ link", capabilities: "Missions autonomous, sync on reconnect" },
      HQ_CONTROLLER_LOSS: { desc: "HQ unreachable", capabilities: "Local island controllers sustain all local fabric" },
      KIT_TO_KIT_LOSS: { desc: "Adjacent tunnel down", capabilities: "HQ fallback (cost 10) activates automatically" },
      FULL_ISOLATION: { desc: "No external comms", capabilities: "Kit operates as standalone network island" },
    };
    const current = stateMap[ctx.meshState] || { desc: "Unknown", capabilities: "Unknown" };
    return [
      "=== OPERATIONAL STATE CLASSIFIER ===",
      "",
      `Current State: ${ctx.meshState}`,
      `Description: ${current.desc}`,
      `Capabilities: ${current.capabilities}`,
      "",
      "All 5 AutoNet Operational States:",
      ...Object.entries(stateMap).map(([state, info]) =>
        `  ${state === ctx.meshState ? ">>>" : "   "} ${state}: ${info.desc}`
      ),
      "",
      "Design principle: Each state is fully self-sustaining.",
      "Degradation is graceful - no cliff edge failures.",
      "",
      "Navigate to 'Operational State' for state history and transition predictions.",
    ].join("\n");
  }

  private async analyzePriorityQueue(ctx: AssistantContext): Promise<string> {
    return [
      "=== MISSION PRIORITY QUEUE ===",
      "",
      "Military priority system (descending):",
      "  FLASH      - Highest urgency, preempts all traffic",
      "  IMMEDIATE  - Time-critical operational data",
      "  PRIORITY   - Important but not time-critical",
      "  ROUTINE    - Standard operational traffic",
      "",
      "QoS bandwidth allocation:",
      "  FLASH: 30% reserved | IMMEDIATE: 30% | PRIORITY: 25% | ROUTINE: 15%",
      "",
      "FLASH traffic preempts all other priority levels.",
      "Starvation detection monitors ROUTINE traffic health.",
      "",
      `Pending sync: ${ctx.syncStats.pending} | Synced: ${ctx.syncStats.synced} | Failed: ${ctx.syncStats.failed}`,
      "",
      "Navigate to 'Priority Queue' for queue depth and latency estimates.",
    ].join("\n");
  }

  private async analyzePKI(ctx: AssistantContext): Promise<string> {
    return [
      "=== PKI CHAIN VALIDATOR ===",
      "",
      "AutoNet Hybrid Delegated PKI Model:",
      "  HQ Root CA (offline key - never distributed)",
      "    +-- HQ Intermediate CA",
      "    +-- m01-k01 Intermediate CA (issued to NC kit at build)",
      "    +-- m01-k02 Intermediate CA (issued to CA kit at build)",
      "    +-- mNN-kNN Intermediate CA (per-kit)",
      "",
      "Trust model:",
      "  - All certs chain to same HQ root",
      "  - Any identity enrolled on one kit is trusted on any other",
      "  - NO runtime HQ dependency for trust validation",
      "  - Local controllers have offline capability with pre-staged CA bundles",
      "",
      `Kits in inventory: ${ctx.kits.length}`,
      `Expected cert chains: ${ctx.kits.length} (one intermediate CA per kit)`,
      "",
      "Navigate to 'PKI Validator' for chain verification and expiry alerts.",
    ].join("\n");
  }

  private async analyzeRunbooks(ctx: AssistantContext): Promise<string> {
    return [
      "=== ANSIBLE RUNBOOK INTELLIGENCE ===",
      "",
      "AutoNet Playbook Catalog:",
      "  site.yml             - Full fresh deployment (12 steps)",
      "  update.yml           - Idempotent reapply of changed values",
      "  modify.yml           - Structural changes (add kits, routers)",
      "  destroy.yml          - Tear down VMs, preserve identity",
      "  revoke-kit.yml       - Security response for compromised kit",
      "  peer-exchange.yml    - WireGuard key rotation",
      "  emergency-rebuild.yml - Single VM rebuild",
      "",
      "Tag system: 50+ granular tags for targeted reapply",
      "  Example: ansible-playbook update.yml -l nc-pve-01 --tags wireguard",
      "",
      "Role dependency chain:",
      "  autonet -> proxmox_bridges -> proxmox_vms -> almalinux_base",
      "  -> security_hardening -> ziti_controller -> ziti_router",
      "  -> edge_gateway -> monitoring",
      "",
      "Navigate to 'Runbook Intel' for impact analysis and execution planning.",
    ].join("\n");
  }
}
