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

const PRIORITY_COLORS: Record<string, string> = {
  FLASH: "#ef4444",
  IMMEDIATE: "#f59e0b",
  PRIORITY: "#3b82f6",
  ROUTINE: "#64748b",
};

const PRIORITY_ORDER = ["FLASH", "IMMEDIATE", "PRIORITY", "ROUTINE"];

function priorityColor(priority: string): string {
  return PRIORITY_COLORS[(priority || "").toUpperCase()] ?? "#64748b";
}

// ── Component ──────────────────────────────────────────────────────────────
export function PriorityQueue() {
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [bandwidth, setBandwidth] = useState<any>(null);
  const [distribution, setDistribution] = useState<any>(null);
  const [latencyEstimates, setLatencyEstimates] = useState<any>(null);
  const [starvation, setStarvation] = useState<any>(null);
  const [qosRecommendations, setQosRecommendations] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [enqueueing, setEnqueueing] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [qs, bw, dist, lat, starv, qos] = await Promise.all([
        rpcHandlers.getQueueStatus().catch(() => null),
        rpcHandlers.getBandwidthAllocation().catch(() => null),
        rpcHandlers.getPriorityDistribution().catch(() => null),
        rpcHandlers.getLatencyEstimates().catch(() => null),
        rpcHandlers.detectStarvation().catch(() => null),
        rpcHandlers.getQoSRecommendations().catch(() => null),
      ]);
      setQueueStatus(qs);
      setBandwidth(bw);
      setDistribution(dist);
      setLatencyEstimates(lat);
      setStarvation(starv);
      setQosRecommendations(qos);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch queue data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const handleEnqueue = async () => {
    setEnqueueing(true);
    try {
      await (rpcHandlers as any).enqueueTestItem?.().catch(() => null);
      await fetchAll();
    } finally {
      setEnqueueing(false);
    }
  };

  if (loading) return <div style={S.loading}>◌ LOADING PRIORITY QUEUE...</div>;
  if (error && !queueStatus) return <div style={S.error}>⚠ {error}</div>;

  const queueDepth = queueStatus?.depth ?? queueStatus?.totalItems ?? 0;
  const flashItems = queueStatus?.flashItems ?? queueStatus?.byPriority?.FLASH ?? 0;
  const throughput = queueStatus?.throughput ?? queueStatus?.itemsPerSec ?? 0;
  const starvationRisk = starvation?.risk ?? starvation?.detected ?? false;
  const items: any[] = queueStatus?.items ?? [];

  return (
    <div style={S.page}>
      {/* Header bar */}
      <div style={S.stateBar}>
        <span style={S.led(!starvationRisk)} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: starvationRisk ? "#ef4444" : "#22c55e" }}>
          MISSION PRIORITY QUEUE
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
          <div style={S.kpiLabel}>Queue Depth</div>
          <div style={{ ...S.kpiValue, color: "#3b82f6" }}>{queueDepth}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>FLASH Items</div>
          <div style={{ ...S.kpiValue, color: flashItems > 0 ? "#ef4444" : "#22c55e" }}>{flashItems}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Throughput</div>
          <div style={{ ...S.kpiValue, color: "#3b82f6" }}>
            {typeof throughput === "number" ? throughput.toFixed(1) : throughput}
            <span style={{ fontSize: 10, color: "#64748b" }}> /sec</span>
          </div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Starvation Risk</div>
          <div style={{ ...S.kpiValue, color: starvationRisk ? "#ef4444" : "#22c55e" }}>
            {starvationRisk ? "YES" : "NONE"}
          </div>
        </div>
      </div>

      {/* Visual Queue Display */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={S.cardTitle}>Queue Items by Priority</div>
          <button
            onClick={handleEnqueue}
            disabled={enqueueing}
            style={{
              background: enqueueing ? "#1a2535" : "#3b82f622",
              border: "1px solid #3b82f644", color: enqueueing ? "#4a6070" : "#3b82f6",
              fontSize: 10, padding: "4px 12px", borderRadius: 3, cursor: enqueueing ? "default" : "pointer",
              letterSpacing: 1, fontWeight: 600,
            }}
          >
            {enqueueing ? "ENQUEUING..." : "+ ENQUEUE TEST"}
          </button>
        </div>
        {PRIORITY_ORDER.map((priority) => {
          const col = priorityColor(priority);
          const priorityItems = items.filter((item: any) => (item.priority || "").toUpperCase() === priority);
          const count = priorityItems.length || (queueStatus?.byPriority?.[priority] ?? 0);
          return (
            <div key={priority} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={S.badge(col)}>{priority}</span>
                <span style={{ fontSize: 10, color: "#4a6070" }}>{count} item{count !== 1 ? "s" : ""}</span>
              </div>
              {priorityItems.length > 0 ? (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", paddingLeft: 8 }}>
                  {priorityItems.slice(0, 20).map((item: any, j: number) => (
                    <div key={item.id ?? j} style={{
                      padding: "3px 8px", borderRadius: 3, fontSize: 9,
                      background: col + "15", border: `1px solid ${col}33`, color: col,
                    }}>
                      {item.label ?? item.id ?? `item-${j}`}
                    </div>
                  ))}
                  {priorityItems.length > 20 && (
                    <span style={{ fontSize: 9, color: "#4a6070", padding: "3px 8px" }}>+{priorityItems.length - 20} more</span>
                  )}
                </div>
              ) : count > 0 ? (
                <div style={{ height: 8, background: "#111b28", borderRadius: 4, overflow: "hidden", marginLeft: 8 }}>
                  <div style={{ width: `${Math.min((count / Math.max(queueDepth, 1)) * 100, 100)}%`, height: "100%", background: col, borderRadius: 4 }} />
                </div>
              ) : null}
            </div>
          );
        })}
        {queueDepth === 0 && items.length === 0 && (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>Queue is empty</div>
        )}
      </div>

      {/* Bandwidth Allocation */}
      <div style={S.card}>
        <div style={S.cardTitle}>Bandwidth Allocation</div>
        {bandwidth?.allocations ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(bandwidth.allocations as any[]).map((alloc: any, i: number) => {
              const col = priorityColor(alloc.priority ?? alloc.name ?? "");
              const pct = alloc.percentage ?? alloc.allocation ?? 0;
              const used = alloc.usedPercentage ?? alloc.used ?? 0;
              return (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: col, fontWeight: 600 }}>{alloc.priority ?? alloc.name ?? `Band ${i}`}</span>
                    <span style={{ fontSize: 10, color: "#4a6070" }}>{used.toFixed(0)}% / {pct}%</span>
                  </div>
                  <div style={{ width: "100%", height: 10, background: "#111b28", borderRadius: 4, overflow: "hidden", position: "relative" as const }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: col + "33", borderRadius: 4, position: "absolute" as const }} />
                    <div style={{ width: `${used}%`, height: "100%", background: col, borderRadius: 4, position: "absolute" as const }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No bandwidth allocation data</div>
        )}
      </div>

      <div style={S.row}>
        {/* Priority Distribution */}
        <div style={{ ...S.card, flex: 1 }}>
          <div style={S.cardTitle}>Priority Distribution</div>
          {distribution?.priorities ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PRIORITY_ORDER.map((priority) => {
                const col = priorityColor(priority);
                const entry = (distribution.priorities as any[]).find((p: any) =>
                  (p.priority || p.name || "").toUpperCase() === priority
                );
                const pct = entry?.percentage ?? entry?.pct ?? 0;
                const count = entry?.count ?? 0;
                return (
                  <div key={priority} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: col, fontWeight: 600, minWidth: 70 }}>{priority}</span>
                    <div style={{ flex: 1, height: 8, background: "#111b28", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 10, color: "#4a6070", minWidth: 55, textAlign: "right" as const }}>
                      {pct.toFixed(1)}% ({count})
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No distribution data</div>
          )}
        </div>

        {/* Latency Estimates */}
        <div style={{ ...S.card, flex: 1 }}>
          <div style={S.cardTitle}>Latency Estimates</div>
          {latencyEstimates?.estimates ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PRIORITY_ORDER.map((priority) => {
                const col = priorityColor(priority);
                const entry = (latencyEstimates.estimates as any[]).find((e: any) =>
                  (e.priority || e.name || "").toUpperCase() === priority
                );
                const latMs = entry?.latencyMs ?? entry?.estimatedMs ?? null;
                const p99 = entry?.p99Ms ?? null;
                return (
                  <div key={priority} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                    background: col + "08", borderRadius: 4,
                  }}>
                    <span style={{ fontSize: 10, color: col, fontWeight: 600, minWidth: 70 }}>{priority}</span>
                    <span style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: col }}>
                      {latMs !== null ? `${latMs}` : "—"}
                      <span style={{ fontSize: 9, color: "#4a6070" }}> ms</span>
                    </span>
                    {p99 !== null && (
                      <span style={{ fontSize: 9, color: "#4a6070", marginLeft: "auto" }}>
                        p99: {p99}ms
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No latency estimates</div>
          )}
        </div>
      </div>

      {/* Starvation Detection */}
      {starvation && (starvation.alerts?.length > 0 || starvation.detected) && (
        <div style={S.card}>
          <div style={S.cardTitle}>Starvation Detection Alerts</div>
          {(starvation.alerts ?? []).map((alert: any, i: number) => {
            const col = (alert.severity || "").toUpperCase() === "CRITICAL" ? "#ef4444" : "#f59e0b";
            return (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0",
                borderBottom: i < (starvation.alerts?.length ?? 0) - 1 ? "1px solid #111b28" : "none",
              }}>
                <span style={S.badge(col)}>{alert.severity ?? "WARNING"}</span>
                <span style={{ fontSize: 11, flex: 1, color: "#c9d3e0" }}>{alert.message ?? alert.description ?? "Starvation risk detected"}</span>
                <span style={{ fontSize: 10, color: "#3b4a5a" }}>
                  {alert.priority && <span style={S.badge(priorityColor(alert.priority))}>{alert.priority}</span>}
                </span>
              </div>
            );
          })}
          {starvation.detected && (!starvation.alerts || starvation.alerts.length === 0) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
              <span style={S.badge("#ef4444")}>WARNING</span>
              <span style={{ fontSize: 11, color: "#c9d3e0" }}>Queue starvation risk detected for lower-priority items</span>
            </div>
          )}
        </div>
      )}

      {/* QoS Recommendations */}
      <div style={S.card}>
        <div style={S.cardTitle}>QoS Recommendations</div>
        {qosRecommendations?.recommendations && qosRecommendations.recommendations.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(qosRecommendations.recommendations as any[]).map((rec: any, i: number) => {
              const severity = (rec.severity ?? rec.impact ?? "INFO").toUpperCase();
              const col = severity === "HIGH" || severity === "CRITICAL" ? "#ef4444" : severity === "MEDIUM" || severity === "WARNING" ? "#f59e0b" : "#3b82f6";
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px",
                  background: col + "08", borderRadius: 4, border: `1px solid ${col}22`,
                }}>
                  <span style={S.badge(col)}>{severity}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#c9d3e0", marginBottom: 2 }}>{rec.title ?? rec.recommendation ?? "—"}</div>
                    {rec.description && <div style={{ fontSize: 9, color: "#4a6070" }}>{rec.description}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No QoS recommendations — queue is healthy</div>
        )}
      </div>
    </div>
  );
}

export default PriorityQueue;
