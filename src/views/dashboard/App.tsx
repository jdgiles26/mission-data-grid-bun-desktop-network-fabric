import React, { useState, useEffect, useCallback } from "react";
import { ErrorBoundary } from "../../shared/error-boundary";
import { HealthDashboard } from "./HealthDashboard";
import { TopologyViewer } from "../topology/TopologyViewer";
import { PacketCapture } from "../packet-capture/PacketCapture";
import { AIIntelligence } from "../ai-intelligence/AIIntelligence";
import { AutoNetOrchestration } from "../autonet-orchestration/AutoNetOrchestration";
import { ConfigManagement } from "../config-management/ConfigManagement";
import { IdentityManagement } from "../identity-management/IdentityManagement";
import { MissionLogging } from "../mission-logging/MissionLogging";
import { EmergencyProcedures } from "../emergency-procedures/EmergencyProcedures";
import { CoalitionDataFabric } from "../coalition-data/CoalitionDataFabric";
import { SettingsPanel } from "./SettingsPanel";
import { rpcHandlers } from "../../shared/rpc-handlers";

// Phase 10: AutoNet Intelligence Views
import { WireGuardMonitor } from "../wireguard-monitor/WireGuardMonitor";
import { BGPIntelligence } from "../bgp-intelligence/BGPIntelligence";
import { ZitiFabricView } from "../ziti-fabric/ZitiFabricView";
import { KitReadiness } from "../kit-readiness/KitReadiness";
import { ThreatIntel } from "../threat-intel/ThreatIntel";
import { TransportFailover } from "../transport-failover/TransportFailover";
import { OperationalState } from "../operational-state/OperationalState";
import { PriorityQueue } from "../priority-queue/PriorityQueue";
import { PKIValidator } from "../pki-validator/PKIValidator";
import { RunbookIntel } from "../runbook-intel/RunbookIntel";

export type AppSection =
  | "dashboard" | "network" | "security" | "identity"
  | "playbooks" | "config" | "coalition" | "ai"
  | "logs" | "emergency" | "settings"
  | "wireguard" | "bgp" | "ziti-fabric" | "kit-readiness" | "threat-intel"
  | "transport-failover" | "op-state" | "priority-queue" | "pki-chain" | "runbook-intel";

const NAV_ITEMS: Array<{ id: AppSection; label: string; icon: string; color?: string; section?: string }> = [
  // --- Core Operations ---
  { id: "dashboard",          label: "Mission Overview",      icon: "\u229E", color: "#22c55e", section: "CORE" },
  { id: "network",            label: "Network Topology",      icon: "\u29EB", color: "#3b82f6" },
  { id: "security",           label: "Security Center",       icon: "\uD83D\uDEE1", color: "#f59e0b" },
  { id: "identity",           label: "Identity & ZeroTrust",  icon: "\uD83D\uDD11", color: "#8b5cf6" },
  // --- AutoNet Intelligence ---
  { id: "wireguard",          label: "WireGuard Mesh",        icon: "\u2B21", color: "#06d6a0", section: "AUTONET INTEL" },
  { id: "bgp",                label: "BGP Routes",            icon: "\u21C4", color: "#4cc9f0" },
  { id: "ziti-fabric",        label: "Ziti Fabric",           icon: "\u25C7", color: "#7209b7" },
  { id: "op-state",           label: "Operational State",     icon: "\u25C8", color: "#f72585" },
  { id: "transport-failover", label: "Transport Failover",    icon: "\u2195", color: "#fb8500" },
  { id: "threat-intel",       label: "Threat Intel",          icon: "\u26A0", color: "#d00000" },
  // --- Mission Operations ---
  { id: "priority-queue",     label: "Priority Queue",        icon: "\u21E1", color: "#ff006e", section: "MISSION OPS" },
  { id: "pki-chain",          label: "PKI Validator",         icon: "\u26D3", color: "#8338ec" },
  { id: "kit-readiness",      label: "Kit Readiness",         icon: "\u2713", color: "#38b000" },
  { id: "runbook-intel",      label: "Runbook Intel",         icon: "\u22B3", color: "#3a86ff" },
  // --- Orchestration ---
  { id: "playbooks",          label: "Playbooks",             icon: "\u25B6", color: "#06b6d4", section: "ORCHESTRATION" },
  { id: "config",             label: "Config Management",     icon: "\u2699", color: "#94a3b8" },
  { id: "coalition",          label: "Coalition Data",        icon: "\uD83E\uDD1D", color: "#10b981" },
  { id: "ai",                 label: "AI Intelligence",       icon: "\u25C9", color: "#a855f7" },
  { id: "logs",               label: "Mission Logs",          icon: "\u25EB", color: "#64748b" },
  { id: "emergency",          label: "Emergency",             icon: "\u26A1", color: "#ef4444" },
  { id: "settings",           label: "Settings",              icon: "\u2630", color: "#64748b" },
];

function Clock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span style={{ fontFamily: "'SF Mono', monospace", color: "#22c55e", fontSize: 13, letterSpacing: 2 }}>
      {pad(time.getUTCHours())}:{pad(time.getUTCMinutes())}:{pad(time.getUTCSeconds())}Z
    </span>
  );
}

function StatusLed({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: ok ? "#22c55e" : "#ef4444",
      boxShadow: ok ? "0 0 6px #22c55e" : "0 0 6px #ef4444",
      marginRight: 6, flexShrink: 0,
    }} />
  );
}

function renderSection(section: AppSection) {
  switch (section) {
    case "dashboard":          return <HealthDashboard />;
    case "network":            return <TopologyViewer />;
    case "security":           return <PacketCapture />;
    case "identity":           return <IdentityManagement />;
    case "playbooks":          return <AutoNetOrchestration />;
    case "config":             return <ConfigManagement />;
    case "coalition":          return <CoalitionDataFabric />;
    case "ai":                 return <AIIntelligence />;
    case "logs":               return <MissionLogging />;
    case "emergency":          return <EmergencyProcedures />;
    case "settings":           return <SettingsPanel />;
    // Phase 10: AutoNet Intelligence Views
    case "wireguard":          return <WireGuardMonitor />;
    case "bgp":                return <BGPIntelligence />;
    case "ziti-fabric":        return <ZitiFabricView />;
    case "kit-readiness":      return <KitReadiness />;
    case "threat-intel":       return <ThreatIntel />;
    case "transport-failover": return <TransportFailover />;
    case "op-state":           return <OperationalState />;
    case "priority-queue":     return <PriorityQueue />;
    case "pki-chain":          return <PKIValidator />;
    case "runbook-intel":      return <RunbookIntel />;
    default:                   return <HealthDashboard />;
  }
}

export function App() {
  const [section, setSection] = useState<AppSection>("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [systemOk, setSystemOk] = useState(true);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.style.background = "#0b0f17";
    document.body.style.background = "#0b0f17";
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const notifs = await rpcHandlers.getNotifications({ limit: 10 });
        const arr = Array.isArray(notifs) ? notifs : [];
        const unread = arr.filter((n: any) => !n.read).length;
        setNotifCount(unread);
        setSystemOk(true);
      } catch (e) {
        console.warn("[MDG] notification poll failed:", e);
        setSystemOk(false);
      }
    };
    poll();
    const t = setInterval(poll, 15000);
    return () => clearInterval(t);
  }, []);

  const sidebarW = collapsed ? 56 : 240;
  const HEADER_H = 48;

  let lastSection = "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0b0f17", color: "#c9d3e0", overflow: "hidden" }}>
      {/* Header */}
      <header style={{
        height: HEADER_H, flexShrink: 0, background: "#090d14",
        borderBottom: "1px solid #1a2535",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", userSelect: "none", zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setCollapsed(c => !c)}
            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18, padding: "4px 6px", borderRadius: 4 }}
          >{"\u2630"}</button>
          <span style={{ color: "#22c55e", fontSize: 11, fontWeight: 700, letterSpacing: 3, fontFamily: "monospace" }}>{"\u25C8"} MISSION DATA GRID</span>
          <span style={{ color: "#1a2535", fontSize: 11, margin: "0 4px" }}>|</span>
          <span style={{ color: "#3b4a5a", fontSize: 10, letterSpacing: 1 }}>AUTONET INTELLIGENCE HUB</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Clock />
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <StatusLed ok={systemOk} />
            <span style={{ fontSize: 10, color: "#64748b", letterSpacing: 1 }}>{systemOk ? "SYS NOMINAL" : "SYS ERROR"}</span>
          </div>
          {notifCount > 0 && (
            <button onClick={() => setSection("settings")} style={{ background: "#7c2d12", border: "none", borderRadius: 3, color: "#fca5a5", fontSize: 10, padding: "2px 7px", cursor: "pointer" }}>
              {"\uD83D\uDD14"} {notifCount}
            </button>
          )}
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <nav style={{
          width: sidebarW, flexShrink: 0, background: "#090d14",
          borderRight: "1px solid #1a2535",
          display: "flex", flexDirection: "column",
          transition: "width 0.2s ease", overflowX: "hidden", overflowY: "auto",
          paddingTop: 4,
        }}>
          {NAV_ITEMS.map((item, idx) => {
            const active = section === item.id;
            const showSectionHeader = item.section && item.section !== lastSection;
            if (item.section) lastSection = item.section;
            return (
              <React.Fragment key={item.id}>
                {showSectionHeader && !collapsed && (
                  <div style={{
                    fontSize: 9, color: "#2a3f57", letterSpacing: 2, padding: "10px 14px 3px",
                    fontWeight: 700, textTransform: "uppercase",
                    borderTop: idx > 0 ? "1px solid #111b28" : "none",
                    marginTop: idx > 0 ? 4 : 0,
                  }}>
                    {item.section}
                  </div>
                )}
                <button
                  onClick={() => setSection(item.id)}
                  title={collapsed ? item.label : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: collapsed ? "8px 0" : "7px 14px",
                    justifyContent: collapsed ? "center" : "flex-start",
                    background: active ? "#0f1a2a" : "none",
                    border: "none",
                    borderLeft: active ? `2px solid ${item.color || "#22c55e"}` : "2px solid transparent",
                    color: active ? (item.color || "#22c55e") : "#5a7080",
                    cursor: "pointer", fontSize: 12, fontFamily: "monospace",
                    transition: "all 0.15s ease", whiteSpace: "nowrap", overflow: "hidden",
                    width: "100%",
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#c9d3e0"; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#5a7080"; }}
                >
                  <span style={{ fontSize: 13, flexShrink: 0, width: 20, textAlign: "center" }}>{item.icon}</span>
                  {!collapsed && <span style={{ fontSize: 10, letterSpacing: 0.5 }}>{item.label}</span>}
                </button>
              </React.Fragment>
            );
          })}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Bottom version */}
          {!collapsed && (
            <div style={{ padding: "8px 14px", fontSize: 9, color: "#2a3f57", letterSpacing: 1, borderTop: "1px solid #1a2535" }}>
              MDG v3.0.0 {"\u00B7"} AUTONET INTEL HUB
            </div>
          )}
        </nav>

        {/* Main content */}
        <main style={{ flex: 1, overflow: "auto", background: "#0b0f17", padding: 0 }}>
          <ErrorBoundary>
            {renderSection(section)}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
