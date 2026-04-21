// Ziti Fabric Link Analyzer
// Analyzes OpenZiti fabric topology across the three-plane architecture:
// local fabric (router-01), mesh/adjacent fabric (router-02), HQ fabric (router-hq)

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export type ZitiRouterType = "local" | "adjacent" | "hq";
export type FabricPlane = "local" | "mesh" | "hq";

export interface ZitiRouter {
  id: string;
  kitId: string;
  kitName: string;
  routerName: string;
  routerType: ZitiRouterType;
  ip: string;
  controllerEndpoint: string;
  enrolled: boolean;
  online: boolean;
  linkCost: number;
}

export interface FabricLink {
  id: string;
  sourceRouterId: string;
  targetRouterId: string;
  plane: FabricPlane;
  cost: number;
  latencyMs: number | null;
  status: "up" | "down" | "degraded";
}

export interface PlaneIsolationStatus {
  plane: FabricPlane;
  healthy: boolean;
  routerCount: number;
  onlineRouters: number;
  linkCount: number;
  activeLinks: number;
  isolatedKits: string[];
  details: string;
}

export interface FabricLinkCostEntry {
  sourceKitId: string;
  targetKitId: string;
  plane: FabricPlane;
  cost: number;
  isPreferred: boolean;
  alternatePathCost: number | null;
}

export interface RouterFailureImpact {
  routerType: string;
  affectedKits: string[];
  lostCapabilities: string[];
  degradationLevel: "none" | "partial" | "severe" | "critical";
  mitigationSteps: string[];
  estimatedRecoveryMin: number;
}

export interface ControllerFederationStatus {
  kitId: string;
  controllerIp: string;
  controllerPort: number;
  reachable: boolean;
  federationPeers: string[];
  lastSyncAge: number | null; // seconds since last federation sync
  syncStatus: "synced" | "stale" | "disconnected";
}

export interface ZACAvailability {
  kitId: string;
  kitName: string;
  zacUrl: string;
  available: boolean;
  lastChecked: Date;
}

export interface FabricOverview {
  totalRouters: number;
  onlineRouters: number;
  offlineRouters: number;
  totalFabricLinks: number;
  activeLinks: number;
  degradedLinks: number;
  downLinks: number;
  planes: PlaneIsolationStatus[];
  routers: ZitiRouter[];
  controllerFederation: ControllerFederationStatus[];
  zacAvailability: ZACAvailability[];
}

export class ZitiFabricAnalyzer {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  async getFabricOverview(): Promise<FabricOverview> {
    const routers = this.loadRouters();
    const links = this.buildFabricLinks(routers);
    const planes = this.analyzePlanes(routers, links);
    const federation = this.buildFederationStatus();
    const zac = this.buildZACAvailability();

    const onlineRouters = routers.filter((r) => r.online).length;
    const activeLinks = links.filter((l) => l.status === "up").length;
    const degradedLinks = links.filter((l) => l.status === "degraded").length;
    const downLinks = links.filter((l) => l.status === "down").length;

    return {
      totalRouters: routers.length,
      onlineRouters,
      offlineRouters: routers.length - onlineRouters,
      totalFabricLinks: links.length,
      activeLinks,
      degradedLinks,
      downLinks,
      planes,
      routers,
      controllerFederation: federation,
      zacAvailability: zac,
    };
  }

  async getRouterHealth(): Promise<
    Array<{
      routerId: string;
      kitId: string;
      routerType: ZitiRouterType;
      online: boolean;
      enrolled: boolean;
      linkCount: number;
      activeLinks: number;
      healthScore: number;
      issues: string[];
    }>
  > {
    const routers = this.loadRouters();
    const links = this.buildFabricLinks(routers);
    const results: Array<{
      routerId: string;
      kitId: string;
      routerType: ZitiRouterType;
      online: boolean;
      enrolled: boolean;
      linkCount: number;
      activeLinks: number;
      healthScore: number;
      issues: string[];
    }> = [];

    for (const router of routers) {
      const routerLinks = links.filter(
        (l) => l.sourceRouterId === router.id || l.targetRouterId === router.id,
      );
      const activeLinks = routerLinks.filter((l) => l.status === "up").length;
      const issues: string[] = [];

      let healthScore = 100;

      if (!router.online) {
        healthScore -= 50;
        issues.push("Router is offline");
      }
      if (!router.enrolled) {
        healthScore -= 30;
        issues.push("Router is not enrolled with controller");
      }
      if (routerLinks.length > 0 && activeLinks === 0) {
        healthScore -= 40;
        issues.push("No active fabric links");
      } else if (routerLinks.length > 0 && activeLinks < routerLinks.length * 0.5) {
        healthScore -= 20;
        issues.push(`Only ${activeLinks}/${routerLinks.length} fabric links active`);
      }

      if (issues.length === 0) {
        issues.push("All health checks nominal");
      }

      results.push({
        routerId: router.id,
        kitId: router.kitId,
        routerType: router.routerType,
        online: router.online,
        enrolled: router.enrolled,
        linkCount: routerLinks.length,
        activeLinks,
        healthScore: Math.max(0, healthScore),
        issues,
      });
    }

    return results;
  }

  async getPlaneIsolationStatus(): Promise<PlaneIsolationStatus[]> {
    const routers = this.loadRouters();
    const links = this.buildFabricLinks(routers);
    return this.analyzePlanes(routers, links);
  }

  async getFabricLinkCosts(): Promise<FabricLinkCostEntry[]> {
    const kits = this.loadKitVars();
    const entries: FabricLinkCostEntry[] = [];

    for (const source of kits) {
      for (const target of kits) {
        if (source.kitIdentifier === target.kitIdentifier) continue;

        const pairHash = this.hashPair(source.kitIdentifier, target.kitIdentifier);

        // Local plane: cost varies 10-30 based on router proximity
        const localCost = 10 + (pairHash % 20);
        // Mesh plane: cost 5-15 for adjacent routers
        const meshCost = 5 + (pairHash % 10);
        // HQ plane: always cost 20 (goes through HQ)
        const hqCost = 20;

        const preferredPlane: FabricPlane = meshCost <= localCost ? "mesh" : "local";

        entries.push({
          sourceKitId: source.kitIdentifier,
          targetKitId: target.kitIdentifier,
          plane: "mesh",
          cost: meshCost,
          isPreferred: preferredPlane === "mesh",
          alternatePathCost: hqCost,
        });

        entries.push({
          sourceKitId: source.kitIdentifier,
          targetKitId: target.kitIdentifier,
          plane: "local",
          cost: localCost,
          isPreferred: preferredPlane === "local",
          alternatePathCost: hqCost,
        });

        entries.push({
          sourceKitId: source.kitIdentifier,
          targetKitId: target.kitIdentifier,
          plane: "hq",
          cost: hqCost,
          isPreferred: false,
          alternatePathCost: Math.min(meshCost, localCost),
        });
      }
    }

    return entries;
  }

  async analyzeRouterFailureImpact(routerType: string): Promise<RouterFailureImpact> {
    const kits = this.loadKitVars();
    const affectedKits = kits.map((k) => k.kitIdentifier);

    const impacts: Record<string, RouterFailureImpact> = {
      "router-01": {
        routerType: "router-01 (local)",
        affectedKits,
        lostCapabilities: [
          "Local Ziti service access for kit VMs",
          "Local identity enrollment",
          "Local service policies (dial/bind) for intra-kit traffic",
        ],
        degradationLevel: "severe",
        mitigationSteps: [
          "Traffic will attempt failover to router-02 (adjacent) if smart-routing enabled",
          "Restart router-01 VM on Proxmox: qm start <vmid>",
          "If VM is corrupted, re-enroll from stored JWT: ziti-router enroll router-01.jwt",
          "Verify controller can reach router after restart",
        ],
        estimatedRecoveryMin: 5,
      },
      "router-02": {
        routerType: "router-02 (adjacent/mesh)",
        affectedKits,
        lostCapabilities: [
          "Kit-to-kit mesh traffic via Ziti fabric",
          "Adjacent service discovery",
          "Cross-kit dial policies",
          "Mesh-plane redundancy",
        ],
        degradationLevel: "partial",
        mitigationSteps: [
          "Traffic will route through router-hq as fallback (higher latency)",
          "Restart router-02 VM on Proxmox",
          "If persistent, check WireGuard tunnel between kits (router-02 relies on WG)",
          "Verify BGP session is Established to confirm underlay connectivity",
        ],
        estimatedRecoveryMin: 3,
      },
      "router-hq": {
        routerType: "router-hq (HQ uplink)",
        affectedKits,
        lostCapabilities: [
          "HQ controller federation",
          "Cross-mission traffic",
          "Centralized policy updates",
          "ZAC management access from HQ",
          "Certificate renewal via HQ CA",
        ],
        degradationLevel: "partial",
        mitigationSteps: [
          "Local and mesh fabric continue operating independently",
          "Kit can still reach adjacent kits via router-02",
          "Restart router-hq VM",
          "Verify WireGuard tunnel to HQ is active: wg show",
          "Check if HQ controller is reachable on port 1280",
        ],
        estimatedRecoveryMin: 8,
      },
    };

    const normalizedType = routerType.toLowerCase().replace(/\s+/g, "-");
    if (impacts[normalizedType]) {
      return impacts[normalizedType];
    }

    // Default for unknown router type
    return {
      routerType: routerType,
      affectedKits: [],
      lostCapabilities: ["Unable to determine impact for unknown router type"],
      degradationLevel: "none",
      mitigationSteps: ["Identify the correct router type: router-01, router-02, or router-hq"],
      estimatedRecoveryMin: 0,
    };
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

  private loadRouters(): ZitiRouter[] {
    const kits = this.loadKitVars();
    const routers: ZitiRouter[] = [];

    for (const kit of kits) {
      const kitLanBase = String(kit.vars["kit_lan_base"] || "10");
      const ipRouterBaseOffset = Number(kit.vars["ip_router_base_offset"] || 21);
      const controllerIp = `${kitLanBase}.${kit.missionId}.${kit.kitId}.20`;
      const baseIp = `${kitLanBase}.${kit.missionId}.${kit.kitId}`;

      // Parse ziti_routers from vars if present
      const zitiRouters =
        (kit.vars["ziti_routers"] as Array<{ name: string; type: string; label: string }>) || [];

      if (zitiRouters.length > 0) {
        // Use configured routers
        zitiRouters.forEach((r, idx) => {
          const routerType = this.inferRouterType(r.name, r.type, r.label);
          const hash = this.hashString(`${kit.kitIdentifier}-${r.name}`);

          routers.push({
            id: `${kit.kitIdentifier}-${r.name}`,
            kitId: kit.kitIdentifier,
            kitName: kit.kitName,
            routerName: r.name,
            routerType,
            ip: `${baseIp}.${ipRouterBaseOffset + idx}`,
            controllerEndpoint: `${controllerIp}:1280`,
            enrolled: Math.abs(hash) % 100 > 8, // 92% enrolled in sim
            online: Math.abs(hash) % 100 > 12, // 88% online in sim
            linkCost: routerType === "hq" ? 20 : routerType === "adjacent" ? 5 : 10,
          });
        });
      } else {
        // Default: 3 routers per AutoNet spec
        const defaultRouters: Array<{
          name: string;
          type: ZitiRouterType;
          offset: number;
          cost: number;
        }> = [
          { name: "router-01", type: "local", offset: 0, cost: 10 },
          { name: "router-02", type: "adjacent", offset: 1, cost: 5 },
          { name: "router-hq", type: "hq", offset: 2, cost: 20 },
        ];

        for (const def of defaultRouters) {
          const hash = this.hashString(`${kit.kitIdentifier}-${def.name}`);

          routers.push({
            id: `${kit.kitIdentifier}-${def.name}`,
            kitId: kit.kitIdentifier,
            kitName: kit.kitName,
            routerName: def.name,
            routerType: def.type,
            ip: `${baseIp}.${ipRouterBaseOffset + def.offset}`,
            controllerEndpoint: `${controllerIp}:1280`,
            enrolled: Math.abs(hash) % 100 > 8,
            online: Math.abs(hash) % 100 > 12,
            linkCost: def.cost,
          });
        }
      }
    }

    return routers;
  }

  private inferRouterType(name: string, type: string, label: string): ZitiRouterType {
    const combined = `${name} ${type} ${label}`.toLowerCase();
    if (combined.includes("hq") || combined.includes("headquarters")) return "hq";
    if (
      combined.includes("adjacent") ||
      combined.includes("mesh") ||
      combined.includes("02") ||
      combined.includes("peer")
    )
      return "adjacent";
    return "local";
  }

  private buildFabricLinks(routers: ZitiRouter[]): FabricLink[] {
    const links: FabricLink[] = [];

    // Build links within the same kit (intra-kit fabric)
    const kitGroups = new Map<string, ZitiRouter[]>();
    for (const router of routers) {
      const group = kitGroups.get(router.kitId) || [];
      group.push(router);
      kitGroups.set(router.kitId, group);
    }

    for (const [_kitId, kitRouters] of kitGroups) {
      for (let i = 0; i < kitRouters.length; i++) {
        for (let j = i + 1; j < kitRouters.length; j++) {
          const rI = kitRouters[i]!;
          const rJ = kitRouters[j]!;
          const hash = this.hashPair(rI.id, rJ.id);
          const bothOnline = rI.online && rJ.online;

          let status: FabricLink["status"] = "down";
          if (bothOnline) {
            status = hash % 100 > 8 ? "up" : "degraded";
          }

          // Determine plane from router types
          let plane: FabricPlane = "local";
          if (rI.routerType === "adjacent" || rJ.routerType === "adjacent") {
            plane = "mesh";
          }
          if (rI.routerType === "hq" || rJ.routerType === "hq") {
            plane = "hq";
          }

          links.push({
            id: `link-${rI.id}-${rJ.id}`,
            sourceRouterId: rI.id,
            targetRouterId: rJ.id,
            plane,
            cost: rI.linkCost + rJ.linkCost,
            latencyMs: bothOnline ? 1 + (hash % 10) : null,
            status,
          });
        }
      }
    }

    // Build inter-kit fabric links (mesh plane via router-02, HQ plane via router-hq)
    const kitIds = Array.from(kitGroups.keys());
    for (let i = 0; i < kitIds.length; i++) {
      for (let j = i + 1; j < kitIds.length; j++) {
        const kitARouters = kitGroups.get(kitIds[i]!) || [];
        const kitBRouters = kitGroups.get(kitIds[j]!) || [];

        // Mesh link: router-02 to router-02
        const meshA = kitARouters.find((r) => r.routerType === "adjacent");
        const meshB = kitBRouters.find((r) => r.routerType === "adjacent");
        if (meshA && meshB) {
          const hash = this.hashPair(meshA.id, meshB.id);
          const bothOnline = meshA.online && meshB.online;
          links.push({
            id: `link-mesh-${meshA.id}-${meshB.id}`,
            sourceRouterId: meshA.id,
            targetRouterId: meshB.id,
            plane: "mesh",
            cost: meshA.linkCost + meshB.linkCost,
            latencyMs: bothOnline ? 10 + (hash % 80) : null,
            status: bothOnline ? (hash % 100 > 15 ? "up" : "degraded") : "down",
          });
        }

        // HQ link: router-hq to router-hq (via HQ backbone)
        const hqA = kitARouters.find((r) => r.routerType === "hq");
        const hqB = kitBRouters.find((r) => r.routerType === "hq");
        if (hqA && hqB) {
          const hash = this.hashPair(hqA.id, hqB.id);
          const bothOnline = hqA.online && hqB.online;
          links.push({
            id: `link-hq-${hqA.id}-${hqB.id}`,
            sourceRouterId: hqA.id,
            targetRouterId: hqB.id,
            plane: "hq",
            cost: hqA.linkCost + hqB.linkCost,
            latencyMs: bothOnline ? 30 + (hash % 120) : null,
            status: bothOnline ? (hash % 100 > 10 ? "up" : "degraded") : "down",
          });
        }
      }
    }

    return links;
  }

  private analyzePlanes(routers: ZitiRouter[], links: FabricLink[]): PlaneIsolationStatus[] {
    const planes: FabricPlane[] = ["local", "mesh", "hq"];
    const results: PlaneIsolationStatus[] = [];

    for (const plane of planes) {
      const planeLinks = links.filter((l) => l.plane === plane);
      const activeLinks = planeLinks.filter((l) => l.status === "up").length;

      // Determine which routers participate in this plane
      let planeRouterType: ZitiRouterType;
      switch (plane) {
        case "local":
          planeRouterType = "local";
          break;
        case "mesh":
          planeRouterType = "adjacent";
          break;
        case "hq":
          planeRouterType = "hq";
          break;
      }

      const planeRouters = routers.filter((r) => r.routerType === planeRouterType);
      const onlineRouters = planeRouters.filter((r) => r.online).length;

      // Find isolated kits (kits whose plane router is offline)
      const isolatedKits = planeRouters.filter((r) => !r.online).map((r) => r.kitId);

      const healthy = onlineRouters === planeRouters.length && activeLinks === planeLinks.length;

      let details: string;
      if (healthy) {
        details = `${plane} plane fully operational: ${onlineRouters} routers, ${activeLinks} links`;
      } else if (onlineRouters === 0) {
        details = `${plane} plane DOWN: no routers online`;
      } else {
        details = `${plane} plane degraded: ${onlineRouters}/${planeRouters.length} routers, ${activeLinks}/${planeLinks.length} links active`;
      }

      results.push({
        plane,
        healthy,
        routerCount: planeRouters.length,
        onlineRouters,
        linkCount: planeLinks.length,
        activeLinks,
        isolatedKits,
        details,
      });
    }

    return results;
  }

  private buildFederationStatus(): ControllerFederationStatus[] {
    const kits = this.loadKitVars();
    const results: ControllerFederationStatus[] = [];

    for (const kit of kits) {
      const kitLanBase = String(kit.vars["kit_lan_base"] || "10");
      const controllerIp = `${kitLanBase}.${kit.missionId}.${kit.kitId}.20`;
      const hash = this.hashString(kit.kitIdentifier + "-federation");

      // Simulated federation peers (other kit controllers)
      const otherKits = kits
        .filter((k) => k.kitIdentifier !== kit.kitIdentifier)
        .map((k) => k.kitIdentifier);

      const reachable = Math.abs(hash) % 100 > 10;
      const syncAgeSec = reachable ? Math.abs(hash % 300) : null;
      let syncStatus: ControllerFederationStatus["syncStatus"] = "disconnected";
      if (reachable && syncAgeSec !== null) {
        syncStatus = syncAgeSec < 60 ? "synced" : "stale";
      }

      results.push({
        kitId: kit.kitIdentifier,
        controllerIp,
        controllerPort: 1280,
        reachable,
        federationPeers: reachable ? otherKits.slice(0, 3 + (Math.abs(hash) % otherKits.length)) : [],
        lastSyncAge: syncAgeSec,
        syncStatus,
      });
    }

    return results;
  }

  private buildZACAvailability(): ZACAvailability[] {
    const kits = this.loadKitVars();
    const results: ZACAvailability[] = [];

    for (const kit of kits) {
      const kitLanBase = String(kit.vars["kit_lan_base"] || "10");
      const controllerIp = `${kitLanBase}.${kit.missionId}.${kit.kitId}.20`;
      const hash = this.hashString(kit.kitIdentifier + "-zac");

      results.push({
        kitId: kit.kitIdentifier,
        kitName: kit.kitName,
        zacUrl: `https://${controllerIp}:8443`,
        available: Math.abs(hash) % 100 > 15, // 85% available in sim
        lastChecked: new Date(),
      });
    }

    return results;
  }

  private hashPair(a: string, b: string): number {
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
