import type { MeshState, MissionKit, NetworkDevice, TopologyLink } from "../shared/types";
import { AutoNetIntegration, type AutoNetSnapshot } from "./autonet-integration";
import { TopologyEngine } from "./topology-engine";
import {
  AutoNetCapabilityEngine,
  type AutoNetCapabilitySnapshot,
  type AutoNetValidationSummary,
} from "./autonet-capability-engine";

export interface ConnectorStatus {
  name: string;
  status: "running" | "stopped" | "error";
  detail: string;
}

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

export class MCPServerManager {
  private readonly autonet: AutoNetIntegration;
  private readonly topologyEngine = new TopologyEngine();
  private readonly capabilityEngine = new AutoNetCapabilityEngine();
  private lastSnapshot: AutoNetSnapshot | null = null;

  constructor(initialAutoNetRoot?: string) {
    this.autonet = new AutoNetIntegration(initialAutoNetRoot);
  }

  async startAll(): Promise<void> {
    this.lastSnapshot = await this.autonet.getSnapshot(true);
  }

  async queryMissionKits(forceRefresh = false): Promise<MissionKit[]> {
    const snapshot = await this.getSnapshot(forceRefresh);
    return snapshot.kits;
  }

  async queryDevices(forceRefresh = false): Promise<NetworkDevice[]> {
    const snapshot = await this.getSnapshot(forceRefresh);
    return snapshot.devices;
  }

  async queryTopology(forceRefresh = false): Promise<{ devices: NetworkDevice[]; links: TopologyLink[] }> {
    const snapshot = await this.getSnapshot(forceRefresh);
    return {
      devices: snapshot.devices,
      links: this.topologyEngine.generateLinks(snapshot.devices),
    };
  }

  async queryMeshStatus(forceRefresh = false): Promise<{ connected: boolean; peers: number; state: MeshState }> {
    const snapshot = await this.getSnapshot(forceRefresh);
    return {
      connected: snapshot.connected,
      peers: snapshot.peers,
      state: snapshot.meshState,
    };
  }

  async updateAutoNetRoot(rootPath: string): Promise<void> {
    this.autonet.setRootPath(rootPath);
    this.lastSnapshot = await this.autonet.getSnapshot(true);
  }

  getAutoNetRoot(): string {
    return this.autonet.getRootPath();
  }

  getStatus(): ConnectorStatus[] {
    const diagnostics = this.lastSnapshot?.diagnostics;
    const hasError = Boolean(diagnostics?.lastError);

    return [
      {
        name: "AutoNet Inventory Parser",
        status: hasError ? "error" : "running",
        detail: hasError
          ? diagnostics?.lastError || "Failed to parse AutoNet project"
          : `Loaded ${diagnostics?.loadedHosts ?? 0} host configuration(s)`,
      },
      {
        name: "Device Probe Engine",
        status: this.lastSnapshot ? "running" : "stopped",
        detail: this.lastSnapshot
          ? `${this.lastSnapshot.devices.length} device probes completed`
          : "No snapshot loaded yet",
      },
      {
        name: "Topology Engine",
        status: this.lastSnapshot ? "running" : "stopped",
        detail: this.lastSnapshot
          ? `Mesh state: ${this.lastSnapshot.meshState}`
          : "Waiting for project snapshot",
      },
    ];
  }

  async getAutoNetDiagnostics(forceRefresh = false): Promise<AutoNetDiagnostics> {
    const snapshot = await this.getSnapshot(forceRefresh);
    const reachableDevices = snapshot.devices.filter((device) => device.status !== "UNREACHABLE").length;

    return {
      projectPath: snapshot.projectPath,
      loadedHosts: snapshot.diagnostics.loadedHosts,
      hasStagedPeers: snapshot.diagnostics.hasStagedPeers,
      generatedAt: snapshot.generatedAt,
      lastError: snapshot.diagnostics.lastError,
      totalDevices: snapshot.devices.length,
      reachableDevices,
      totalKits: snapshot.kits.length,
    };
  }

  async getAutoNetCapabilities(forceRefresh = false): Promise<AutoNetCapabilitySnapshot> {
    const rootPath = this.autonet.getRootPath();
    return this.capabilityEngine.getCapabilities(rootPath, forceRefresh);
  }

  async getAutoNetValidation(forceRefresh = false): Promise<AutoNetValidationSummary> {
    const rootPath = this.autonet.getRootPath();
    return this.capabilityEngine.getValidationSummary(rootPath, forceRefresh);
  }

  private async getSnapshot(forceRefresh = false): Promise<AutoNetSnapshot> {
    this.lastSnapshot = await this.autonet.getSnapshot(forceRefresh);
    return this.lastSnapshot;
  }
}
