import { existsSync, readdirSync, readFileSync } from "fs";
import { resolve, sep } from "path";
import { parse } from "yaml";
import type { MeshState, MissionKit, NetworkDevice } from "../shared/types";

const DEFAULT_AUTONET_ROOT = "/Users/joshua.giles/Downloads/talon-autonet-main";

type ParsedObject = Record<string, unknown>;

interface GroupDefaults {
  kitLanBase: string;
  kitWgBase: string;
  ipRouterBaseOffset: number;
  hqBgpAs: number;
}

interface RouterDefinition {
  name: string;
  type: string;
  label: string;
}

interface MissionKitDefinition {
  kitId: number;
  kitName: string;
  wgPublicIp: string;
}

interface KitConfig {
  hostKey: string;
  mission: number;
  missionName: string;
  kitId: number;
  kitName: string;
  kitLanBase: string;
  kitWgBase: string;
  ipRouterBaseOffset: number;
  proxmoxHost: string;
  ipProxmox: string;
  ipEdgeGateway: string;
  ipZitiController: string;
  ipNebula: string;
  ipMonitor: string;
  hqRouterHost: string;
  hqWgPublicIp: string;
  missionKits: MissionKitDefinition[];
  zitiRouters: RouterDefinition[];
}

interface ProbeResult {
  reachable: boolean;
  latencyMs: number | null;
}

export interface AutoNetSnapshot {
  generatedAt: Date;
  projectPath: string;
  kits: MissionKit[];
  devices: NetworkDevice[];
  meshState: MeshState;
  connected: boolean;
  peers: number;
  diagnostics: {
    loadedHosts: number;
    hasStagedPeers: boolean;
    lastError?: string;
  };
}

function formatKitId(mission: number, kitId: number): string {
  return `m${String(mission).padStart(2, "0")}-k${String(kitId).padStart(2, "0")}`;
}

function getPlainString(value: unknown): string | undefined {
  if (typeof value === "string" && !value.includes("{{")) {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  return undefined;
}

function getNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && !value.includes("{{")) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function getObjectArray(value: unknown): ParsedObject[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "object" && item !== null) as ParsedObject[];
}

function buildLanIp(base: string, mission: number, kitId: number, hostOctet: number): string {
  return `${base}.${mission}.${kitId}.${hostOctet}`;
}

function toMissionKitStatus(localKit: boolean, stagedPeer: boolean, probeReachable: boolean): MissionKit["status"] {
  if (localKit) {
    return probeReachable ? "ONLINE" : "OFFLINE";
  }
  return stagedPeer ? "DEGRADED" : "ONLINE";
}

export class AutoNetIntegration {
  private rootPath: string;
  private cache: AutoNetSnapshot | null = null;
  private lastLoadMs = 0;
  private readonly cacheTtlMs = 10_000;
  private firstSeenByDevice = new Map<string, number>();
  private lastError: string | undefined;

  constructor(initialRootPath?: string) {
    const envRoot = Bun.env.MDG_AUTONET_ROOT;
    this.rootPath = this.normalizeRootPath(initialRootPath || envRoot || DEFAULT_AUTONET_ROOT);
  }

  setRootPath(rootPath: string): void {
    this.rootPath = this.normalizeRootPath(rootPath);
    this.cache = null;
    this.lastLoadMs = 0;
  }

  getRootPath(): string {
    return this.rootPath;
  }

  getLastError(): string | undefined {
    return this.lastError;
  }

  async getSnapshot(force = false): Promise<AutoNetSnapshot> {
    if (!force && this.cache && Date.now() - this.lastLoadMs < this.cacheTtlMs) {
      return this.cache;
    }

    const snapshot = await this.buildSnapshot();
    this.cache = snapshot;
    this.lastLoadMs = Date.now();
    return snapshot;
  }

  private async buildSnapshot(): Promise<AutoNetSnapshot> {
    const generatedAt = new Date();

    if (!existsSync(this.rootPath) || !this.looksLikeAutoNetRoot(this.rootPath)) {
      const error = `AutoNet root not valid: ${this.rootPath}`;
      this.lastError = error;
      return {
        generatedAt,
        projectPath: this.rootPath,
        kits: [],
        devices: [],
        meshState: "FULL_ISOLATION",
        connected: false,
        peers: 0,
        diagnostics: {
          loadedHosts: 0,
          hasStagedPeers: false,
          lastError: error,
        },
      };
    }

    const groupDefaults = this.loadGroupDefaults();
    const kitConfigs = this.loadKitConfigs(groupDefaults);
    const { devices, probes } = await this.loadDevicesWithProbes(kitConfigs);
    const kits = this.buildMissionKits(kitConfigs, probes);
    const mesh = this.deriveMeshState(kitConfigs, devices);

    this.lastError = undefined;
    return {
      generatedAt,
      projectPath: this.rootPath,
      kits,
      devices,
      meshState: mesh.state,
      connected: mesh.connected,
      peers: mesh.peers,
      diagnostics: {
        loadedHosts: kitConfigs.length,
        hasStagedPeers: kitConfigs.some((cfg) => cfg.missionKits.some((kit) => kit.wgPublicIp.toUpperCase() === "STAGED")),
      },
    };
  }

  private loadGroupDefaults(): GroupDefaults {
    const defaults: GroupDefaults = {
      kitLanBase: "10",
      kitWgBase: "10.255",
      ipRouterBaseOffset: 21,
      hqBgpAs: 4259840000,
    };

    const path = `${this.rootPath}/group_vars/all/vars.yml`;
    const parsed = this.readYaml(path);
    if (!parsed) {
      return defaults;
    }

    return {
      kitLanBase: getPlainString(parsed.kit_lan_base) || defaults.kitLanBase,
      kitWgBase: getPlainString(parsed.kit_wg_base) || defaults.kitWgBase,
      ipRouterBaseOffset: getNumber(parsed.ip_router_base_offset, defaults.ipRouterBaseOffset),
      hqBgpAs: getNumber(parsed.hq_bgp_as, defaults.hqBgpAs),
    };
  }

  private loadKitConfigs(groupDefaults: GroupDefaults): KitConfig[] {
    const hostVarsDir = `${this.rootPath}/inventory/host_vars`;
    if (!existsSync(hostVarsDir)) {
      return [];
    }

    const hostFolders = readdirSync(hostVarsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const configs: KitConfig[] = [];

    for (const hostKey of hostFolders) {
      const varsPath = `${hostVarsDir}/${hostKey}/vars.yml`;
      const vars = this.readYaml(varsPath);
      if (!vars) {
        continue;
      }

      const mission = getNumber(vars.kit_mission, -1);
      const kitId = getNumber(vars.kit_id, -1);
      const kitName = getPlainString(vars.kit_name) || hostKey;
      const missionName = getPlainString(vars.kit_mission_name) || `mission-${mission}`;
      if (mission <= 0 || kitId <= 0) {
        continue;
      }

      const kitLanBase = getPlainString(vars.kit_lan_base) || groupDefaults.kitLanBase;
      const kitWgBase = getPlainString(vars.kit_wg_base) || groupDefaults.kitWgBase;
      const ipRouterBaseOffset = getNumber(vars.ip_router_base_offset, groupDefaults.ipRouterBaseOffset);
      const ipProxmox = getPlainString(vars.ip_proxmox) || buildLanIp(kitLanBase, mission, kitId, 10);
      const ipEdgeGateway = getPlainString(vars.ip_edge_gw) || buildLanIp(kitLanBase, mission, kitId, 1);
      const ipZitiController = getPlainString(vars.ip_ziti_ctrl) || buildLanIp(kitLanBase, mission, kitId, 20);
      const ipNebula = getPlainString(vars.ip_nebula) || buildLanIp(kitLanBase, mission, kitId, 25);
      const ipMonitor = getPlainString(vars.ip_monitor) || buildLanIp(kitLanBase, mission, kitId, 30);
      const proxmoxHost = getPlainString(vars.proxmox_node) || hostKey;
      const hqRouterHost = getPlainString(vars.hq_router_host) || "hq-ziti-router-hq";
      const hqWgPublicIp = getPlainString(vars.hq_wg_public_ip) || "";

      const missionKits = getObjectArray(vars.mission_kits).map((item) => ({
        kitId: getNumber(item.kit_id, -1),
        kitName: getPlainString(item.kit_name) || "unknown",
        wgPublicIp: getPlainString(item.wg_public_ip) || "STAGED",
      })).filter((item) => item.kitId > 0);

      const zitiRouters = getObjectArray(vars.ziti_routers).map((item) => ({
        name: getPlainString(item.name) || "router",
        type: getPlainString(item.type) || "local",
        label: getPlainString(item.label) || "",
      }));

      configs.push({
        hostKey,
        mission,
        missionName,
        kitId,
        kitName,
        kitLanBase,
        kitWgBase,
        ipRouterBaseOffset,
        proxmoxHost,
        ipProxmox,
        ipEdgeGateway,
        ipZitiController,
        ipNebula,
        ipMonitor,
        hqRouterHost,
        hqWgPublicIp,
        missionKits,
        zitiRouters,
      });
    }

    return configs;
  }

  private async loadDevicesWithProbes(kitConfigs: KitConfig[]): Promise<{
    devices: NetworkDevice[];
    probes: Record<string, ProbeResult>;
  }> {
    const devices: NetworkDevice[] = [];

    for (const cfg of kitConfigs) {
      const kitPrefix = `${formatKitId(cfg.mission, cfg.kitId)}-${cfg.kitName}`;

      devices.push(this.createDevice(`${kitPrefix}-proxmox`, cfg.proxmoxHost, cfg.ipProxmox, "PROXMOX", "ACCESS", 0, cfg.zitiRouters.length));
      devices.push(this.createDevice(`${kitPrefix}-edge-gw`, `${cfg.kitName}-edge-gw`, cfg.ipEdgeGateway, "OPENWRT", "EDGE", cfg.missionKits.length, cfg.zitiRouters.length));
      devices.push(this.createDevice(`${kitPrefix}-ziti-ctrl`, `${cfg.kitName}-ziti-ctrl-01`, cfg.ipZitiController, "ALMALINUX", "CORE", 0, cfg.zitiRouters.length));
      devices.push(this.createDevice(`${kitPrefix}-nebula`, `${cfg.kitName}-nebula-01`, cfg.ipNebula, "ALMALINUX", "DISTRIBUTION", 0, 1));
      devices.push(this.createDevice(`${kitPrefix}-monitor`, `${cfg.kitName}-monitor-01`, cfg.ipMonitor, "ALMALINUX", "DISTRIBUTION", 0, 1));

      cfg.zitiRouters.forEach((router, index) => {
        const routerSuffix = router.label ? `${router.name}-${router.label}` : router.name;
        const routerIp = buildLanIp(cfg.kitLanBase, cfg.mission, cfg.kitId, cfg.ipRouterBaseOffset + index);
        devices.push(
          this.createDevice(
            `${kitPrefix}-${routerSuffix}`,
            `${cfg.kitName}-ziti-${routerSuffix}`,
            routerIp,
            "ALMALINUX",
            "EDGE",
            cfg.missionKits.length,
            cfg.zitiRouters.length,
          ),
        );
      });
    }

    const probeEntries = await Promise.all(
      devices.map(async (device) => [device.id, await this.probeHost(device.ip)] as const),
    );
    const probes = Object.fromEntries(probeEntries);

    for (const device of devices) {
      const probe = probes[device.id];
      const firstSeen = this.firstSeenByDevice.get(device.id);
      if (probe.reachable && !firstSeen) {
        this.firstSeenByDevice.set(device.id, Date.now());
      }

      const baseline = this.firstSeenByDevice.get(device.id) ?? Date.now();
      const uptimeSeconds = probe.reachable ? Math.max(60, Math.floor((Date.now() - baseline) / 1000)) : 0;

      device.metrics = {
        ...device.metrics,
        uptime: uptimeSeconds,
        interfacesUp: probe.reachable ? Math.max(device.metrics.interfacesUp, 1) : 0,
        interfacesDown: probe.reachable ? 0 : Math.max(device.metrics.interfacesDown, 1),
      };
      device.status = probe.reachable ? "HEALTHY" : "UNREACHABLE";
      device.lastChecked = new Date();
    }

    return { devices, probes };
  }

  private buildMissionKits(kitConfigs: KitConfig[], probes: Record<string, ProbeResult>): MissionKit[] {
    const map = new Map<string, MissionKit>();

    map.set("hq", {
      id: "hq",
      name: "HQ Backbone",
      missionId: 0,
      kitId: 0,
      lanSubnet: "10.0.0.0/16",
      wireguardIP: "10.255.0.1",
      bgpAS: 4259840000,
      status: "ONLINE",
      lastSeen: new Date(),
    });

    for (const cfg of kitConfigs) {
      const localKitId = formatKitId(cfg.mission, cfg.kitId);
      const localProbeKey = `${localKitId}-${cfg.kitName}-edge-gw`;
      const localReachable = probes[localProbeKey]?.reachable === true;

      const allMissionKits = new Map<number, MissionKitDefinition>();
      allMissionKits.set(cfg.kitId, { kitId: cfg.kitId, kitName: cfg.kitName, wgPublicIp: "LOCAL" });
      for (const kit of cfg.missionKits) {
        allMissionKits.set(kit.kitId, kit);
      }

      for (const kit of allMissionKits.values()) {
        const kitIdentifier = formatKitId(cfg.mission, kit.kitId);
        const stagedPeer = kit.wgPublicIp.toUpperCase() === "STAGED";
        const localKit = kit.kitId === cfg.kitId;
        const status = toMissionKitStatus(localKit, stagedPeer, localReachable);
        const wgIp = `${cfg.kitWgBase}.${cfg.mission}.${kit.kitId}`;
        const lanSubnet = `${cfg.kitLanBase}.${cfg.mission}.${kit.kitId}.0/24`;
        const bgpAs = 4200000000 + cfg.mission * 1000 + kit.kitId;

        map.set(kitIdentifier, {
          id: kitIdentifier,
          name: `Mission ${String(cfg.mission).padStart(2, "0")} - Kit ${String(kit.kitId).padStart(2, "0")} (${kit.kitName.toUpperCase()})`,
          missionId: cfg.mission,
          kitId: kit.kitId,
          lanSubnet,
          wireguardIP: wgIp,
          bgpAS: bgpAs,
          status,
          lastSeen: new Date(),
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.missionId !== b.missionId) {
        return a.missionId - b.missionId;
      }
      return a.kitId - b.kitId;
    });
  }

  private deriveMeshState(kitConfigs: KitConfig[], devices: NetworkDevice[]): { state: MeshState; connected: boolean; peers: number } {
    const reachableDevices = devices.filter((device) => device.status !== "UNREACHABLE");
    const reachableRouters = devices.filter((device) => device.role === "EDGE" && device.status !== "UNREACHABLE");
    const reachableControllers = devices.filter((device) => device.hostname.includes("ziti-ctrl") && device.status !== "UNREACHABLE");
    const hasStagedPeers = kitConfigs.some((cfg) => cfg.missionKits.some((kit) => kit.wgPublicIp.toUpperCase() === "STAGED"));

    if (reachableDevices.length === 0) {
      return { state: "FULL_ISOLATION", connected: false, peers: 0 };
    }

    if (reachableControllers.length === 0 && reachableRouters.length > 0) {
      return { state: "HQ_CONTROLLER_LOSS", connected: true, peers: reachableRouters.length };
    }

    if (hasStagedPeers) {
      return { state: "KIT_TO_KIT_LOSS", connected: true, peers: reachableRouters.length };
    }

    if (reachableRouters.length < Math.max(1, devices.filter((device) => device.role === "EDGE").length)) {
      return { state: "PARTIAL_WAN", connected: true, peers: reachableRouters.length };
    }

    return { state: "FULL", connected: true, peers: reachableRouters.length };
  }

  private async probeHost(ip: string): Promise<ProbeResult> {
    try {
      const pingProcess = Bun.spawn(["ping", "-c", "1", "-W", "1000", ip], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(pingProcess.stdout).text();
      await pingProcess.exited;

      const reachable = pingProcess.exitCode === 0;
      const latencyMatch = stdout.match(/time[=<]([\d.]+)\s*ms/i);

      return {
        reachable,
        latencyMs: latencyMatch ? Number.parseFloat(latencyMatch[1]) : null,
      };
    } catch {
      return { reachable: false, latencyMs: null };
    }
  }

  private createDevice(
    id: string,
    hostname: string,
    ip: string,
    platform: NetworkDevice["platform"],
    role: NetworkDevice["role"],
    bgpPeers: number,
    interfaceHint: number,
  ): NetworkDevice {
    return {
      id,
      hostname,
      ip,
      platform,
      role,
      status: "UNREACHABLE",
      metrics: {
        cpu: 0,
        memory: 0,
        uptime: 0,
        interfacesUp: interfaceHint,
        interfacesDown: 0,
        bgpPeers,
        ospfNeighbors: role === "DISTRIBUTION" ? 1 : 0,
      },
      lastChecked: new Date(),
    };
  }

  private readYaml(path: string): ParsedObject | null {
    try {
      if (!existsSync(path)) {
        return null;
      }
      const fileText = readFileSync(path, "utf8");
      const parsed = parse(fileText);
      if (parsed && typeof parsed === "object") {
        return parsed as ParsedObject;
      }
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = `Failed to parse ${path}: ${message}`;
      return null;
    }
  }

  private normalizeRootPath(inputPath: string): string {
    const candidate = resolve(inputPath.trim());
    const probes: string[] = [candidate];

    // Support user-provided paths like ".../roles/autonet" and ".../roles".
    if (candidate.endsWith(`${sep}roles${sep}autonet`)) {
      probes.push(resolve(candidate, "..", ".."));
    }
    if (candidate.endsWith(`${sep}roles`)) {
      probes.push(resolve(candidate, ".."));
    }

    // Opportunistic parent probes for partially nested paths.
    probes.push(resolve(candidate, ".."));
    probes.push(resolve(candidate, "..", ".."));

    const uniqueProbes = Array.from(new Set(probes));
    for (const probe of uniqueProbes) {
      if (this.looksLikeAutoNetRoot(probe)) {
        return probe;
      }
    }

    return candidate;
  }

  private looksLikeAutoNetRoot(rootPath: string): boolean {
    return existsSync(rootPath)
      && existsSync(`${rootPath}/inventory`)
      && existsSync(`${rootPath}/inventory/host_vars`)
      && existsSync(`${rootPath}/group_vars`)
      && existsSync(`${rootPath}/roles/autonet`);
  }
}
