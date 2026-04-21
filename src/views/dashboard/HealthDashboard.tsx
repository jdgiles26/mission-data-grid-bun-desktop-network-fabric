import React, { useEffect, useState, useCallback } from "react";
import { rpcHandlers } from "../../shared/rpc-handlers";

// ── Inline style helpers ───────────────────────────────────────────────────
const S = {
  page: { padding: 16, color: "#c9d3e0", fontFamily: "monospace", background: "#0b0f17", minHeight: "100%" } as React.CSSProperties,
  card: { background: "#0d1520", border: "1px solid #1a2535", borderRadius: 6, padding: 16, marginBottom: 16 } as React.CSSProperties,
  cardTitle: { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#64748b", marginBottom: 12, textTransform: "uppercase" as const },
  row: { display: "flex", gap: 12, marginBottom: 16 } as React.CSSProperties,
  kpiBox: { flex: 1, background: "#0a1220", border: "1px solid #1a2535", borderRadius: 6, padding: "12px 14px" } as React.CSSProperties,
  kpiLabel: { fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 4, textTransform: "uppercase" as const },
  kpiValue: { fontSize: 22, fontWeight: 700, letterSpacing: 1, fontFamily: "monospace" },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 11 },
  th: { textAlign: "left" as const, padding: "6px 10px", color: "#4a6070", fontSize: 10, letterSpacing: 1, borderBottom: "1px solid #1a2535", textTransform: "uppercase" as const },
  td: { padding: "7px 10px", borderBottom: "1px solid #111b28", color: "#c9d3e0" },
  badge: (color: string) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: color + "22", color, border: `1px solid ${color}44`, letterSpacing: 0.5 }),
  stateBar: { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#0a1220", border: "1px solid #1a2535", borderRadius: 6, marginBottom: 16 } as React.CSSProperties,
  led: (ok: boolean) => ({ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: ok ? "#22c55e" : "#ef4444", boxShadow: ok ? "0 0 6px #22c55e" : "0 0 6px #ef4444", marginRight: 8, flexShrink: 0 }),
  error: { padding: 24, color: "#f87171", textAlign: "center" as const, fontSize: 12 },
  loading: { padding: 40, color: "#64748b", textAlign: "center" as const, fontSize: 12, letterSpacing: 2 },
};

function statusColor(status: string): string {
  const s = (status || "").toUpperCase();
  if (s === "ONLINE" || s === "HEALTHY" || s === "FULL") return "#22c55e";
  if (s.includes("PARTIAL") || s === "DEGRADED" || s === "WARNING") return "#f59e0b";
  return "#ef4444";
}

function meshStateLabel(state: string): { label: string; color: string } {
  switch ((state || "").toUpperCase()) {
    case "FULL":               return { label: "MESH FULL", color: "#22c55e" };
    case "PARTIAL_WAN_LOSS":   return { label: "PARTIAL WAN LOSS", color: "#f59e0b" };
    case "HQ_CONTROLLER_LOSS": return { label: "HQ CTRL LOSS", color: "#f59e0b" };
    case "KIT_TO_KIT_LOSS":    return { label: "KIT-TO-KIT LOSS", color: "#f97316" };
    case "FULL_ISOLATION":     return { label: "FULL ISOLATION", color: "#ef4444" };
    default:                   return { label: state || "UNKNOWN", color: "#64748b" };
  }
}

// ── Component ──────────────────────────────────────────────────────────────
export function HealthDashboard() {
  const [overview, setOverview] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [sysStatus, setSysStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [ov, hs, ss] = await Promise.all([
        rpcHandlers.getAutonetOverview().catch(() => null),
        rpcHandlers.getHealthScore().catch(() => null),
        rpcHandlers.getSystemStatus().catch(() => null),
      ]);
      setOverview(ov);
      setHealth(hs);
      setSysStatus(ss);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  if (loading) return <div style={S.loading}>◌ LOADING MISSION DATA...</div>;
  if (error && !overview && !health)
    return <div style={S.error}>⚠ {error}</div>;

  const kits: any[]  = overview?.data?.kits ?? [];
  const meshState: string = overview?.data?.meshStatus?.state ?? "FULL_ISOLATION";
  const { label: meshLabel, color: meshColor } = meshStateLabel(meshState);
  const overallScore: number = health?.overall ?? 0;
  const scoreColor = overallScore >= 80 ? "#22c55e" : overallScore >= 60 ? "#f59e0b" : "#ef4444";

  const cpu = sysStatus?.cpu?.usage ?? sysStatus?.cpuUsage ?? null;
  const mem = sysStatus?.memory?.percentage ?? sysStatus?.memoryPercent ?? null;
  const disk = sysStatus?.disk?.percentage ?? sysStatus?.diskPercent ?? null;

  const alerts: any[] = health?.alerts ?? [];

  return (
    <div style={S.page}>
      {/* Mesh state banner */}
      <div style={S.stateBar}>
        <span style={S.led(meshState === "FULL")} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: meshColor }}>{meshLabel}</span>
        <span style={{ flex: 1 }} />
        {lastRefresh && (
          <span style={{ fontSize: 10, color: "#3b4a5a" }}>
            REFRESHED {lastRefresh.toLocaleTimeString("en-US", { hour12: false })}
          </span>
        )}
        <button
          onClick={fetchAll}
          style={{ background: "none", border: "1px solid #1a2535", color: "#4a6070", fontSize: 10, padding: "3px 10px", borderRadius: 3, cursor: "pointer", letterSpacing: 1 }}
        >↺ REFRESH</button>
      </div>

      {/* KPI row */}
      <div style={S.row}>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Health Score</div>
          <div style={{ ...S.kpiValue, color: scoreColor }}>{overallScore.toFixed(0)}<span style={{ fontSize: 12, color: "#64748b" }}>%</span></div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Mission Kits</div>
          <div style={{ ...S.kpiValue, color: "#3b82f6" }}>{kits.length}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>CPU Usage</div>
          <div style={{ ...S.kpiValue, color: cpu != null && cpu > 80 ? "#ef4444" : cpu != null && cpu > 60 ? "#f59e0b" : "#22c55e" }}>
            {cpu != null ? `${cpu.toFixed(0)}%` : "—"}
          </div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Memory</div>
          <div style={{ ...S.kpiValue, color: mem != null && mem > 85 ? "#ef4444" : mem != null && mem > 70 ? "#f59e0b" : "#22c55e" }}>
            {mem != null ? `${mem.toFixed(0)}%` : "—"}
          </div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Disk</div>
          <div style={{ ...S.kpiValue, color: disk != null && disk > 90 ? "#ef4444" : "#22c55e" }}>
            {disk != null ? `${disk.toFixed(0)}%` : "—"}
          </div>
        </div>
      </div>

      {/* Kit inventory table */}
      <div style={S.card}>
        <div style={S.cardTitle}>Kit Inventory ({kits.length})</div>
        {kits.length === 0 ? (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>
            {overview?.active === false
              ? "Monitoring not active — configure AutoNet root in Settings"
              : "No kits found in AutoNet inventory"}
          </div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Kit ID</th>
                <th style={S.th}>Name / Host</th>
                <th style={S.th}>Proxmox IP</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>WireGuard IP</th>
                <th style={S.th}>BGP AS</th>
                <th style={S.th}>Mesh Peers</th>
              </tr>
            </thead>
            <tbody>
              {kits.map((kit: any, i: number) => {
                const status = kit.status || kit.meshStatus || "UNKNOWN";
                const col = statusColor(status);
                return (
                  <tr key={kit.id ?? kit.kitId ?? i}>
                    <td style={S.td}><span style={{ color: "#4a90d9", fontFamily: "monospace" }}>{kit.id ?? kit.kitId ?? `KIT-${i + 1}`}</span></td>
                    <td style={S.td}>{kit.name ?? kit.hostname ?? "—"}</td>
                    <td style={{ ...S.td, fontFamily: "monospace", fontSize: 11 }}>{kit.proxmoxIp ?? kit.host ?? "—"}</td>
                    <td style={S.td}><span style={S.badge(col)}>{status}</span></td>
                    <td style={{ ...S.td, fontFamily: "monospace", fontSize: 11 }}>{kit.wireguardIp ?? kit.wgIp ?? "—"}</td>
                    <td style={{ ...S.td, fontFamily: "monospace", fontSize: 11 }}>{kit.bgpAs ?? kit.as ?? "—"}</td>
                    <td style={S.td}>{kit.meshPeers ?? kit.peers ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Health metrics */}
      {health?.metrics && health.metrics.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Health Metrics</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {health.metrics.map((m: any, i: number) => {
              const col = m.status === "HEALTHY" ? "#22c55e" : m.status === "WARNING" ? "#f59e0b" : "#ef4444";
              return (
                <div key={i} style={{ background: "#0a1220", border: `1px solid ${col}33`, borderRadius: 5, padding: "8px 14px", minWidth: 120 }}>
                  <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: col, fontFamily: "monospace" }}>
                    {typeof m.value === "number" ? m.value.toFixed(1) : m.value}{m.unit ? ` ${m.unit}` : ""}
                  </div>
                  <div style={{ fontSize: 9, color: m.trend === "UP" ? "#22c55e" : m.trend === "DOWN" ? "#ef4444" : "#64748b", marginTop: 2 }}>
                    {m.trend === "UP" ? "▲" : m.trend === "DOWN" ? "▼" : "●"} {m.status}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active alerts */}
      {alerts.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Active Alerts ({alerts.length})</div>
          {alerts.slice(0, 10).map((alert: any, i: number) => {
            const sev = (alert.severity || "INFO").toUpperCase();
            const col = sev === "CRITICAL" ? "#ef4444" : sev === "WARNING" ? "#f59e0b" : "#3b82f6";
            return (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: i < alerts.length - 1 ? "1px solid #111b28" : "none" }}>
                <span style={S.badge(col)}>{sev}</span>
                <span style={{ fontSize: 11, flex: 1, color: "#c9d3e0" }}>{alert.message}</span>
                <span style={{ fontSize: 10, color: "#3b4a5a", flexShrink: 0 }}>
                  {alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString("en-US", { hour12: false }) : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Device health summary */}
      {health?.deviceHealth && health.deviceHealth.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Device Health</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Device</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Issues</th>
              </tr>
            </thead>
            <tbody>
              {health.deviceHealth.map((d: any, i: number) => {
                const col = statusColor(d.status);
                return (
                  <tr key={i}>
                    <td style={S.td}>{d.name}</td>
                    <td style={S.td}><span style={S.badge(col)}>{d.status}</span></td>
                    <td style={{ ...S.td, color: d.issues > 0 ? "#f59e0b" : "#22c55e" }}>{d.issues}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

