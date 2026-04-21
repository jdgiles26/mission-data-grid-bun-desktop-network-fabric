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

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

// ── Component ──────────────────────────────────────────────────────────────
export function WireGuardMonitor() {
  const [wgStatus, setWgStatus] = useState<any>(null);
  const [mtuCompliance, setMtuCompliance] = useState<any>(null);
  const [peerMatrix, setPeerMatrix] = useState<any>(null);
  const [tunnelHealth, setTunnelHealth] = useState<any>(null);
  const [keyRotation, setKeyRotation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [wg, mtu, pm, th, kr] = await Promise.all([
        rpcHandlers.getWireGuardStatus().catch(() => null),
        rpcHandlers.validateMTUCompliance().catch(() => null),
        rpcHandlers.getPeerMatrix().catch(() => null),
        rpcHandlers.getTunnelHealth().catch(() => null),
        rpcHandlers.getKeyRotationStatus().catch(() => null),
      ]);
      setWgStatus(wg);
      setMtuCompliance(mtu);
      setPeerMatrix(pm);
      setTunnelHealth(th);
      setKeyRotation(kr);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch WireGuard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  if (loading) return <div style={S.loading}>LOADING WIREGUARD STATUS...</div>;
  if (error && !wgStatus && !tunnelHealth)
    return <div style={S.error}>WARNING {error}</div>;

  // -- Derive KPIs --
  const totalTunnels: number = wgStatus?.totalTunnels ?? 0;
  const activeTunnels: number = wgStatus?.activeTunnels ?? 0;
  const mtuPercent: number = mtuCompliance?.compliancePercent ?? 0;
  const avgHandshakeAge: number = wgStatus?.avgHandshakeAgeSec ?? 0;
  const tunnelActive = totalTunnels > 0 && activeTunnels === totalTunnels;

  // -- Peer matrix data --
  const matrixKits: string[] = peerMatrix?.kits ?? [];
  const matrixData: Record<string, Record<string, string>> = peerMatrix?.connectivity ?? {};

  // -- MTU table --
  const mtuEntries: any[] = mtuCompliance?.entries ?? [];

  // -- Tunnel health cards --
  const tunnelCards: any[] = tunnelHealth?.kits ?? [];

  // -- Key rotation --
  const keyEntries: any[] = keyRotation?.entries ?? [];

  return (
    <div style={S.page}>
      {/* Header bar */}
      <div style={S.stateBar}>
        <span style={S.led(tunnelActive)} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: tunnelActive ? "#22c55e" : "#f59e0b" }}>
          {tunnelActive ? "ALL TUNNELS ACTIVE" : "TUNNEL DEGRADATION"}
        </span>
        <span style={{ flex: 1 }} />
        {lastRefresh && (
          <span style={{ fontSize: 10, color: "#3b4a5a" }}>
            REFRESHED {lastRefresh.toLocaleTimeString("en-US", { hour12: false })}
          </span>
        )}
        <button
          onClick={fetchAll}
          style={{ background: "none", border: "1px solid #1a2535", color: "#4a6070", fontSize: 10, padding: "3px 10px", borderRadius: 3, cursor: "pointer", letterSpacing: 1 }}
        >REFRESH</button>
      </div>

      {/* KPI row */}
      <div style={S.row}>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Total Tunnels</div>
          <div style={{ ...S.kpiValue, color: "#3b82f6" }}>{totalTunnels}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Active Tunnels</div>
          <div style={{ ...S.kpiValue, color: activeTunnels === totalTunnels ? "#22c55e" : "#f59e0b" }}>{activeTunnels}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>MTU Compliance</div>
          <div style={{ ...S.kpiValue, color: mtuPercent >= 100 ? "#22c55e" : mtuPercent >= 80 ? "#f59e0b" : "#ef4444" }}>
            {mtuPercent.toFixed(0)}<span style={{ fontSize: 12, color: "#64748b" }}>%</span>
          </div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Avg Handshake Age</div>
          <div style={{ ...S.kpiValue, color: avgHandshakeAge < 180 ? "#22c55e" : avgHandshakeAge < 300 ? "#f59e0b" : "#ef4444" }}>
            {avgHandshakeAge}<span style={{ fontSize: 12, color: "#64748b" }}>s</span>
          </div>
        </div>
      </div>

      {/* Peer connectivity matrix */}
      {matrixKits.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Peer Connectivity Matrix</div>
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}></th>
                  {matrixKits.map((kit) => (
                    <th key={kit} style={{ ...S.th, textAlign: "center" as const }}>{kit}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixKits.map((rowKit) => (
                  <tr key={rowKit}>
                    <td style={{ ...S.td, fontWeight: 600, color: "#4a90d9" }}>{rowKit}</td>
                    {matrixKits.map((colKit) => {
                      const state = matrixData[rowKit]?.[colKit] ?? (rowKit === colKit ? "SELF" : "UNKNOWN");
                      const cellColor = state === "SELF" ? "#1a2535" : state === "CONNECTED" ? "#22c55e" : state === "DEGRADED" ? "#f59e0b" : state === "DISCONNECTED" ? "#ef4444" : "#64748b";
                      return (
                        <td key={colKit} style={{ ...S.td, textAlign: "center" as const }}>
                          {state === "SELF" ? (
                            <span style={{ color: "#1a2535" }}>--</span>
                          ) : (
                            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: cellColor, boxShadow: `0 0 4px ${cellColor}` }} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 10, color: "#4a6070" }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#22c55e", marginRight: 4, verticalAlign: "middle" }} />Connected</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", marginRight: 4, verticalAlign: "middle" }} />Degraded</span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#ef4444", marginRight: 4, verticalAlign: "middle" }} />Disconnected</span>
          </div>
        </div>
      )}

      {/* MTU Compliance table */}
      <div style={S.card}>
        <div style={S.cardTitle}>MTU Compliance ({mtuEntries.length} interfaces)</div>
        {mtuEntries.length === 0 ? (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No MTU data available</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Kit</th>
                <th style={S.th}>Interface</th>
                <th style={S.th}>Current MTU</th>
                <th style={S.th}>Expected MTU</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {mtuEntries.map((entry: any, i: number) => {
                const compliant = entry.currentMtu === (entry.expectedMtu ?? 1300);
                return (
                  <tr key={i}>
                    <td style={S.td}><span style={{ color: "#4a90d9" }}>{entry.kit ?? "—"}</span></td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{entry.iface ?? entry.interface ?? "wg0"}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{entry.currentMtu ?? "—"}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{entry.expectedMtu ?? 1300}</td>
                    <td style={S.td}>
                      <span style={S.badge(compliant ? "#22c55e" : "#ef4444")}>{compliant ? "COMPLIANT" : "NON-COMPLIANT"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Tunnel health cards */}
      {tunnelCards.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Tunnel Health by Kit</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {tunnelCards.map((kit: any, i: number) => {
              const score: number = kit.score ?? 0;
              const col = scoreColor(score);
              return (
                <div key={i} style={{ background: "#0a1220", border: `1px solid ${col}33`, borderRadius: 6, padding: "12px 16px", minWidth: 180, flex: "1 1 200px" }}>
                  <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" as const }}>{kit.name ?? kit.kitId ?? `KIT-${i + 1}`}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 28, fontWeight: 700, color: col, fontFamily: "monospace" }}>{score}</span>
                    <span style={{ fontSize: 11, color: "#64748b" }}>/ 100</span>
                  </div>
                  <div style={{ marginTop: 8, height: 4, background: "#111b28", borderRadius: 2 }}>
                    <div style={{ height: 4, borderRadius: 2, background: col, width: `${Math.min(score, 100)}%`, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: "#4a6070" }}>
                    <span>Peers: {kit.peerCount ?? "—"}</span>
                    <span>Last HS: {kit.lastHandshakeSec != null ? `${kit.lastHandshakeSec}s` : "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Key rotation status */}
      <div style={S.card}>
        <div style={S.cardTitle}>Key Rotation Status</div>
        {keyEntries.length === 0 ? (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No key rotation data available</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Kit</th>
                <th style={S.th}>Key Age (days)</th>
                <th style={S.th}>Last Rotated</th>
                <th style={S.th}>Policy</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {keyEntries.map((entry: any, i: number) => {
                const ageDays: number = entry.ageDays ?? 0;
                const overdue = ageDays > (entry.policyMaxDays ?? 90);
                return (
                  <tr key={i}>
                    <td style={S.td}><span style={{ color: "#4a90d9" }}>{entry.kit ?? "—"}</span></td>
                    <td style={{ ...S.td, fontFamily: "monospace", color: overdue ? "#ef4444" : "#c9d3e0" }}>{ageDays}</td>
                    <td style={{ ...S.td, fontSize: 10 }}>{entry.lastRotated ? new Date(entry.lastRotated).toLocaleDateString() : "—"}</td>
                    <td style={{ ...S.td, fontSize: 10 }}>Max {entry.policyMaxDays ?? 90}d</td>
                    <td style={S.td}>
                      <span style={S.badge(overdue ? "#ef4444" : "#22c55e")}>{overdue ? "OVERDUE" : "CURRENT"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
