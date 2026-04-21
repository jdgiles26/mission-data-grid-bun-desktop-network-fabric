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

const TRANSPORT_TYPES = ["Dejero", "Starlink", "LTE", "RF", "Wired"] as const;

function transportColor(type: string): string {
  switch (type) {
    case "Dejero": return "#8b5cf6";
    case "Starlink": return "#3b82f6";
    case "LTE": return "#f59e0b";
    case "RF": return "#f97316";
    case "Wired": return "#22c55e";
    default: return "#64748b";
  }
}

function qualityColor(quality: number): string {
  if (quality >= 80) return "#22c55e";
  if (quality >= 50) return "#f59e0b";
  return "#ef4444";
}

// ── Component ──────────────────────────────────────────────────────────────
export function TransportFailover() {
  const [predictions, setPredictions] = useState<any>(null);
  const [failoverChains, setFailoverChains] = useState<Record<string, any>>({});
  const [timeToFailover, setTimeToFailover] = useState<Record<string, any>>({});
  const [diversityScores, setDiversityScores] = useState<Record<string, any>>({});
  const [signalTrends, setSignalTrends] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const preds = await rpcHandlers.getTransportPredictions().catch(() => null);
      setPredictions(preds);

      const kitIds: string[] = preds?.kits?.map((k: any) => k.kitId) ?? ["kit-01", "kit-02", "kit-03"];

      const [chains, ttf, diversity, trends] = await Promise.all([
        Promise.all(kitIds.map(async (id) => {
          const r = await rpcHandlers.getFailoverChain(id).catch(() => null);
          return [id, r] as const;
        })),
        Promise.all(kitIds.map(async (id) => {
          const r = await rpcHandlers.predictTimeToFailover(id).catch(() => null);
          return [id, r] as const;
        })),
        Promise.all(kitIds.map(async (id) => {
          const r = await rpcHandlers.getTransportDiversityScore(id).catch(() => null);
          return [id, r] as const;
        })),
        rpcHandlers.getSignalTrends().catch(() => null),
      ]);

      setFailoverChains(Object.fromEntries(chains));
      setTimeToFailover(Object.fromEntries(ttf));
      setDiversityScores(Object.fromEntries(diversity));
      setSignalTrends(trends);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch transport data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  if (loading) return <div style={S.loading}>◌ LOADING TRANSPORT DATA...</div>;
  if (error && !predictions) return <div style={S.error}>⚠ {error}</div>;

  const kits: any[] = predictions?.kits ?? [];
  const predictedFailovers = predictions?.predictedFailovers ?? 0;
  const activeTransports = predictions?.activeTransports ?? kits.length * 5;
  const avgDiversity = predictions?.avgDiversityScore ?? 0;
  const critAlerts = predictions?.criticalAlerts ?? 0;

  return (
    <div style={S.page}>
      {/* Header bar */}
      <div style={S.stateBar}>
        <span style={S.led(critAlerts === 0)} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: critAlerts === 0 ? "#22c55e" : "#ef4444" }}>
          TRANSPORT FAILOVER PREDICTION
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
        >↺ REFRESH</button>
      </div>

      {/* KPI row */}
      <div style={S.row}>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Active Transports</div>
          <div style={{ ...S.kpiValue, color: "#3b82f6" }}>{activeTransports}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Predicted Failovers (24h)</div>
          <div style={{ ...S.kpiValue, color: predictedFailovers > 0 ? "#f59e0b" : "#22c55e" }}>{predictedFailovers}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Avg Diversity Score</div>
          <div style={{ ...S.kpiValue, color: avgDiversity >= 0.7 ? "#22c55e" : avgDiversity >= 0.4 ? "#f59e0b" : "#ef4444" }}>
            {(avgDiversity * 100).toFixed(0)}<span style={{ fontSize: 12, color: "#64748b" }}>%</span>
          </div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Critical Alerts</div>
          <div style={{ ...S.kpiValue, color: critAlerts > 0 ? "#ef4444" : "#22c55e" }}>{critAlerts}</div>
        </div>
      </div>

      {/* Transport Status Table */}
      <div style={S.card}>
        <div style={S.cardTitle}>Transport Status by Kit</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Kit</th>
              {TRANSPORT_TYPES.map((t) => (
                <th key={t} style={S.th}>{t}</th>
              ))}
              <th style={S.th}>Diversity</th>
            </tr>
          </thead>
          <tbody>
            {kits.map((kit: any, i: number) => {
              const kitDiversity = diversityScores[kit.kitId]?.score ?? kit.diversityScore ?? 0;
              return (
                <tr key={kit.kitId ?? i}>
                  <td style={S.td}>
                    <span style={{ color: "#4a90d9", fontFamily: "monospace" }}>{kit.kitId ?? kit.name ?? `KIT-${i + 1}`}</span>
                  </td>
                  {TRANSPORT_TYPES.map((tType) => {
                    const transport = kit.transports?.find((t: any) => t.type === tType);
                    const quality = transport?.signalQuality ?? transport?.quality ?? 0;
                    const active = transport?.active ?? false;
                    const col = active ? qualityColor(quality) : "#3b4a5a";
                    return (
                      <td key={tType} style={S.td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 60, height: 6, background: "#111b28", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${quality}%`, height: "100%", background: col, borderRadius: 3, transition: "width 0.5s" }} />
                          </div>
                          <span style={{ fontSize: 10, color: col, minWidth: 28, textAlign: "right" as const }}>
                            {active ? `${quality}%` : "OFF"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  <td style={S.td}>
                    <span style={S.badge(kitDiversity >= 0.7 ? "#22c55e" : kitDiversity >= 0.4 ? "#f59e0b" : "#ef4444")}>
                      {(kitDiversity * 100).toFixed(0)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {kits.length === 0 && (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No transport data available</div>
        )}
      </div>

      {/* Failover Chains */}
      <div style={S.card}>
        <div style={S.cardTitle}>Failover Chain Visualization</div>
        {kits.length === 0 ? (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No failover chains configured</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {kits.map((kit: any, i: number) => {
              const chain = failoverChains[kit.kitId]?.chain ?? kit.failoverChain ?? [];
              return (
                <div key={kit.kitId ?? i} style={{ background: "#0a1220", border: "1px solid #1a2535", borderRadius: 5, padding: "10px 14px" }}>
                  <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, letterSpacing: 1 }}>{kit.kitId ?? `KIT-${i + 1}`}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                    {chain.length > 0 ? chain.map((link: any, j: number) => {
                      const label = typeof link === "string" ? link : link.type ?? link.name ?? "—";
                      const status = typeof link === "object" ? link.status : "active";
                      const col = status === "active" ? transportColor(label) : "#3b4a5a";
                      return (
                        <React.Fragment key={j}>
                          {j > 0 && <span style={{ color: "#3b4a5a", fontSize: 12 }}>→</span>}
                          <span style={{
                            display: "inline-block", padding: "3px 10px", borderRadius: 3,
                            fontSize: 10, fontWeight: 600, background: col + "22", color: col,
                            border: `1px solid ${col}44`, letterSpacing: 0.5,
                          }}>
                            {j === 0 ? "PRIMARY" : j === 1 ? "SECONDARY" : "TERTIARY"}: {label}
                          </span>
                        </React.Fragment>
                      );
                    }) : (
                      <span style={{ fontSize: 10, color: "#3b4a5a" }}>No failover chain data</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Time to Failover Predictions */}
      <div style={S.card}>
        <div style={S.cardTitle}>Time-to-Failover Predictions</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {kits.map((kit: any, i: number) => {
            const ttfData = timeToFailover[kit.kitId] ?? kit.timeToFailover;
            const minutes = ttfData?.minutesRemaining ?? ttfData?.minutes ?? null;
            const transport = ttfData?.transport ?? ttfData?.likelyTransport ?? "—";
            const confidence = ttfData?.confidence ?? 0;
            const urgent = minutes !== null && minutes < 60;
            const col = minutes === null ? "#64748b" : urgent ? "#ef4444" : minutes < 240 ? "#f59e0b" : "#22c55e";
            return (
              <div key={kit.kitId ?? i} style={{
                background: "#0a1220", border: `1px solid ${col}33`, borderRadius: 5,
                padding: "10px 14px", minWidth: 150, flex: "1 1 150px",
              }}>
                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4, letterSpacing: 1 }}>{kit.kitId ?? `KIT-${i + 1}`}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: col, fontFamily: "monospace" }}>
                  {minutes !== null ? (
                    <>
                      {Math.floor(minutes / 60)}
                      <span style={{ fontSize: 10, color: "#64748b" }}>h </span>
                      {minutes % 60}
                      <span style={{ fontSize: 10, color: "#64748b" }}>m</span>
                    </>
                  ) : "STABLE"}
                </div>
                <div style={{ fontSize: 9, color: "#4a6070", marginTop: 3 }}>
                  {transport !== "—" && <span>Likely: {transport} </span>}
                  {confidence > 0 && <span>({(confidence * 100).toFixed(0)}% conf)</span>}
                </div>
              </div>
            );
          })}
          {kits.length === 0 && (
            <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No prediction data available</div>
          )}
        </div>
      </div>

      {/* Signal Quality Trends (Sparkline Bar Charts) */}
      <div style={S.card}>
        <div style={S.cardTitle}>Signal Quality Trends</div>
        {signalTrends?.kits && signalTrends.kits.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {signalTrends.kits.map((kit: any, i: number) => (
              <div key={kit.kitId ?? i}>
                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, letterSpacing: 1 }}>{kit.kitId ?? `KIT-${i + 1}`}</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {(kit.transports ?? []).map((t: any, j: number) => {
                    const samples: number[] = t.samples ?? t.history ?? [];
                    const col = transportColor(t.type ?? "");
                    return (
                      <div key={j} style={{ minWidth: 100 }}>
                        <div style={{ fontSize: 9, color: col, marginBottom: 3 }}>{t.type}</div>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 24 }}>
                          {samples.slice(-12).map((val: number, k: number) => (
                            <div key={k} style={{
                              width: 4, height: `${Math.max((val / 100) * 24, 1)}px`,
                              background: qualityColor(val), borderRadius: 1, opacity: 0.8 + (k / samples.length) * 0.2,
                            }} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No signal trend data available</div>
        )}
      </div>
    </div>
  );
}

export default TransportFailover;
