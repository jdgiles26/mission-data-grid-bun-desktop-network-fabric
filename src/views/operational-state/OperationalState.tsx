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

const STATE_COLORS: Record<string, string> = {
  FULL: "#22c55e",
  PARTIAL_WAN_LOSS: "#f59e0b",
  HQ_CONTROLLER_LOSS: "#f97316",
  KIT_TO_KIT_LOSS: "#f97316",
  FULL_ISOLATION: "#ef4444",
};

const STATE_LABELS: Record<string, string> = {
  FULL: "FULL CONNECTIVITY",
  PARTIAL_WAN_LOSS: "PARTIAL WAN LOSS",
  HQ_CONTROLLER_LOSS: "HQ CONTROLLER LOSS",
  KIT_TO_KIT_LOSS: "KIT-TO-KIT LOSS",
  FULL_ISOLATION: "FULL ISOLATION",
};

const ALL_STATES = ["FULL", "PARTIAL_WAN_LOSS", "HQ_CONTROLLER_LOSS", "KIT_TO_KIT_LOSS", "FULL_ISOLATION"];

function stateColor(state: string): string {
  return STATE_COLORS[(state || "").toUpperCase()] ?? "#64748b";
}

function stateLabel(state: string): string {
  return STATE_LABELS[(state || "").toUpperCase()] ?? state ?? "UNKNOWN";
}

// ── Component ──────────────────────────────────────────────────────────────
export function OperationalState() {
  const [kitStates, setKitStates] = useState<any>(null);
  const [stateHistory, setStateHistory] = useState<Record<string, any>>({});
  const [capabilities, setCapabilities] = useState<Record<string, any>>({});
  const [predictions, setPredictions] = useState<Record<string, any>>({});
  const [durations, setDurations] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const allStates = await rpcHandlers.getAllKitStates().catch(() => null);
      setKitStates(allStates);

      const kitIds: string[] = allStates?.kits?.map((k: any) => k.kitId) ?? ["kit-01", "kit-02", "kit-03"];

      const [histories, preds, durs, caps] = await Promise.all([
        Promise.all(kitIds.map(async (id) => {
          const r = await rpcHandlers.getStateHistory(id).catch(() => null);
          return [id, r] as const;
        })),
        Promise.all(kitIds.map(async (id) => {
          const r = await rpcHandlers.predictStateTransition(id).catch(() => null);
          return [id, r] as const;
        })),
        rpcHandlers.getStateDurations().catch(() => null),
        Promise.all(ALL_STATES.map(async (state) => {
          const r = await rpcHandlers.getAutonomousCapabilities(state).catch(() => null);
          return [state, r] as const;
        })),
      ]);

      setStateHistory(Object.fromEntries(histories));
      setPredictions(Object.fromEntries(preds));
      setDurations(durs);
      setCapabilities(Object.fromEntries(caps));
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch operational state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  if (loading) return <div style={S.loading}>◌ LOADING OPERATIONAL STATE...</div>;
  if (error && !kitStates) return <div style={S.error}>⚠ {error}</div>;

  const kits: any[] = kitStates?.kits ?? [];
  const healthyKits = kits.filter((k: any) => (k.state || "").toUpperCase() === "FULL").length;
  const degradedKits = kits.filter((k: any) => {
    const s = (k.state || "").toUpperCase();
    return s !== "FULL" && s !== "FULL_ISOLATION";
  }).length;
  const isolatedKits = kits.filter((k: any) => (k.state || "").toUpperCase() === "FULL_ISOLATION").length;

  return (
    <div style={S.page}>
      {/* Header bar */}
      <div style={S.stateBar}>
        <span style={S.led(isolatedKits === 0)} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: isolatedKits === 0 ? "#22c55e" : "#ef4444" }}>
          OPERATIONAL STATE CLASSIFIER
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
          <div style={S.kpiLabel}>Total Kits</div>
          <div style={{ ...S.kpiValue, color: "#3b82f6" }}>{kits.length}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Fully Connected</div>
          <div style={{ ...S.kpiValue, color: "#22c55e" }}>{healthyKits}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Degraded</div>
          <div style={{ ...S.kpiValue, color: degradedKits > 0 ? "#f59e0b" : "#22c55e" }}>{degradedKits}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Isolated</div>
          <div style={{ ...S.kpiValue, color: isolatedKits > 0 ? "#ef4444" : "#22c55e" }}>{isolatedKits}</div>
        </div>
      </div>

      {/* Large State Indicators */}
      <div style={S.card}>
        <div style={S.cardTitle}>Kit State Overview</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {kits.map((kit: any, i: number) => {
            const state = (kit.state || "UNKNOWN").toUpperCase();
            const col = stateColor(state);
            const dur = kit.stateDuration ?? durations?.kits?.find((d: any) => d.kitId === kit.kitId)?.duration ?? null;
            return (
              <div key={kit.kitId ?? i} style={{
                flex: "1 1 180px", minWidth: 180, background: col + "11",
                border: `1px solid ${col}44`, borderRadius: 6, padding: "14px 16px",
              }}>
                <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 6 }}>
                  {kit.kitId ?? kit.name ?? `KIT-${i + 1}`}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: col, letterSpacing: 1, marginBottom: 4 }}>
                  {stateLabel(state)}
                </div>
                {dur !== null && (
                  <div style={{ fontSize: 9, color: "#4a6070" }}>
                    Duration: {typeof dur === "number" ? `${Math.floor(dur / 60)}h ${dur % 60}m` : dur}
                  </div>
                )}
              </div>
            );
          })}
          {kits.length === 0 && (
            <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No kit state data available</div>
          )}
        </div>
      </div>

      {/* State Transition Timeline */}
      <div style={S.card}>
        <div style={S.cardTitle}>State Transition Timeline</div>
        {kits.length > 0 ? (
          <div style={{ maxHeight: 300, overflowY: "auto" }}>
            {kits.map((kit: any, i: number) => {
              const history: any[] = stateHistory[kit.kitId]?.transitions ?? kit.transitions ?? [];
              if (history.length === 0) return null;
              return (
                <div key={kit.kitId ?? i} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: "#4a90d9", letterSpacing: 1, marginBottom: 4 }}>{kit.kitId ?? `KIT-${i + 1}`}</div>
                  {history.slice(0, 5).map((t: any, j: number) => {
                    const fromCol = stateColor(t.from ?? t.fromState ?? "");
                    const toCol = stateColor(t.to ?? t.toState ?? "");
                    return (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: j < history.length - 1 ? "1px solid #111b28" : "none" }}>
                        <span style={{ fontSize: 10, color: "#3b4a5a", minWidth: 60 }}>
                          {t.timestamp ? new Date(t.timestamp).toLocaleTimeString("en-US", { hour12: false }) : "—"}
                        </span>
                        <span style={S.badge(fromCol)}>{t.from ?? t.fromState ?? "?"}</span>
                        <span style={{ color: "#3b4a5a", fontSize: 10 }}>→</span>
                        <span style={S.badge(toCol)}>{t.to ?? t.toState ?? "?"}</span>
                        {t.reason && <span style={{ fontSize: 9, color: "#4a6070", flex: 1 }}>{t.reason}</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No transition history available</div>
        )}
      </div>

      {/* Autonomous Capabilities Matrix */}
      <div style={S.card}>
        <div style={S.cardTitle}>Autonomous Capabilities Matrix</div>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Capability</th>
              {ALL_STATES.map((state) => (
                <th key={state} style={{ ...S.th, textAlign: "center" as const, color: stateColor(state), fontSize: 9 }}>
                  {state.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const allCaps = new Set<string>();
              ALL_STATES.forEach((state) => {
                const caps = capabilities[state]?.capabilities ?? capabilities[state] ?? [];
                (Array.isArray(caps) ? caps : []).forEach((c: any) => {
                  allCaps.add(typeof c === "string" ? c : c.name ?? c.capability ?? "");
                });
              });
              const capList = Array.from(allCaps).filter(Boolean);
              if (capList.length === 0) {
                return (
                  <tr>
                    <td style={S.td} colSpan={ALL_STATES.length + 1}>
                      <span style={{ color: "#3b4a5a" }}>No capability data available</span>
                    </td>
                  </tr>
                );
              }
              return capList.map((capName) => (
                <tr key={capName}>
                  <td style={S.td}>{capName}</td>
                  {ALL_STATES.map((state) => {
                    const caps = capabilities[state]?.capabilities ?? capabilities[state] ?? [];
                    const arr = Array.isArray(caps) ? caps : [];
                    const found = arr.find((c: any) => (typeof c === "string" ? c : c.name ?? c.capability) === capName);
                    const available = found ? (typeof found === "string" ? true : found.available !== false) : false;
                    return (
                      <td key={state} style={{ ...S.td, textAlign: "center" as const }}>
                        <span style={{ color: available ? "#22c55e" : "#ef4444", fontSize: 13 }}>
                          {available ? "✓" : "✗"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </div>

      {/* State Predictions */}
      <div style={S.card}>
        <div style={S.cardTitle}>State Transition Predictions</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {kits.map((kit: any, i: number) => {
            const pred = predictions[kit.kitId] ?? kit.prediction;
            if (!pred) return null;
            const nextState = pred.predictedState ?? pred.nextState ?? "UNKNOWN";
            const confidence = pred.confidence ?? 0;
            const timeframe = pred.timeframeMinutes ?? pred.minutesUntil ?? null;
            const col = stateColor(nextState);
            return (
              <div key={kit.kitId ?? i} style={{
                flex: "1 1 200px", minWidth: 200, background: "#0a1220",
                border: `1px solid ${col}33`, borderRadius: 5, padding: "10px 14px",
              }}>
                <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>
                  {kit.kitId ?? `KIT-${i + 1}`}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: "#4a6070" }}>PREDICTED →</span>
                  <span style={S.badge(col)}>{stateLabel(nextState)}</span>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 9, color: "#4a6070" }}>
                  <span>Confidence: <span style={{ color: confidence >= 0.7 ? "#22c55e" : "#f59e0b" }}>{(confidence * 100).toFixed(0)}%</span></span>
                  {timeframe !== null && (
                    <span>ETA: <span style={{ color: "#c9d3e0" }}>{timeframe}m</span></span>
                  )}
                </div>
                {/* Confidence bar */}
                <div style={{ width: "100%", height: 3, background: "#111b28", borderRadius: 2, marginTop: 6 }}>
                  <div style={{ width: `${confidence * 100}%`, height: "100%", background: col, borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
          {kits.every((k: any) => !predictions[k.kitId] && !k.prediction) && (
            <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No state predictions available</div>
          )}
        </div>
      </div>

      {/* Cross-Kit Correlation Panel */}
      <div style={S.card}>
        <div style={S.cardTitle}>Cross-Kit State Correlation</div>
        {kits.length >= 2 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(() => {
              const stateGroups: Record<string, string[]> = {};
              kits.forEach((kit: any) => {
                const state = (kit.state || "UNKNOWN").toUpperCase();
                if (!stateGroups[state]) stateGroups[state] = [];
                stateGroups[state].push(kit.kitId ?? kit.name ?? "—");
              });
              return Object.entries(stateGroups).map(([state, kitIds]) => {
                const col = stateColor(state);
                return (
                  <div key={state} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: col + "08", borderRadius: 4 }}>
                    <span style={S.badge(col)}>{stateLabel(state)}</span>
                    <span style={{ fontSize: 10, color: "#c9d3e0" }}>
                      {kitIds.join(", ")}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 10, color: "#4a6070" }}>{kitIds.length} kit{kitIds.length > 1 ? "s" : ""}</span>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>Need 2+ kits for correlation analysis</div>
        )}
      </div>
    </div>
  );
}

export default OperationalState;
