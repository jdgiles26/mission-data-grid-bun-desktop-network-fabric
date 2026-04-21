// Threat Intelligence Correlator
// Correlates multiple threat indicators across the AutoNet mesh for composite
// threat scoring, pattern detection, and IOC management

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export type ThreatSeverity = "critical" | "high" | "medium" | "low" | "info";
export type ThreatCategory =
  | "ssh-brute-force"
  | "ziti-policy-violation"
  | "anomalous-traffic"
  | "cert-anomaly"
  | "config-tampering"
  | "lateral-movement"
  | "data-exfiltration"
  | "denial-of-service";

export interface ThreatEvent {
  id: string;
  timestamp: Date;
  kitId: string;
  category: ThreatCategory;
  severity: ThreatSeverity;
  sourceIp: string | null;
  targetIp: string | null;
  description: string;
  indicators: string[];
  correlated: boolean;
  correlationGroupId: string | null;
}

export interface KitThreatScore {
  kitId: string;
  kitName: string;
  threatScore: number; // 0-100 (0=no threats, 100=critical)
  riskLevel: "minimal" | "low" | "moderate" | "elevated" | "critical";
  activeThreatCount: number;
  topCategory: ThreatCategory | null;
  recentEvents: ThreatEvent[];
  breakdown: {
    sshBruteForce: number;
    policyViolations: number;
    anomalousTraffic: number;
    certAnomalies: number;
  };
}

export interface ThreatTimelineEntry {
  timestamp: Date;
  kitId: string;
  event: ThreatEvent;
  relatedEvents: string[]; // IDs of correlated events
}

export interface SSHPattern {
  kitId: string;
  sourceIp: string;
  attempts: number;
  firstSeen: Date;
  lastSeen: Date;
  usernames: string[];
  blocked: boolean;
  pattern: "brute-force" | "credential-stuffing" | "targeted" | "scanning";
}

export interface IOCRecord {
  id: string;
  type: "ip" | "domain" | "hash" | "certificate" | "username";
  value: string;
  severity: ThreatSeverity;
  firstSeen: Date;
  lastSeen: Date;
  sightings: number;
  affectedKits: string[];
  description: string;
  active: boolean;
}

export interface CorrelationResult {
  groupId: string;
  events: ThreatEvent[];
  category: string;
  narrative: string;
  severity: ThreatSeverity;
  affectedKits: string[];
  recommendedActions: string[];
}

export interface ThreatOverview {
  assessmentTime: Date;
  totalThreats: number;
  criticalThreats: number;
  highThreats: number;
  mediumThreats: number;
  lowThreats: number;
  activeIOCs: number;
  kitsAtRisk: number;
  totalKits: number;
  overallRiskLevel: "minimal" | "low" | "moderate" | "elevated" | "critical";
  topThreats: ThreatEvent[];
  recentCorrelations: CorrelationResult[];
}

export class ThreatIntelCorrelator {
  private rootPath: string;
  private eventCache: ThreatEvent[] = [];
  private iocCache: IOCRecord[] = [];

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.initializeSimulatedData();
  }

  async getThreatOverview(): Promise<ThreatOverview> {
    const kits = this.loadKitVars();
    const events = this.eventCache;
    const correlations = this.performCorrelation(events);

    const criticalThreats = events.filter((e) => e.severity === "critical").length;
    const highThreats = events.filter((e) => e.severity === "high").length;
    const mediumThreats = events.filter((e) => e.severity === "medium").length;
    const lowThreats = events.filter((e) => e.severity === "low").length;

    const kitScores = await Promise.all(kits.map((k) => this.getKitThreatScore(k.kitIdentifier)));
    const kitsAtRisk = kitScores.filter((s) => s.threatScore > 30).length;

    let overallRiskLevel: ThreatOverview["overallRiskLevel"] = "minimal";
    if (criticalThreats > 0) overallRiskLevel = "critical";
    else if (highThreats > 2) overallRiskLevel = "elevated";
    else if (highThreats > 0 || mediumThreats > 5) overallRiskLevel = "moderate";
    else if (mediumThreats > 0) overallRiskLevel = "low";

    const topThreats = [...events]
      .sort((a, b) => this.severityWeight(b.severity) - this.severityWeight(a.severity))
      .slice(0, 10);

    return {
      assessmentTime: new Date(),
      totalThreats: events.length,
      criticalThreats,
      highThreats,
      mediumThreats,
      lowThreats,
      activeIOCs: this.iocCache.filter((i) => i.active).length,
      kitsAtRisk,
      totalKits: kits.length,
      overallRiskLevel,
      topThreats,
      recentCorrelations: correlations.slice(0, 5),
    };
  }

  async getKitThreatScore(kitId: string): Promise<KitThreatScore> {
    const kits = this.loadKitVars();
    const kit = kits.find((k) => k.kitIdentifier === kitId);
    const kitName = kit?.kitName || kitId;

    const kitEvents = this.eventCache.filter((e) => e.kitId === kitId);

    // Calculate threat score from event severity weights
    let rawScore = 0;
    for (const event of kitEvents) {
      rawScore += this.severityWeight(event.severity);
    }
    // Normalize to 0-100 scale (cap at 100)
    const threatScore = Math.min(100, rawScore);

    let riskLevel: KitThreatScore["riskLevel"] = "minimal";
    if (threatScore >= 80) riskLevel = "critical";
    else if (threatScore >= 60) riskLevel = "elevated";
    else if (threatScore >= 40) riskLevel = "moderate";
    else if (threatScore >= 20) riskLevel = "low";

    // Category breakdown
    const sshBruteForce = kitEvents.filter((e) => e.category === "ssh-brute-force").length;
    const policyViolations = kitEvents.filter((e) => e.category === "ziti-policy-violation").length;
    const anomalousTraffic = kitEvents.filter((e) => e.category === "anomalous-traffic").length;
    const certAnomalies = kitEvents.filter((e) => e.category === "cert-anomaly").length;

    // Top category
    const categoryCounts = new Map<ThreatCategory, number>();
    for (const event of kitEvents) {
      categoryCounts.set(event.category, (categoryCounts.get(event.category) || 0) + 1);
    }
    let topCategory: ThreatCategory | null = null;
    let maxCount = 0;
    for (const [cat, count] of categoryCounts) {
      if (count > maxCount) {
        topCategory = cat;
        maxCount = count;
      }
    }

    return {
      kitId,
      kitName,
      threatScore,
      riskLevel,
      activeThreatCount: kitEvents.length,
      topCategory,
      recentEvents: kitEvents.slice(-5),
      breakdown: {
        sshBruteForce,
        policyViolations,
        anomalousTraffic,
        certAnomalies,
      },
    };
  }

  async getThreatTimeline(hoursBack: number): Promise<ThreatTimelineEntry[]> {
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const events = this.eventCache.filter((e) => e.timestamp >= cutoff);
    const correlations = this.performCorrelation(events);

    // Build a map of event ID -> correlation group IDs
    const eventCorrelations = new Map<string, string[]>();
    for (const corr of correlations) {
      for (const event of corr.events) {
        const existing = eventCorrelations.get(event.id) || [];
        const relatedIds = corr.events.filter((e) => e.id !== event.id).map((e) => e.id);
        eventCorrelations.set(event.id, [...existing, ...relatedIds]);
      }
    }

    return events
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .map((event) => ({
        timestamp: event.timestamp,
        kitId: event.kitId,
        event,
        relatedEvents: eventCorrelations.get(event.id) || [],
      }));
  }

  async analyzeSSHPatterns(): Promise<SSHPattern[]> {
    const kits = this.loadKitVars();
    const patterns: SSHPattern[] = [];

    for (const kit of kits) {
      const hash = this.hashString(kit.kitIdentifier + "-ssh");

      // Simulate SSH brute-force patterns
      const attackerCount = Math.abs(hash % 4); // 0-3 attackers per kit
      for (let i = 0; i < attackerCount; i++) {
        const attackHash = this.hashString(`${kit.kitIdentifier}-attacker-${i}`);
        const octets = [
          Math.abs(attackHash % 200) + 1,
          Math.abs((attackHash >> 8) % 255),
          Math.abs((attackHash >> 16) % 255),
          Math.abs((attackHash >> 24) % 254) + 1,
        ];
        const sourceIp = octets.join(".");
        const attempts = 10 + Math.abs(attackHash % 500);
        const hoursAgo = Math.abs(attackHash % 72);

        let pattern: SSHPattern["pattern"] = "scanning";
        if (attempts > 300) pattern = "brute-force";
        else if (attempts > 100) pattern = "credential-stuffing";
        else if (attempts > 50) pattern = "targeted";

        const usernames: string[] = [];
        const usernamePool = [
          "root",
          "admin",
          "ubuntu",
          "centos",
          "deploy",
          "ansible",
          "user",
          "test",
          "oracle",
          "postgres",
        ];
        const usernameCount = 1 + Math.abs(attackHash % 5);
        for (let u = 0; u < usernameCount; u++) {
          usernames.push(usernamePool[(Math.abs(attackHash) + u) % usernamePool.length]!);
        }

        patterns.push({
          kitId: kit.kitIdentifier,
          sourceIp,
          attempts,
          firstSeen: new Date(Date.now() - hoursAgo * 60 * 60 * 1000),
          lastSeen: new Date(Date.now() - Math.abs(attackHash % 60) * 60 * 1000),
          usernames: [...new Set(usernames)],
          blocked: attempts > 50, // fail2ban would block after threshold
          pattern,
        });
      }
    }

    return patterns.sort((a, b) => b.attempts - a.attempts);
  }

  async getIOCSummary(): Promise<{
    total: number;
    active: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    iocs: IOCRecord[];
  }> {
    const active = this.iocCache.filter((i) => i.active).length;

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const ioc of this.iocCache) {
      byType[ioc.type] = (byType[ioc.type] || 0) + 1;
      bySeverity[ioc.severity] = (bySeverity[ioc.severity] || 0) + 1;
    }

    return {
      total: this.iocCache.length,
      active,
      byType,
      bySeverity,
      iocs: this.iocCache,
    };
  }

  async correlateEvents(): Promise<CorrelationResult[]> {
    return this.performCorrelation(this.eventCache);
  }

  // --- Private helpers ---

  private performCorrelation(events: ThreatEvent[]): CorrelationResult[] {
    const correlations: CorrelationResult[] = [];

    // Correlation 1: SSH brute-force from same source across multiple kits
    const sshBySource = new Map<string, ThreatEvent[]>();
    for (const event of events) {
      if (event.category === "ssh-brute-force" && event.sourceIp) {
        const existing = sshBySource.get(event.sourceIp) || [];
        existing.push(event);
        sshBySource.set(event.sourceIp, existing);
      }
    }

    for (const [sourceIp, sshEvents] of sshBySource) {
      const affectedKits = [...new Set(sshEvents.map((e) => e.kitId))];
      if (affectedKits.length > 1) {
        const groupId = `corr-ssh-${this.hashString(sourceIp)}`;
        correlations.push({
          groupId,
          events: sshEvents,
          category: "Coordinated SSH Brute Force",
          narrative: `Source ${sourceIp} is targeting ${affectedKits.length} kits simultaneously, suggesting a coordinated attack or botnet activity`,
          severity: affectedKits.length > 3 ? "critical" : "high",
          affectedKits,
          recommendedActions: [
            `Block ${sourceIp} at the edge gateway on all kits`,
            "Review fail2ban configuration for aggressive banning",
            "Verify SSH key-only authentication is enforced",
            "Check if source IP belongs to a known threat feed",
          ],
        });
      }
    }

    // Correlation 2: Certificate anomalies + policy violations (potential compromise)
    const certEvents = events.filter((e) => e.category === "cert-anomaly");
    const policyEvents = events.filter((e) => e.category === "ziti-policy-violation");

    for (const certEvent of certEvents) {
      const matchingPolicy = policyEvents.find(
        (p) => p.kitId === certEvent.kitId && Math.abs(p.timestamp.getTime() - certEvent.timestamp.getTime()) < 3600000,
      );
      if (matchingPolicy) {
        correlations.push({
          groupId: `corr-compromise-${certEvent.kitId}`,
          events: [certEvent, matchingPolicy],
          category: "Potential Kit Compromise",
          narrative: `Kit ${certEvent.kitId} shows certificate anomaly coinciding with policy violation — possible identity theft or compromise`,
          severity: "critical",
          affectedKits: [certEvent.kitId],
          recommendedActions: [
            `Immediately isolate ${certEvent.kitId} from the mesh`,
            "Revoke and reissue all Ziti identities for this kit",
            "Rotate WireGuard keys via peer-exchange.yml",
            "Review audit logs on the Ziti controller",
            "Check for unauthorized config changes in host_vars",
          ],
        });
      }
    }

    // Correlation 3: Anomalous traffic patterns suggesting lateral movement
    const anomalousEvents = events.filter((e) => e.category === "anomalous-traffic");
    const kitAnomalyGroups = new Map<string, ThreatEvent[]>();
    for (const event of anomalousEvents) {
      const existing = kitAnomalyGroups.get(event.kitId) || [];
      existing.push(event);
      kitAnomalyGroups.set(event.kitId, existing);
    }

    for (const [kitId, kitEvents] of kitAnomalyGroups) {
      if (kitEvents.length >= 3) {
        correlations.push({
          groupId: `corr-lateral-${kitId}`,
          events: kitEvents,
          category: "Potential Lateral Movement",
          narrative: `Kit ${kitId} has ${kitEvents.length} anomalous traffic events — pattern consistent with internal reconnaissance or lateral movement`,
          severity: "high",
          affectedKits: [kitId],
          recommendedActions: [
            `Review Ziti service policies for ${kitId}`,
            "Enable enhanced logging on all three routers",
            "Verify no unauthorized services are bound",
            "Check WireGuard peer list for unexpected endpoints",
          ],
        });
      }
    }

    return correlations.sort(
      (a, b) => this.severityWeight(b.severity) - this.severityWeight(a.severity),
    );
  }

  private initializeSimulatedData(): void {
    const kits = this.loadKitVars();
    if (kits.length === 0) {
      // Generate minimal simulated data even without inventory
      this.generateFallbackData();
      return;
    }

    const now = Date.now();
    this.eventCache = [];
    this.iocCache = [];

    for (const kit of kits) {
      const hash = this.hashString(kit.kitIdentifier);

      // Generate SSH brute force events
      const sshEventCount = Math.abs(hash % 5);
      for (let i = 0; i < sshEventCount; i++) {
        const eHash = this.hashString(`${kit.kitIdentifier}-ssh-${i}`);
        const hoursAgo = Math.abs(eHash % 48);
        const octets = [
          Math.abs(eHash % 200) + 1,
          Math.abs((eHash >> 8) % 255),
          Math.abs((eHash >> 16) % 255),
          Math.abs((eHash >> 24) % 254) + 1,
        ];
        const srcIp = octets.join(".");

        this.eventCache.push({
          id: `evt-ssh-${kit.kitIdentifier}-${i}`,
          timestamp: new Date(now - hoursAgo * 3600000),
          kitId: kit.kitIdentifier,
          category: "ssh-brute-force",
          severity: Math.abs(eHash % 3) === 0 ? "high" : "medium",
          sourceIp: srcIp,
          targetIp: `10.${kit.missionId}.${kit.kitId}.1`,
          description: `SSH brute-force attempt from ${srcIp} (${50 + Math.abs(eHash % 400)} attempts)`,
          indicators: [srcIp, "fail2ban-trigger", "multiple-usernames"],
          correlated: false,
          correlationGroupId: null,
        });

        // Add IOC for the source IP
        if (!this.iocCache.find((ioc) => ioc.value === srcIp)) {
          this.iocCache.push({
            id: `ioc-${srcIp.replace(/\./g, "-")}`,
            type: "ip",
            value: srcIp,
            severity: "medium",
            firstSeen: new Date(now - hoursAgo * 3600000),
            lastSeen: new Date(now - Math.abs(eHash % 3600) * 1000),
            sightings: 1 + Math.abs(eHash % 20),
            affectedKits: [kit.kitIdentifier],
            description: `SSH brute-force source IP`,
            active: true,
          });
        }
      }

      // Generate Ziti policy violation events
      const policyEventCount = Math.abs((hash >> 4) % 3);
      for (let i = 0; i < policyEventCount; i++) {
        const eHash = this.hashString(`${kit.kitIdentifier}-policy-${i}`);
        const hoursAgo = Math.abs(eHash % 24);

        this.eventCache.push({
          id: `evt-policy-${kit.kitIdentifier}-${i}`,
          timestamp: new Date(now - hoursAgo * 3600000),
          kitId: kit.kitIdentifier,
          category: "ziti-policy-violation",
          severity: Math.abs(eHash % 4) === 0 ? "high" : "medium",
          sourceIp: `10.${kit.missionId}.${kit.kitId}.${30 + Math.abs(eHash % 20)}`,
          targetIp: null,
          description: `Ziti identity attempted to access unauthorized service`,
          indicators: ["unauthorized-dial", "policy-deny", `service-${Math.abs(eHash % 10)}`],
          correlated: false,
          correlationGroupId: null,
        });
      }

      // Generate anomalous traffic events
      const anomalyCount = Math.abs((hash >> 8) % 4);
      for (let i = 0; i < anomalyCount; i++) {
        const eHash = this.hashString(`${kit.kitIdentifier}-anomaly-${i}`);
        const hoursAgo = Math.abs(eHash % 36);
        const protocols = ["TCP", "UDP", "ICMP"];
        const protocol = protocols[Math.abs(eHash) % protocols.length]!;
        const port = 1024 + Math.abs(eHash % 64000);

        this.eventCache.push({
          id: `evt-anomaly-${kit.kitIdentifier}-${i}`,
          timestamp: new Date(now - hoursAgo * 3600000),
          kitId: kit.kitIdentifier,
          category: "anomalous-traffic",
          severity: Math.abs(eHash % 5) === 0 ? "high" : "low",
          sourceIp: `10.${kit.missionId}.${kit.kitId}.${10 + Math.abs(eHash % 40)}`,
          targetIp: `10.${kit.missionId}.${Math.abs(eHash % 10) + 1}.${Math.abs(eHash % 254) + 1}`,
          description: `Unexpected ${protocol} traffic on port ${port}`,
          indicators: [`unexpected-port-${port}`, `protocol-${protocol.toLowerCase()}`, "baseline-deviation"],
          correlated: false,
          correlationGroupId: null,
        });
      }

      // Generate certificate anomaly events
      const certEventCount = Math.abs((hash >> 12) % 2);
      for (let i = 0; i < certEventCount; i++) {
        const eHash = this.hashString(`${kit.kitIdentifier}-cert-${i}`);
        const hoursAgo = Math.abs(eHash % 72);
        const anomalyTypes = [
          "Certificate from unexpected issuer detected",
          "Expired certificate presented during TLS handshake",
          "Certificate CN does not match expected hostname",
          "Self-signed certificate detected in Ziti enrollment",
        ];

        this.eventCache.push({
          id: `evt-cert-${kit.kitIdentifier}-${i}`,
          timestamp: new Date(now - hoursAgo * 3600000),
          kitId: kit.kitIdentifier,
          category: "cert-anomaly",
          severity: Math.abs(eHash % 3) === 0 ? "critical" : "medium",
          sourceIp: null,
          targetIp: `10.${kit.missionId}.${kit.kitId}.20`,
          description: anomalyTypes[Math.abs(eHash) % anomalyTypes.length]!,
          indicators: ["cert-mismatch", "pki-chain-break"],
          correlated: false,
          correlationGroupId: null,
        });
      }
    }

    // Add some global IOCs
    this.iocCache.push(
      {
        id: "ioc-known-scanner-1",
        type: "ip",
        value: "185.220.101.42",
        severity: "high",
        firstSeen: new Date(now - 7 * 86400000),
        lastSeen: new Date(now - 3600000),
        sightings: 47,
        affectedKits: kits.slice(0, 3).map((k) => k.kitIdentifier),
        description: "Known Tor exit node used for SSH scanning",
        active: true,
      },
      {
        id: "ioc-known-scanner-2",
        type: "ip",
        value: "91.240.118.172",
        severity: "medium",
        firstSeen: new Date(now - 14 * 86400000),
        lastSeen: new Date(now - 86400000),
        sightings: 12,
        affectedKits: kits.slice(0, 2).map((k) => k.kitIdentifier),
        description: "Shodan-attributed scanner IP",
        active: true,
      },
      {
        id: "ioc-suspicious-user",
        type: "username",
        value: "deploy_backup",
        severity: "medium",
        firstSeen: new Date(now - 2 * 86400000),
        lastSeen: new Date(now - 7200000),
        sightings: 5,
        affectedKits: kits.length > 0 ? [kits[0]!.kitIdentifier] : [],
        description: "Non-standard username observed in SSH auth logs",
        active: true,
      },
    );

    // Sort events by timestamp descending
    this.eventCache.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private generateFallbackData(): void {
    // Minimal simulated data when no inventory exists
    const now = Date.now();
    const fallbackKits = ["m01-k01", "m01-k02", "m01-k03"];

    this.eventCache = fallbackKits.map((kitId, i) => ({
      id: `evt-fallback-${i}`,
      timestamp: new Date(now - i * 3600000),
      kitId,
      category: "ssh-brute-force" as ThreatCategory,
      severity: "medium" as ThreatSeverity,
      sourceIp: `192.168.${i}.100`,
      targetIp: null,
      description: "Simulated SSH brute-force event (no inventory loaded)",
      indicators: ["simulated"],
      correlated: false,
      correlationGroupId: null,
    }));

    this.iocCache = [
      {
        id: "ioc-fallback-1",
        type: "ip" as const,
        value: "192.168.0.100",
        severity: "medium" as ThreatSeverity,
        firstSeen: new Date(now - 86400000),
        lastSeen: new Date(),
        sightings: 3,
        affectedKits: fallbackKits,
        description: "Simulated IOC (no inventory loaded)",
        active: true,
      },
    ];
  }

  private loadKitVars(): Array<{
    kitIdentifier: string;
    kitName: string;
    hostFolder: string;
    missionId: number;
    kitId: number;
    vars: Record<string, unknown>;
  }> {
    const kits: Array<{
      kitIdentifier: string;
      kitName: string;
      hostFolder: string;
      missionId: number;
      kitId: number;
      vars: Record<string, unknown>;
    }> = [];

    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (!existsSync(hostVarsDir)) return kits;

    const hosts = readdirSync(hostVarsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const host of hosts) {
      const varsPath = join(hostVarsDir, host, "vars.yml");
      if (!existsSync(varsPath)) continue;

      let vars: Record<string, unknown> = {};
      try {
        vars = parse(readFileSync(varsPath, "utf8")) as Record<string, unknown>;
      } catch {
        continue;
      }

      const mission = Number(vars["kit_mission"] || 1);
      const kitId = Number(vars["kit_id"] || 1);
      const kitName = String(vars["kit_name"] || host);
      const kitIdentifier = `m${String(mission).padStart(2, "0")}-k${String(kitId).padStart(2, "0")}`;

      kits.push({ kitIdentifier, kitName, hostFolder: host, missionId: mission, kitId, vars });
    }

    return kits;
  }

  private severityWeight(severity: ThreatSeverity): number {
    switch (severity) {
      case "critical":
        return 25;
      case "high":
        return 15;
      case "medium":
        return 8;
      case "low":
        return 3;
      case "info":
        return 1;
    }
  }

  private hashString(s: string): number {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      hash = ((hash << 5) - hash + ch) | 0;
    }
    return hash;
  }
}
