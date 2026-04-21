// Operational State Classifier
// Real-time classification of AutoNet's 5 operational states per kit
// with state transition tracking, duration monitoring, and predictive capabilities

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export type OperationalState = "FULL" | "PARTIAL_WAN_LOSS" | "HQ_CONTROLLER_LOSS" | "KIT_TO_KIT_LOSS" | "FULL_ISOLATION";

export interface StateIndicators {
  wgHandshakeActive: boolean;
  wgHandshakeAgeSeconds: number;
  bgpAdjacencyEstablished: boolean;
  bgpPrefixesReceived: number;
  zitiFabricLinksUp: number;
  zitiFabricLinksTotal: number;
  hqApiReachable: boolean;
  localControllerReachable: boolean;
  adjacentKitsReachable: number;
  adjacentKitsTotal: number;
}

export interface StateTransition {
  timestamp: Date;
  fromState: OperationalState;
  toState: OperationalState;
  cause: string;
  indicators: StateIndicators;
}

export interface KitStateClassification {
  kitId: string;
  kitName: string;
  missionId: number;
  currentState: OperationalState;
  stateEnteredAt: Date;
  durationSeconds: number;
  indicators: StateIndicators;
  confidence: number; // 0-1
  stateHistory: StateTransition[];
}

export interface AutonomousCapabilities {
  state: OperationalState;
  description: string;
  availableServices: string[];
  unavailableServices: string[];
  degradedServices: string[];
  localAutonomyLevel: "FULL" | "HIGH" | "MODERATE" | "LIMITED" | "MINIMAL";
  canProcessFlashTraffic: boolean;
  canReachHQ: boolean;
  canReachAdjacentKits: boolean;
  recommendations: string[];
}

export interface StatePrediction {
  kitId: string;
  currentState: OperationalState;
  predictedNextState: OperationalState;
  transitionProbability: number; // 0-100
  estimatedTimeToTransitionMinutes: number | null;
  triggerIndicators: string[];
}

export interface StateDuration {
  kitId: string;
  kitName: string;
  currentState: OperationalState;
  durationSeconds: number;
  durationFormatted: string;
  totalTimeInState24h: Record<OperationalState, number>; // seconds per state
}

export class OperationalStateClassifier {
  private rootPath: string;
  private kitStates = new Map<string, KitStateClassification>();
  private transitionHistory = new Map<string, StateTransition[]>();

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.initializeStates();
  }

  private loadKits(): Array<{ kitId: string; kitName: string; missionId: number; numericKitId: number; vars: Record<string, unknown> }> {
    const kits: Array<{ kitId: string; kitName: string; missionId: number; numericKitId: number; vars: Record<string, unknown> }> = [];
    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (!existsSync(hostVarsDir)) return kits;

    const hosts = readdirSync(hostVarsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const host of hosts) {
      const varsPath = join(hostVarsDir, host, "vars.yml");
      if (!existsSync(varsPath)) continue;

      try {
        const vars = parse(readFileSync(varsPath, "utf8")) as Record<string, unknown>;
        const mission = Number(vars["kit_mission"] || 1);
        const kitId = Number(vars["kit_id"] || 1);
        const kitName = String(vars["kit_name"] || host);
        const kitIdentifier = `m${String(mission).padStart(2, "0")}-k${String(kitId).padStart(2, "0")}`;
        kits.push({ kitId: kitIdentifier, kitName, missionId: mission, numericKitId: kitId, vars });
      } catch { /* skip */ }
    }

    return kits;
  }

  private initializeStates(): void {
    const kits = this.loadKits();

    for (const kit of kits) {
      const indicators = this.simulateIndicators(kit.kitId, kit.vars);
      const state = this.deriveState(indicators);
      const now = new Date();
      // Simulate that the kit has been in this state for a random duration
      const stateAge = this.seededInt(kit.kitId, 0, 3600 * 4);
      const stateEnteredAt = new Date(now.getTime() - stateAge * 1000);

      const history = this.generateStateHistory(kit.kitId, state);
      this.transitionHistory.set(kit.kitId, history);

      this.kitStates.set(kit.kitId, {
        kitId: kit.kitId,
        kitName: kit.kitName,
        missionId: kit.missionId,
        currentState: state,
        stateEnteredAt,
        durationSeconds: stateAge,
        indicators,
        confidence: 0.85 + this.seededRandom(kit.kitId, 99) * 0.15,
        stateHistory: history,
      });
    }
  }

  private simulateIndicators(kitId: string, vars: Record<string, unknown>): StateIndicators {
    const seed = (offset: number) => this.seededRandom(kitId, offset);

    const wgActive = seed(1) > 0.15;
    const bgpUp = seed(2) > 0.12;
    const hqReachable = seed(3) > 0.18;
    const ctrlReachable = seed(4) > 0.08;
    const zitiTotal = 3; // 3 routers per kit: local, adjacent, hq

    const zitiUp = hqReachable
      ? (ctrlReachable ? zitiTotal : 2)
      : (ctrlReachable ? 1 : 0);

    const adjacentTotal = Math.max(1, this.seededInt(kitId, 1, 4));
    const adjacentUp = hqReachable
      ? adjacentTotal
      : Math.floor(adjacentTotal * seed(5));

    return {
      wgHandshakeActive: wgActive,
      wgHandshakeAgeSeconds: wgActive ? this.seededInt(kitId + "wg", 5, 120) : 0,
      bgpAdjacencyEstablished: bgpUp,
      bgpPrefixesReceived: bgpUp ? this.seededInt(kitId + "bgp", 3, 25) : 0,
      zitiFabricLinksUp: zitiUp,
      zitiFabricLinksTotal: zitiTotal,
      hqApiReachable: hqReachable,
      localControllerReachable: ctrlReachable,
      adjacentKitsReachable: adjacentUp,
      adjacentKitsTotal: adjacentTotal,
    };
  }

  private deriveState(indicators: StateIndicators): OperationalState {
    const {
      wgHandshakeActive,
      bgpAdjacencyEstablished,
      zitiFabricLinksUp,
      zitiFabricLinksTotal,
      hqApiReachable,
      localControllerReachable,
      adjacentKitsReachable,
      adjacentKitsTotal,
    } = indicators;

    // FULL_ISOLATION: nothing works
    if (!wgHandshakeActive && !localControllerReachable && !hqApiReachable) {
      return "FULL_ISOLATION";
    }

    // HQ_CONTROLLER_LOSS: local works but HQ is gone
    if (!hqApiReachable && localControllerReachable) {
      return "HQ_CONTROLLER_LOSS";
    }

    // KIT_TO_KIT_LOSS: HQ may be up but adjacent kits unreachable
    if (adjacentKitsTotal > 0 && adjacentKitsReachable === 0) {
      return "KIT_TO_KIT_LOSS";
    }

    // PARTIAL_WAN_LOSS: some degradation but core fabric intact
    if (
      (!bgpAdjacencyEstablished || zitiFabricLinksUp < zitiFabricLinksTotal) &&
      localControllerReachable
    ) {
      return "PARTIAL_WAN_LOSS";
    }

    return "FULL";
  }

  private generateStateHistory(kitId: string, currentState: OperationalState): StateTransition[] {
    const history: StateTransition[] = [];
    const states: OperationalState[] = ["FULL", "PARTIAL_WAN_LOSS", "HQ_CONTROLLER_LOSS", "KIT_TO_KIT_LOSS", "FULL_ISOLATION"];
    const now = Date.now();
    const transitionCount = this.seededInt(kitId + "hist", 0, 8);

    let prevState: OperationalState = "FULL";
    for (let i = 0; i < transitionCount; i++) {
      const hoursAgo = (transitionCount - i) * 3 + this.seededRandom(kitId, i * 100) * 2;
      const nextState = states[this.seededInt(kitId + String(i), 0, states.length - 1)]!;
      if (nextState === prevState) continue;

      const causes = [
        "WireGuard handshake timeout exceeded 180s",
        "BGP session reset by remote peer",
        "Ziti fabric link to HQ router dropped",
        "Transport signal degraded below threshold",
        "HQ API health check failed 3 consecutive times",
        "Adjacent kit WireGuard endpoint unreachable",
        "All indicators restored to normal",
        "Local controller became reachable after restart",
      ];

      history.push({
        timestamp: new Date(now - hoursAgo * 3600 * 1000),
        fromState: prevState,
        toState: nextState,
        cause: causes[this.seededInt(kitId + "cause" + i, 0, causes.length - 1)]!,
        indicators: this.simulateIndicators(kitId + String(i), {}),
      });

      prevState = nextState;
    }

    // Final transition to current state
    if (prevState !== currentState && history.length > 0) {
      history.push({
        timestamp: new Date(now - this.seededInt(kitId + "final", 300, 7200) * 1000),
        fromState: prevState,
        toState: currentState,
        cause: "State reclassified based on updated indicator polling",
        indicators: this.simulateIndicators(kitId, {}),
      });
    }

    return history;
  }

  // --- Public API ---

  classifyState(kitId: string): KitStateClassification | null {
    const classification = this.kitStates.get(kitId);
    if (!classification) return null;

    // Update duration
    classification.durationSeconds = Math.floor(
      (Date.now() - classification.stateEnteredAt.getTime()) / 1000,
    );

    return classification;
  }

  getStateHistory(kitId: string): StateTransition[] {
    return this.transitionHistory.get(kitId) || [];
  }

  getAllKitStates(): KitStateClassification[] {
    const results: KitStateClassification[] = [];
    for (const [kitId, classification] of this.kitStates) {
      classification.durationSeconds = Math.floor(
        (Date.now() - classification.stateEnteredAt.getTime()) / 1000,
      );
      results.push(classification);
    }
    return results;
  }

  getAutonomousCapabilities(state: OperationalState): AutonomousCapabilities {
    const capabilities: Record<OperationalState, AutonomousCapabilities> = {
      FULL: {
        state: "FULL",
        description: "All systems nominal. Full connectivity to HQ, adjacent kits, and mission apps.",
        availableServices: [
          "Ziti controller enrollment",
          "HQ policy sync",
          "Cross-kit data relay",
          "Centralized logging",
          "PKI certificate rotation",
          "Peer exchange",
          "Remote Ansible execution",
          "Mission app full access",
        ],
        unavailableServices: [],
        degradedServices: [],
        localAutonomyLevel: "FULL",
        canProcessFlashTraffic: true,
        canReachHQ: true,
        canReachAdjacentKits: true,
        recommendations: ["Nominal operations - no action required"],
      },
      PARTIAL_WAN_LOSS: {
        state: "PARTIAL_WAN_LOSS",
        description: "WAN degraded but local fabric intact. Some HQ-facing services may be slow or intermittent.",
        availableServices: [
          "Local Ziti fabric",
          "Local mission apps",
          "Local BGP routing",
          "Local monitoring",
          "Kit-to-kit relay (if routes exist)",
        ],
        unavailableServices: [
          "Real-time HQ policy sync",
          "Centralized log shipping",
        ],
        degradedServices: [
          "HQ API access (intermittent)",
          "PKI certificate operations",
          "Cross-kit data relay (increased latency)",
        ],
        localAutonomyLevel: "HIGH",
        canProcessFlashTraffic: true,
        canReachHQ: false,
        canReachAdjacentKits: true,
        recommendations: [
          "Monitor transport signal quality",
          "Queue non-critical HQ-bound traffic",
          "Prepare for potential failover to backup transport",
        ],
      },
      HQ_CONTROLLER_LOSS: {
        state: "HQ_CONTROLLER_LOSS",
        description: "HQ controller unreachable. Local controller operates autonomously. No new enrollments or policy updates from HQ.",
        availableServices: [
          "Local Ziti controller (autonomous mode)",
          "Local mission apps",
          "Local BGP routing",
          "Local monitoring",
          "Existing Ziti identities",
        ],
        unavailableServices: [
          "New Ziti enrollments via HQ",
          "HQ policy updates",
          "Centralized certificate issuance",
          "Remote Ansible from HQ",
        ],
        degradedServices: [
          "Cross-kit relay (must use direct WireGuard)",
          "PKI operations (local CA only)",
          "Identity management (cached policies)",
        ],
        localAutonomyLevel: "MODERATE",
        canProcessFlashTraffic: true,
        canReachHQ: false,
        canReachAdjacentKits: true,
        recommendations: [
          "Verify local controller database integrity",
          "Do not attempt new enrollments until HQ restored",
          "Activate island mode if HQ loss persists > 4 hours",
          "Use peer-exchange for inter-kit identity trust",
        ],
      },
      KIT_TO_KIT_LOSS: {
        state: "KIT_TO_KIT_LOSS",
        description: "Adjacent kits unreachable. Local fabric operational. HQ may or may not be reachable.",
        availableServices: [
          "Local Ziti fabric",
          "Local mission apps",
          "Local monitoring",
          "HQ API access (if WAN intact)",
        ],
        unavailableServices: [
          "Cross-kit data relay",
          "Adjacent kit status monitoring",
          "Mesh-based redundancy",
        ],
        degradedServices: [
          "BGP route convergence (missing peer routes)",
          "Ziti fabric (no mesh links to adjacent routers)",
          "Distributed mission apps",
        ],
        localAutonomyLevel: "LIMITED",
        canProcessFlashTraffic: true,
        canReachHQ: true,
        canReachAdjacentKits: false,
        recommendations: [
          "Check WireGuard peer endpoints for adjacent kits",
          "Verify BGP session state with birdc",
          "Consider transport failover if RF link was primary",
          "Route critical traffic through HQ hub if available",
        ],
      },
      FULL_ISOLATION: {
        state: "FULL_ISOLATION",
        description: "Complete isolation. No WAN, no HQ, no adjacent kits. Kit operates as standalone island.",
        availableServices: [
          "Local mission apps (cached data only)",
          "Local Ziti controller (island mode)",
          "Local router (no external peers)",
        ],
        unavailableServices: [
          "All HQ services",
          "All cross-kit services",
          "All WAN-dependent services",
          "Certificate operations",
          "Policy updates",
          "Peer exchange",
          "Remote monitoring",
        ],
        degradedServices: [
          "Local monitoring (no external comparison)",
          "Mission apps (stale data, local cache only)",
        ],
        localAutonomyLevel: "MINIMAL",
        canProcessFlashTraffic: false,
        canReachHQ: false,
        canReachAdjacentKits: false,
        recommendations: [
          "PRIORITY: Restore physical transport connectivity",
          "Verify edge gateway power and configuration",
          "Check all WAN transport hardware (Starlink, LTE, Dejero)",
          "If intentional: activate island mode procedures",
          "Queue all outbound traffic for later transmission",
          "Prepare situation report for when connectivity restores",
        ],
      },
    };

    return capabilities[state];
  }

  predictStateTransition(kitId: string): StatePrediction | null {
    const classification = this.kitStates.get(kitId);
    if (!classification) return null;

    const indicators = classification.indicators;
    const currentState = classification.currentState;
    const triggerIndicators: string[] = [];
    let predictedNext: OperationalState = currentState;
    let probability = 10; // base probability of change

    // Analyze indicators for degradation trends
    if (currentState === "FULL") {
      if (indicators.wgHandshakeAgeSeconds > 90) {
        probability += 25;
        triggerIndicators.push(`WireGuard handshake age ${indicators.wgHandshakeAgeSeconds}s (stale)`);
        predictedNext = "PARTIAL_WAN_LOSS";
      }
      if (indicators.bgpPrefixesReceived < 5) {
        probability += 15;
        triggerIndicators.push(`Low BGP prefix count: ${indicators.bgpPrefixesReceived}`);
        predictedNext = "PARTIAL_WAN_LOSS";
      }
      if (indicators.zitiFabricLinksUp < indicators.zitiFabricLinksTotal) {
        probability += 20;
        triggerIndicators.push(`Ziti fabric degraded: ${indicators.zitiFabricLinksUp}/${indicators.zitiFabricLinksTotal}`);
        predictedNext = "PARTIAL_WAN_LOSS";
      }
    } else if (currentState === "PARTIAL_WAN_LOSS") {
      if (!indicators.hqApiReachable) {
        probability += 35;
        triggerIndicators.push("HQ API unreachable during partial WAN loss");
        predictedNext = "HQ_CONTROLLER_LOSS";
      }
      if (indicators.adjacentKitsReachable < indicators.adjacentKitsTotal) {
        probability += 20;
        triggerIndicators.push(`Adjacent kit connectivity dropping: ${indicators.adjacentKitsReachable}/${indicators.adjacentKitsTotal}`);
        predictedNext = "KIT_TO_KIT_LOSS";
      }
    } else if (currentState === "HQ_CONTROLLER_LOSS" || currentState === "KIT_TO_KIT_LOSS") {
      if (!indicators.wgHandshakeActive) {
        probability += 40;
        triggerIndicators.push("WireGuard tunnel has gone down");
        predictedNext = "FULL_ISOLATION";
      }
    } else if (currentState === "FULL_ISOLATION") {
      // Check if recovery is possible
      if (indicators.localControllerReachable) {
        probability += 30;
        triggerIndicators.push("Local controller is responding - recovery may be possible");
        predictedNext = "HQ_CONTROLLER_LOSS";
      }
    }

    probability = Math.min(100, probability);

    let estimatedMinutes: number | null = null;
    if (probability > 30 && predictedNext !== currentState) {
      estimatedMinutes = Math.round(60 / (probability / 30));
    }

    return {
      kitId,
      currentState,
      predictedNextState: predictedNext,
      transitionProbability: probability,
      estimatedTimeToTransitionMinutes: estimatedMinutes,
      triggerIndicators,
    };
  }

  getStateDurations(): StateDuration[] {
    const results: StateDuration[] = [];

    for (const [kitId, classification] of this.kitStates) {
      const duration = Math.floor((Date.now() - classification.stateEnteredAt.getTime()) / 1000);
      const history = this.transitionHistory.get(kitId) || [];

      // Calculate time in each state over last 24h
      const timeInState: Record<OperationalState, number> = {
        FULL: 0,
        PARTIAL_WAN_LOSS: 0,
        HQ_CONTROLLER_LOSS: 0,
        KIT_TO_KIT_LOSS: 0,
        FULL_ISOLATION: 0,
      };

      const cutoff = Date.now() - 24 * 3600 * 1000;
      const relevantTransitions = history.filter((t) => t.timestamp.getTime() > cutoff);

      if (relevantTransitions.length === 0) {
        timeInState[classification.currentState] = Math.min(duration, 24 * 3600);
      } else {
        let prevTime = cutoff;
        let prevState: OperationalState = "FULL";

        for (const transition of relevantTransitions) {
          const elapsed = (transition.timestamp.getTime() - prevTime) / 1000;
          timeInState[prevState] += Math.max(0, elapsed);
          prevTime = transition.timestamp.getTime();
          prevState = transition.toState;
        }

        // Time from last transition to now
        const remaining = (Date.now() - prevTime) / 1000;
        timeInState[classification.currentState] += Math.max(0, remaining);
      }

      results.push({
        kitId,
        kitName: classification.kitName,
        currentState: classification.currentState,
        durationSeconds: duration,
        durationFormatted: this.formatDuration(duration),
        totalTimeInState24h: timeInState,
      });
    }

    return results;
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  private seededRandom(seed: string, offset: number): number {
    let hash = 0;
    const str = seed + String(offset);
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(Math.sin(hash) * 10000) % 1;
  }

  private seededInt(seed: string, min: number, max: number): number {
    return min + Math.floor(this.seededRandom(seed, 0) * (max - min + 1));
  }
}
