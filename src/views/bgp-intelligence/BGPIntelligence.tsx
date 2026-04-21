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

function peerStateColor(state: string): string {
  const s = (state || "").toUpperCase();
  if (s === "ESTABLISHED") return "#22c55e";
  if (s === "ACTIVE" || s === "OPENSENT" || s === "OPENCONFIRM") return "#f59e0b";
  if (s === "CONNECT") return "#3b82f6";
  return "#ef4444";
}

function topologyDescription(type: string): string {
  switch ((type || "").toUpperCase()) {
    case "OPTION_A": return "Back-to-back VRF - per-VRF peering at CE-PE boundary";
    case "OPTION_B": return "MPLS VPN inter-AS with labeled unicast at ASBR";
    case "OPTION_C": return "Multi-hop eBGP between source and destination PE routers";
    case "OPTION_D": return "Hybrid mesh with reflector hierarchy";
    default: return "Unknown topology configuration";
  }
}

// ── Component ──────────────────────────────────────────────────────────────
export function BGPIntelligence() {
  const [overview, setOverview] = useState<any>(null);
  const [asPaths, setAsPaths] = useState<any>(null);
  const [convergence, setConvergence] = useState<any>(null);
  const [topoType, setTopoType] = useState<any>(null);
  const [peers, setPeers] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [ov, ap, rc, tt, pr] = await Promise.all([
        rpcHandlers.getBGPOverview().catch(() => null),
        rpcHandlers.getASPathAnalysis().catch(() => null),
        rpcHandlers.getRouteConvergence().catch(() => null),
        rpcHandlers.getTopologyType().catch(() => null),
        rpcHandlers.getPeerRelationships().catch(() => null),
      ]);
      setOverview(ov);
      setAsPaths(ap);
      setConvergence(rc);
      setTopoType(tt);
      setPeers(pr);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch BGP data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  if (loading) return <div style={S.loading}>LOADING BGP INTELLIGENCE...</div>;
  if (error && !overview && !peers)
    return <div style={S.error}>WARNING {error}</div>;

  // -- Derive KPIs --
  const totalAS: number = overview?.totalASNumbers ?? 0;
  const establishedPeers: number = overview?.establishedPeers ?? 0;
  const convergencePercent: number = convergence?.convergencePercent ?? 0;
  const detectedTopo: string = topoType?.type ?? "UNKNOWN";
  const allEstablished = overview?.totalPeers != null && establishedPeers === overview.totalPeers;

  // -- AS path entries --
  const asPathEntries: any[] = asPaths?.paths ?? [];

  // -- Peer relationship entries --
  const peerEntries: any[] = peers?.peers ?? [];

  // -- Convergence trend --
  const convergenceTrend: string = convergence?.trend ?? "STABLE";
  const convergenceHistory: any[] = convergence?.history ?? [];

  return (
    <div style={S.page}>
      {/* Header bar */}
      <div style={S.stateBar}>
        <span style={S.led(allEstablished)} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: allEstablished ? "#22c55e" : "#f59e0b" }}>
          {allEstablished ? "ALL PEERS ESTABLISHED" : "PEER CONVERGENCE IN PROGRESS"}
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
          <div style={S.kpiLabel}>Total AS Numbers</div>
          <div style={{ ...S.kpiValue, color: "#3b82f6" }}>{totalAS}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Established Peers</div>
          <div style={{ ...S.kpiValue, color: allEstablished ? "#22c55e" : "#f59e0b" }}>{establishedPeers}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Route Convergence</div>
          <div style={{ ...S.kpiValue, color: convergencePercent >= 95 ? "#22c55e" : convergencePercent >= 80 ? "#f59e0b" : "#ef4444" }}>
            {convergencePercent.toFixed(0)}<span style={{ fontSize: 12, color: "#64748b" }}>%</span>
          </div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Detected Topology</div>
          <div style={{ ...S.kpiValue, fontSize: 16, color: "#a78bfa" }}>{detectedTopo.replace(/_/g, " ")}</div>
        </div>
      </div>

      {/* Topology type indicator */}
      <div style={S.card}>
        <div style={S.cardTitle}>Topology Configuration</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ background: "#0a1220", border: "1px solid #a78bfa44", borderRadius: 6, padding: "10px 18px" }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa", letterSpacing: 1 }}>{detectedTopo.replace(/_/g, " ")}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "#c9d3e0", marginBottom: 4 }}>{topologyDescription(detectedTopo)}</div>
            <div style={{ fontSize: 10, color: "#4a6070" }}>
              Convergence trend: <span style={{ color: convergenceTrend === "IMPROVING" ? "#22c55e" : convergenceTrend === "DEGRADING" ? "#ef4444" : "#f59e0b" }}>
                {convergenceTrend === "IMPROVING" ? "IMPROVING" : convergenceTrend === "DEGRADING" ? "DEGRADING" : "STABLE"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* AS Path table */}
      <div style={S.card}>
        <div style={S.cardTitle}>AS Path Analysis ({asPathEntries.length} routes)</div>
        {asPathEntries.length === 0 ? (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No AS path data available</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Prefix</th>
                <th style={S.th}>AS Path</th>
                <th style={S.th}>Next Hop</th>
                <th style={S.th}>Origin</th>
                <th style={S.th}>MED</th>
                <th style={S.th}>Local Pref</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {asPathEntries.map((entry: any, i: number) => (
                <tr key={i}>
                  <td style={{ ...S.td, fontFamily: "monospace", color: "#4a90d9" }}>{entry.prefix ?? "—"}</td>
                  <td style={{ ...S.td, fontFamily: "monospace", fontSize: 10 }}>{(entry.asPath ?? []).join(" > ") || "—"}</td>
                  <td style={{ ...S.td, fontFamily: "monospace" }}>{entry.nextHop ?? "—"}</td>
                  <td style={S.td}>{entry.origin ?? "—"}</td>
                  <td style={{ ...S.td, fontFamily: "monospace" }}>{entry.med ?? "—"}</td>
                  <td style={{ ...S.td, fontFamily: "monospace" }}>{entry.localPref ?? "—"}</td>
                  <td style={S.td}>
                    <span style={S.badge(entry.best ? "#22c55e" : "#64748b")}>{entry.best ? "BEST" : "ALT"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Peer relationships table */}
      <div style={S.card}>
        <div style={S.cardTitle}>Peer Relationships ({peerEntries.length})</div>
        {peerEntries.length === 0 ? (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No peer data available</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Neighbor</th>
                <th style={S.th}>Remote AS</th>
                <th style={S.th}>Local AS</th>
                <th style={S.th}>State</th>
                <th style={S.th}>Uptime</th>
                <th style={S.th}>Prefixes Rx</th>
                <th style={S.th}>Prefixes Tx</th>
              </tr>
            </thead>
            <tbody>
              {peerEntries.map((peer: any, i: number) => {
                const col = peerStateColor(peer.state);
                return (
                  <tr key={i}>
                    <td style={{ ...S.td, fontFamily: "monospace", color: "#4a90d9" }}>{peer.neighbor ?? "—"}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{peer.remoteAS ?? "—"}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{peer.localAS ?? "—"}</td>
                    <td style={S.td}><span style={S.badge(col)}>{peer.state ?? "UNKNOWN"}</span></td>
                    <td style={{ ...S.td, fontSize: 10 }}>{peer.uptime ?? "—"}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{peer.prefixesRx ?? "—"}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{peer.prefixesTx ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Route convergence history */}
      {convergenceHistory.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Convergence History</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 60, padding: "0 4px" }}>
            {convergenceHistory.slice(-40).map((point: any, i: number) => {
              const val: number = point.value ?? point ?? 0;
              const barColor = val >= 95 ? "#22c55e" : val >= 80 ? "#f59e0b" : "#ef4444";
              return (
                <div
                  key={i}
                  style={{ flex: 1, background: barColor, borderRadius: "2px 2px 0 0", height: `${Math.max(val, 2)}%`, opacity: 0.8, minWidth: 3 }}
                  title={`${val.toFixed(1)}%`}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#3b4a5a", marginTop: 4 }}>
            <span>40 samples ago</span>
            <span>now</span>
          </div>
        </div>
      )}
    </div>
  );
}
