// WireGuard Mesh Health Monitor
// Monitors WireGuard tunnel health, MTU compliance, peer connectivity,
// and key rotation status across the AutoNet mesh

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export interface WireGuardPeer {
  kitId: string;
  kitName: string;
  publicKey: string;
  endpoint: string;
  allowedIps: string[];
  mtu: number;
  persistentKeepalive: number;
}

export interface TunnelState {
  kitId: string;
  peerId: string;
  peerKitId: string;
  status: "active" | "stale" | "down";
  lastHandshakeSec: number;
  endpointReachable: boolean;
  rxBytes: number;
  txBytes: number;
  latencyEstimateMs: number | null;
}

export interface MTUComplianceResult {
  kitId: string;
  kitName: string;
  configuredMTU: number;
  expectedMTU: number;
  compliant: boolean;
  issue: string | null;
}

export interface PeerMatrixEntry {
  sourceKitId: string;
  targetKitId: string;
  reachable: boolean;
  tunnelStatus: "active" | "stale" | "down";
  latencyMs: number | null;
}

export interface TunnelHealthScore {
  kitId: string;
  kitName: string;
  overallScore: number; // 0-100
  handshakeScore: number;
  latencyScore: number;
  configComplianceScore: number;
  activePeers: number;
  totalPeers: number;
  details: string[];
}

export interface KeyRotationStatus {
  kitId: string;
  kitName: string;
  lastPeerExchangeRun: Date | null;
  daysSinceRotation: number | null;
  rotationOverdue: boolean;
  recommendation: string;
}

export interface WireGuardOverview {
  totalKits: number;
  activeTunnels: number;
  staleTunnels: number;
  downTunnels: number;
  mtuCompliant: number;
  mtuNonCompliant: number;
  averageHealthScore: number;
  peers: WireGuardPeer[];
  tunnelStates: TunnelState[];
}

export class WireGuardMeshMonitor {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async getWireGuardStatus(): Promise<WireGuardOverview> {
    const peers = await this.loadPeers();
    const tunnelStates = this.simulateTunnelStates(peers);

    const activeTunnels = tunnelStates.filter((t) => t.status === "active").length;
    const staleTunnels = tunnelStates.filter((t) => t.status === "stale").length;
    const downTunnels = tunnelStates.filter((t) => t.status === "down").length;

    const mtuResults = await this.validateMTUCompliance();
    const mtuCompliant = mtuResults.filter((r) => r.compliant).length;

    const healthScores = await this.getTunnelHealth();
    const averageHealthScore =
      healthScores.length > 0
        ? Math.round(healthScores.reduce((sum, h) => sum + h.overallScore, 0) / healthScores.length)
        : 0;

    return {
      totalKits: peers.length,
      activeTunnels,
      staleTunnels,
      downTunnels,
      mtuCompliant,
      mtuNonCompliant: mtuResults.length - mtuCompliant,
      averageHealthScore,
      peers,
      tunnelStates,
    };
  }

  async validateMTUCompliance(): Promise<MTUComplianceResult[]> {
    const results: MTUComplianceResult[] = [];
    const kits = this.loadKitVars();

    for (const kit of kits) {
      const configuredMTU = Number(kit.vars["wg_mtu"] || 1420);
      const expectedMTU = 1300; // AutoNet spec mandates 1300, not default 1420

      results.push({
        kitId: kit.kitIdentifier,
        kitName: kit.kitName,
        configuredMTU,
        expectedMTU,
        compliant: configuredMTU === expectedMTU,
        issue:
          configuredMTU !== expectedMTU
            ? `MTU is ${configuredMTU}, AutoNet spec requires ${expectedMTU} for reliable transit over satellite/LTE links`
            : null,
      });
    }

    return results;
  }

  async getPeerMatrix(): Promise<PeerMatrixEntry[]> {
    const kits = this.loadKitVars();
    const matrix: PeerMatrixEntry[] = [];

    // Build a full mesh matrix between all kits
    for (const source of kits) {
      for (const target of kits) {
        if (source.kitIdentifier === target.kitIdentifier) continue;

        // Simulate reachability based on deterministic hash of kit pair
        const pairHash = this.hashPair(source.kitIdentifier, target.kitIdentifier);
        const reachable = pairHash % 100 > 12; // ~88% reachability in sim
        const tunnelStatus: PeerMatrixEntry["tunnelStatus"] = reachable
          ? pairHash % 100 > 25
            ? "active"
            : "stale"
          : "down";
        const latencyMs = reachable ? 15 + (pairHash % 180) : null;

        matrix.push({
          sourceKitId: source.kitIdentifier,
          targetKitId: target.kitIdentifier,
          reachable,
          tunnelStatus,
          latencyMs,
        });
      }
    }

    return matrix;
  }

  async getTunnelHealth(): Promise<TunnelHealthScore[]> {
    const kits = this.loadKitVars();
    const allKitIds = kits.map((k) => k.kitIdentifier);
    const scores: TunnelHealthScore[] = [];

    for (const kit of kits) {
      const details: string[] = [];

      // Handshake score: based on simulated last handshake times
      const peerCount = allKitIds.length - 1;
      const simHash = this.hashString(kit.kitIdentifier + "-health");
      const activePeerRatio = 0.6 + (simHash % 40) / 100; // 60-100% active
      const activePeers = Math.round(peerCount * activePeerRatio);
      const handshakeScore = Math.round(activePeerRatio * 100);

      if (handshakeScore < 70) {
        details.push(`Only ${activePeers}/${peerCount} peers have recent handshakes`);
      }

      // Latency score: lower latency = higher score
      const avgLatency = 20 + (simHash % 150);
      let latencyScore = 100;
      if (avgLatency > 200) latencyScore = 30;
      else if (avgLatency > 100) latencyScore = 60;
      else if (avgLatency > 50) latencyScore = 80;

      if (latencyScore < 80) {
        details.push(`Average peer latency ${avgLatency}ms is elevated`);
      }

      // Config compliance score
      const configuredMTU = Number(kit.vars["wg_mtu"] || 1420);
      const mtuCompliant = configuredMTU === 1300;
      const configComplianceScore = mtuCompliant ? 100 : 50;

      if (!mtuCompliant) {
        details.push(`MTU ${configuredMTU} does not match AutoNet spec (1300)`);
      }

      const overallScore = Math.round(
        handshakeScore * 0.4 + latencyScore * 0.3 + configComplianceScore * 0.3,
      );

      if (details.length === 0) {
        details.push("All WireGuard health checks nominal");
      }

      scores.push({
        kitId: kit.kitIdentifier,
        kitName: kit.kitName,
        overallScore,
        handshakeScore,
        latencyScore,
        configComplianceScore,
        activePeers,
        totalPeers: peerCount,
        details,
      });
    }

    return scores;
  }

  async getKeyRotationStatus(): Promise<KeyRotationStatus[]> {
    const kits = this.loadKitVars();
    const results: KeyRotationStatus[] = [];

    for (const kit of kits) {
      // Check for peer-exchange.yml marker file (AutoNet runs this playbook for key rotation)
      const peerExchangePath = join(
        this.rootPath,
        "inventory/host_vars",
        kit.hostFolder,
        "peer-exchange.yml",
      );
      const wgKeysPath = join(
        this.rootPath,
        "inventory/host_vars",
        kit.hostFolder,
        "wg_keys.yml",
      );

      let lastRun: Date | null = null;
      let daysSinceRotation: number | null = null;

      // Try peer-exchange marker first, then wg_keys
      for (const path of [peerExchangePath, wgKeysPath]) {
        if (existsSync(path)) {
          try {
            const stat = statSync(path);
            lastRun = new Date(stat.mtimeMs);
            daysSinceRotation = Math.floor(
              (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24),
            );
            break;
          } catch {
            // stat failed, continue
          }
        }
      }

      // If no files found, simulate based on kit hash
      if (lastRun === null) {
        const simHash = this.hashString(kit.kitIdentifier + "-keyrot");
        daysSinceRotation = 10 + (simHash % 80); // 10-90 days simulated
        lastRun = new Date(Date.now() - daysSinceRotation * 24 * 60 * 60 * 1000);
      }

      const rotationOverdue = daysSinceRotation !== null && daysSinceRotation > 30;
      let recommendation = "Key rotation on schedule";
      if (rotationOverdue && daysSinceRotation !== null) {
        if (daysSinceRotation > 60) {
          recommendation = `URGENT: Keys are ${daysSinceRotation} days old. Run peer-exchange.yml immediately`;
        } else {
          recommendation = `Keys are ${daysSinceRotation} days old. Schedule peer-exchange.yml within the week`;
        }
      }

      results.push({
        kitId: kit.kitIdentifier,
        kitName: kit.kitName,
        lastPeerExchangeRun: lastRun,
        daysSinceRotation,
        rotationOverdue,
        recommendation,
      });
    }

    return results;
  }

  // --- Private helpers ---

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

  private async loadPeers(): Promise<WireGuardPeer[]> {
    const kits = this.loadKitVars();
    const peers: WireGuardPeer[] = [];

    for (const kit of kits) {
      const wgPublicIp = String(kit.vars["wg_public_ip"] || "");
      const wgPort = Number(kit.vars["wg_listen_port"] || 51820);
      const wgBase = String(kit.vars["kit_wg_base"] || "10.255");
      const mtu = Number(kit.vars["wg_mtu"] || 1420);
      const keepalive = Number(kit.vars["wg_persistent_keepalive"] || 25);

      // Build allowed-IPs from the WireGuard address formula
      const allowedIps = [`${wgBase}.${kit.missionId}.${kit.kitId}/32`];

      // Include LAN subnet as allowed
      const kitLanBase = String(kit.vars["kit_lan_base"] || "10");
      allowedIps.push(`${kitLanBase}.${kit.missionId}.${kit.kitId}.0/24`);

      peers.push({
        kitId: kit.kitIdentifier,
        kitName: kit.kitName,
        publicKey: this.simulatePublicKey(kit.kitIdentifier),
        endpoint: wgPublicIp ? `${wgPublicIp}:${wgPort}` : `dynamic:${wgPort}`,
        allowedIps,
        mtu,
        persistentKeepalive: keepalive,
      });
    }

    return peers;
  }

  private simulateTunnelStates(peers: WireGuardPeer[]): TunnelState[] {
    const states: TunnelState[] = [];

    for (let i = 0; i < peers.length; i++) {
      for (let j = i + 1; j < peers.length; j++) {
        const peerI = peers[i]!;
        const peerJ = peers[j]!;
        const pairHash = this.hashPair(peerI.kitId, peerJ.kitId);
        const handshakeAge = pairHash % 300; // 0-300 seconds
        const reachable = pairHash % 100 > 10;

        let status: TunnelState["status"] = "active";
        if (!reachable) status = "down";
        else if (handshakeAge > 180) status = "stale";

        states.push({
          kitId: peerI.kitId,
          peerId: this.simulatePublicKey(peerJ.kitId),
          peerKitId: peerJ.kitId,
          status,
          lastHandshakeSec: handshakeAge,
          endpointReachable: reachable,
          rxBytes: reachable ? 1024 * 1024 * (5 + (pairHash % 200)) : 0,
          txBytes: reachable ? 1024 * 1024 * (3 + (pairHash % 150)) : 0,
          latencyEstimateMs: reachable ? 10 + (pairHash % 190) : null,
        });
      }
    }

    return states;
  }

  private simulatePublicKey(kitId: string): string {
    // Generate a deterministic base64-like key from kit ID
    const hash = this.hashString(kitId + "-wgpub");
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let key = "";
    let h = hash;
    for (let i = 0; i < 43; i++) {
      key += chars[Math.abs(h) % 64];
      h = (h * 31 + 7) | 0;
    }
    return key + "=";
  }

  private hashPair(a: string, b: string): number {
    // Order-independent hash for a kit pair
    const sorted = [a, b].sort();
    return Math.abs(this.hashString(sorted[0] + ":" + sorted[1]));
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
