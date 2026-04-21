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

function threatLevelColor(level: string): string {
  const l = (level || "").toUpperCase();
  if (l === "CRITICAL" || l === "HIGH") return "#ef4444";
  if (l === "MEDIUM" || l === "ELEVATED") return "#f59e0b";
  if (l === "LOW" || l === "MINIMAL") return "#22c55e";
  return "#3b82f6";
}

function severityColor(sev: string): string {
  const s = (sev || "").toUpperCase();
  if (s === "CRITICAL") return "#ef4444";
  if (s === "HIGH") return "#f97316";
  if (s === "MEDIUM" || s === "WARNING") return "#f59e0b";
  if (s === "LOW" || s === "INFO") return "#3b82f6";
  return "#64748b";
}

// ── Component ──────────────────────────────────────────────────────────────
export function ThreatIntel() {
  const [overview, setOverview] = useState<any>(null);
  const [timeline, setTimeline] = useState<any>(null);
  const [sshPatterns, setSshPatterns] = useState<any>(null);
  const [iocSummary, setIocSummary] = useState<any>(null);
  const [correlations, setCorrelations] = useState<any>(null);
  const [kitScores, setKitScores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [ov, tl, ssh, ioc, corr] = await Promise.all([
        rpcHandlers.getThreatOverview().catch(() => null),
        rpcHandlers.getThreatTimeline(24).catch(() => null),
        rpcHandlers.analyzeSSHPatterns().catch(() => null),
        rpcHandlers.getIOCSummary().catch(() => null),
        rpcHandlers.correlateEvents().catch(() => null),
      ]);
      setOverview(ov);
      setTimeline(tl);
      setSshPatterns(ssh);
      setIocSummary(ioc);
      setCorrelations(corr);

      // Fetch per-kit threat scores from overview kit list
      const kitList: any[] = ov?.kits ?? [];
      if (kitList.length > 0) {
        const scores = await Promise.all(
          kitList.map(async (kit: any) => {
            try {
              const score = await rpcHandlers.getKitThreatScore(kit.id ?? kit.kitId);
              return { kit: kit.name ?? kit.id ?? kit.kitId, ...score };
            } catch {
              return { kit: kit.name ?? kit.id ?? kit.kitId, score: null };
            }
          })
        );
        setKitScores(scores);
      }

      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch threat intelligence");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  if (loading) return <div style={S.loading}>LOADING THREAT INTELLIGENCE...</div>;
  if (error && !overview && !timeline)
    return <div style={S.error}>WARNING {error}</div>;

  // -- Derive KPIs --
  const overallThreat: string = overview?.overallThreatLevel ?? "UNKNOWN";
  const activeIOCs: number = overview?.activeIOCs ?? iocSummary?.totalActive ?? 0;
  const correlatedEvents: number = overview?.correlatedEvents ?? correlations?.totalCorrelations ?? 0;
  const sshAttackCount: number = overview?.sshAttackCount ?? sshPatterns?.totalAttempts ?? 0;
  const threatOk = overallThreat === "LOW" || overallThreat === "MINIMAL" || overallThreat === "NONE";

  // -- Timeline events --
  const timelineEvents: any[] = timeline?.events ?? [];

  // -- IOC entries --
  const iocEntries: any[] = iocSummary?.indicators ?? [];

  // -- SSH analysis --
  const sshSources: any[] = sshPatterns?.topSources ?? [];
  const sshMethods: any[] = sshPatterns?.attackMethods ?? [];

  // -- Correlation results --
  const correlationEntries: any[] = correlations?.correlations ?? [];

  return (
    <div style={S.page}>
      {/* Header bar */}
      <div style={S.stateBar}>
        <span style={S.led(threatOk)} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: threatLevelColor(overallThreat) }}>
          THREAT LEVEL: {overallThreat}
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
          <div style={S.kpiLabel}>Overall Threat</div>
          <div style={{ ...S.kpiValue, fontSize: 16, color: threatLevelColor(overallThreat) }}>{overallThreat}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Active IOCs</div>
          <div style={{ ...S.kpiValue, color: activeIOCs > 0 ? "#ef4444" : "#22c55e" }}>{activeIOCs}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Correlated Events</div>
          <div style={{ ...S.kpiValue, color: "#a78bfa" }}>{correlatedEvents}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>SSH Attacks</div>
          <div style={{ ...S.kpiValue, color: sshAttackCount > 0 ? "#f59e0b" : "#22c55e" }}>{sshAttackCount}</div>
        </div>
      </div>

      {/* Threat timeline */}
      <div style={S.card}>
        <div style={S.cardTitle}>Threat Timeline (last 24h) ({timelineEvents.length} events)</div>
        {timelineEvents.length === 0 ? (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No threat events in the last 24 hours</div>
        ) : (
          <div style={{ maxHeight: 300, overflow: "auto" }}>
            {timelineEvents.map((event: any, i: number) => {
              const sev = event.severity ?? event.level ?? "INFO";
              const col = severityColor(sev);
              return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0", borderBottom: i < timelineEvents.length - 1 ? "1px solid #111b28" : "none" }}>
                  <span style={{ fontSize: 10, color: "#3b4a5a", flexShrink: 0, minWidth: 60, fontFamily: "monospace" }}>
                    {event.timestamp ? new Date(event.timestamp).toLocaleTimeString("en-US", { hour12: false }) : "—"}
                  </span>
                  <span style={S.badge(col)}>{(sev || "").toUpperCase()}</span>
                  <span style={{ flex: 1, fontSize: 11, color: "#c9d3e0" }}>{event.description ?? event.message ?? "—"}</span>
                  {event.source && (
                    <span style={{ fontSize: 10, color: "#4a6070", fontFamily: "monospace", flexShrink: 0 }}>{event.source}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Per-kit threat scores */}
      {kitScores.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Kit Threat Scores</div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Kit</th>
                <th style={S.th}>Threat Score</th>
                <th style={S.th}>Level</th>
                <th style={S.th}>Active Threats</th>
                <th style={S.th}>Last Incident</th>
              </tr>
            </thead>
            <tbody>
              {kitScores.map((ks: any, i: number) => {
                const score: number = ks.score ?? ks.threatScore ?? 0;
                const level = ks.level ?? ks.threatLevel ?? (score > 70 ? "HIGH" : score > 40 ? "MEDIUM" : "LOW");
                const col = threatLevelColor(level);
                return (
                  <tr key={i}>
                    <td style={S.td}><span style={{ color: "#4a90d9" }}>{ks.kit}</span></td>
                    <td style={S.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 60, height: 4, background: "#111b28", borderRadius: 2 }}>
                          <div style={{ width: `${Math.min(score, 100)}%`, height: 4, background: col, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontFamily: "monospace", color: col, fontWeight: 600 }}>{score}</span>
                      </div>
                    </td>
                    <td style={S.td}><span style={S.badge(col)}>{level}</span></td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{ks.activeThreats ?? 0}</td>
                    <td style={{ ...S.td, fontSize: 10, color: "#4a6070" }}>
                      {ks.lastIncident ? new Date(ks.lastIncident).toLocaleString("en-US", { hour12: false }) : "None"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* SSH Pattern Analysis */}
      <div style={S.card}>
        <div style={S.cardTitle}>SSH Pattern Analysis</div>
        <div style={{ display: "flex", gap: 16 }}>
          {/* Top sources */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#4a6070", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" as const }}>Top Attack Sources</div>
            {sshSources.length === 0 ? (
              <div style={{ color: "#3b4a5a", fontSize: 11 }}>No SSH attack sources detected</div>
            ) : (
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Source IP</th>
                    <th style={S.th}>Attempts</th>
                    <th style={S.th}>Country</th>
                  </tr>
                </thead>
                <tbody>
                  {sshSources.slice(0, 10).map((src: any, i: number) => (
                    <tr key={i}>
                      <td style={{ ...S.td, fontFamily: "monospace", color: "#ef4444" }}>{src.ip ?? src.source ?? "—"}</td>
                      <td style={{ ...S.td, fontFamily: "monospace" }}>{src.attempts ?? src.count ?? "—"}</td>
                      <td style={{ ...S.td, fontSize: 10 }}>{src.country ?? src.geo ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Attack methods */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#4a6070", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" as const }}>Attack Methods</div>
            {sshMethods.length === 0 ? (
              <div style={{ color: "#3b4a5a", fontSize: 11 }}>No attack methods detected</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sshMethods.map((method: any, i: number) => {
                  const count: number = method.count ?? method.attempts ?? 0;
                  const maxCount = Math.max(...sshMethods.map((m: any) => m.count ?? m.attempts ?? 0), 1);
                  return (
                    <div key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 2 }}>
                        <span style={{ color: "#c9d3e0" }}>{method.method ?? method.name ?? "—"}</span>
                        <span style={{ color: "#4a6070", fontFamily: "monospace" }}>{count}</span>
                      </div>
                      <div style={{ height: 3, background: "#111b28", borderRadius: 2 }}>
                        <div style={{ height: 3, background: "#f59e0b", borderRadius: 2, width: `${(count / maxCount) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* IOC Summary */}
      <div style={S.card}>
        <div style={S.cardTitle}>Indicators of Compromise ({iocEntries.length})</div>
        {iocEntries.length === 0 ? (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No active IOCs detected</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Type</th>
                <th style={S.th}>Indicator</th>
                <th style={S.th}>First Seen</th>
                <th style={S.th}>Last Seen</th>
                <th style={S.th}>Severity</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {iocEntries.map((ioc: any, i: number) => {
                const sevCol = severityColor(ioc.severity ?? "INFO");
                const statusCol = (ioc.status || "").toUpperCase() === "ACTIVE" ? "#ef4444" : (ioc.status || "").toUpperCase() === "RESOLVED" ? "#22c55e" : "#f59e0b";
                return (
                  <tr key={i}>
                    <td style={S.td}><span style={S.badge("#3b82f6")}>{ioc.type ?? "—"}</span></td>
                    <td style={{ ...S.td, fontFamily: "monospace", fontSize: 10, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {ioc.indicator ?? ioc.value ?? "—"}
                    </td>
                    <td style={{ ...S.td, fontSize: 10, color: "#4a6070" }}>
                      {ioc.firstSeen ? new Date(ioc.firstSeen).toLocaleString("en-US", { hour12: false }) : "—"}
                    </td>
                    <td style={{ ...S.td, fontSize: 10, color: "#4a6070" }}>
                      {ioc.lastSeen ? new Date(ioc.lastSeen).toLocaleString("en-US", { hour12: false }) : "—"}
                    </td>
                    <td style={S.td}><span style={S.badge(sevCol)}>{(ioc.severity || "UNKNOWN").toUpperCase()}</span></td>
                    <td style={S.td}><span style={S.badge(statusCol)}>{(ioc.status || "UNKNOWN").toUpperCase()}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Correlation results */}
      <div style={S.card}>
        <div style={S.cardTitle}>Event Correlations ({correlationEntries.length})</div>
        {correlationEntries.length === 0 ? (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No multi-event correlations detected</div>
        ) : (
          <div style={{ maxHeight: 250, overflow: "auto" }}>
            {correlationEntries.map((corr: any, i: number) => {
              const severity = corr.severity ?? corr.level ?? "INFO";
              const col = severityColor(severity);
              const eventCount: number = corr.events?.length ?? corr.eventCount ?? 0;
              return (
                <div key={i} style={{ padding: "10px 12px", marginBottom: 8, background: "#0a1220", border: `1px solid ${col}33`, borderRadius: 5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#c9d3e0" }}>{corr.title ?? corr.name ?? `Correlation #${i + 1}`}</span>
                    <span style={S.badge(col)}>{(severity || "").toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#4a6070", marginBottom: 4 }}>{corr.description ?? "—"}</div>
                  <div style={{ display: "flex", gap: 16, fontSize: 10, color: "#3b4a5a" }}>
                    <span>Events: <span style={{ color: "#c9d3e0", fontFamily: "monospace" }}>{eventCount}</span></span>
                    <span>Confidence: <span style={{ color: "#c9d3e0", fontFamily: "monospace" }}>{corr.confidence != null ? `${(corr.confidence * 100).toFixed(0)}%` : "—"}</span></span>
                    {corr.timespan && <span>Timespan: <span style={{ color: "#c9d3e0" }}>{corr.timespan}</span></span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
