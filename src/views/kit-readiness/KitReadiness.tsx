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

const CHECK_GROUPS = ["PKI Material", "SSH Keys", "Addressing Plan", "Vault Secrets", "Ansible Requirements", "FIPS Compliance"] as const;

function statusBadgeColor(status: string): string {
  const s = (status || "").toUpperCase();
  if (s === "PASS" || s === "OK" || s === "READY") return "#22c55e";
  if (s === "WARN" || s === "WARNING" || s === "PARTIAL") return "#f59e0b";
  return "#ef4444";
}

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

// ── Component ──────────────────────────────────────────────────────────────
export function KitReadiness() {
  const [allValidation, setAllValidation] = useState<any>(null);
  const [selectedKit, setSelectedKit] = useState<string | null>(null);
  const [kitDetail, setKitDetail] = useState<any>(null);
  const [kitScore, setKitScore] = useState<any>(null);
  const [checklist, setChecklist] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const val = await rpcHandlers.validateAllKits().catch(() => null);
      setAllValidation(val);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch readiness data");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchKitDetail = useCallback(async (name: string) => {
    setSelectedKit(name);
    setChecklist(null);
    try {
      const [detail, score] = await Promise.all([
        rpcHandlers.validateKit(name).catch(() => null),
        rpcHandlers.getReadinessScore(name).catch(() => null),
      ]);
      setKitDetail(detail);
      setKitScore(score);
    } catch {
      setKitDetail(null);
      setKitScore(null);
    }
  }, []);

  const generateChecklist = useCallback(async (name: string) => {
    try {
      const result = await rpcHandlers.generatePreFieldChecklist(name);
      setChecklist(typeof result === "string" ? result : result?.checklist ?? result?.markdown ?? JSON.stringify(result, null, 2));
    } catch {
      setChecklist("Failed to generate checklist.");
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  if (loading) return <div style={S.loading}>VALIDATING KIT READINESS...</div>;
  if (error && !allValidation)
    return <div style={S.error}>WARNING {error}</div>;

  // -- Derive data --
  const kits: any[] = allValidation?.kits ?? [];
  const totalPass = kits.filter((k: any) => k.overallStatus === "PASS" || k.overallStatus === "READY").length;
  const totalWarn = kits.filter((k: any) => k.overallStatus === "WARN" || k.overallStatus === "WARNING").length;
  const totalFail = kits.filter((k: any) => k.overallStatus === "FAIL" || k.overallStatus === "ERROR").length;
  const overallReadyPercent = kits.length > 0 ? Math.round((totalPass / kits.length) * 100) : 0;

  // -- Kit detail checks --
  const detailChecks: any[] = kitDetail?.checks ?? [];
  const detailScore: number = kitScore?.score ?? kitScore?.readinessScore ?? 0;

  return (
    <div style={S.page}>
      {/* Header bar */}
      <div style={S.stateBar}>
        <span style={S.led(totalFail === 0)} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: totalFail === 0 ? "#22c55e" : "#ef4444" }}>
          {totalFail === 0 ? "ALL KITS READY" : `${totalFail} KIT${totalFail > 1 ? "S" : ""} NOT READY`}
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
          <div style={S.kpiLabel}>Total Kits</div>
          <div style={{ ...S.kpiValue, color: "#3b82f6" }}>{kits.length}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Pass</div>
          <div style={{ ...S.kpiValue, color: "#22c55e" }}>{totalPass}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Warn</div>
          <div style={{ ...S.kpiValue, color: "#f59e0b" }}>{totalWarn}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Fail</div>
          <div style={{ ...S.kpiValue, color: "#ef4444" }}>{totalFail}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Overall Ready</div>
          <div style={{ ...S.kpiValue, color: scoreColor(overallReadyPercent) }}>
            {overallReadyPercent}<span style={{ fontSize: 12, color: "#64748b" }}>%</span>
          </div>
        </div>
      </div>

      {/* Overall readiness summary table */}
      <div style={S.card}>
        <div style={S.cardTitle}>Readiness Summary</div>
        {kits.length === 0 ? (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No kits found for validation</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Kit</th>
                {CHECK_GROUPS.map((group) => (
                  <th key={group} style={{ ...S.th, textAlign: "center" as const }}>{group}</th>
                ))}
                <th style={{ ...S.th, textAlign: "center" as const }}>Overall</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {kits.map((kit: any, i: number) => {
                const overallCol = statusBadgeColor(kit.overallStatus);
                return (
                  <tr key={i}>
                    <td style={S.td}>
                      <span
                        style={{ color: "#4a90d9", cursor: "pointer", textDecoration: "underline" }}
                        onClick={() => fetchKitDetail(kit.name ?? kit.kitId)}
                      >{kit.name ?? kit.kitId ?? `KIT-${i + 1}`}</span>
                    </td>
                    {CHECK_GROUPS.map((group) => {
                      const groupStatus = kit.groups?.[group] ?? kit.checkGroups?.[group] ?? "UNKNOWN";
                      return (
                        <td key={group} style={{ ...S.td, textAlign: "center" as const }}>
                          <span style={S.badge(statusBadgeColor(groupStatus))}>{groupStatus}</span>
                        </td>
                      );
                    })}
                    <td style={{ ...S.td, textAlign: "center" as const }}>
                      <span style={S.badge(overallCol)}>{kit.overallStatus ?? "UNKNOWN"}</span>
                    </td>
                    <td style={S.td}>
                      <button
                        onClick={() => fetchKitDetail(kit.name ?? kit.kitId)}
                        style={{ background: "none", border: "1px solid #1a2535", color: "#4a6070", fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1 }}
                      >DETAIL</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Check group sections */}
      {CHECK_GROUPS.map((group) => {
        const groupKits = kits.filter((k: any) => {
          const status = k.groups?.[group] ?? k.checkGroups?.[group];
          return status && status !== "PASS" && status !== "OK" && status !== "READY";
        });
        if (groupKits.length === 0) return null;
        return (
          <div key={group} style={S.card}>
            <div style={S.cardTitle}>{group} - Issues ({groupKits.length} kits)</div>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Kit</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Details</th>
                </tr>
              </thead>
              <tbody>
                {groupKits.map((kit: any, i: number) => {
                  const status = kit.groups?.[group] ?? kit.checkGroups?.[group] ?? "UNKNOWN";
                  const details = kit.groupDetails?.[group] ?? kit.issues?.[group] ?? "—";
                  return (
                    <tr key={i}>
                      <td style={S.td}><span style={{ color: "#4a90d9" }}>{kit.name ?? kit.kitId}</span></td>
                      <td style={S.td}><span style={S.badge(statusBadgeColor(status))}>{status}</span></td>
                      <td style={{ ...S.td, fontSize: 10, color: "#4a6070" }}>{typeof details === "string" ? details : JSON.stringify(details)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Selected kit detail card */}
      {selectedKit && (
        <div style={{ ...S.card, border: "1px solid #3b82f644" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={S.cardTitle}>Kit Detail: {selectedKit}</div>
            <button
              onClick={() => { setSelectedKit(null); setKitDetail(null); setKitScore(null); setChecklist(null); }}
              style={{ background: "none", border: "1px solid #1a2535", color: "#4a6070", fontSize: 10, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}
            >CLOSE</button>
          </div>

          {/* Score gauge */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <div style={{ position: "relative", width: 80, height: 80 }}>
              <svg viewBox="0 0 36 36" style={{ width: 80, height: 80, transform: "rotate(-90deg)" }}>
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#111b28"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke={scoreColor(detailScore)}
                  strokeWidth="3"
                  strokeDasharray={`${detailScore}, 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 16, fontWeight: 700, color: scoreColor(detailScore), fontFamily: "monospace" }}>
                {detailScore}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#c9d3e0", marginBottom: 4 }}>Readiness Score</div>
              <div style={{ fontSize: 10, color: "#4a6070" }}>
                {detailScore >= 80 ? "Kit is field-ready" : detailScore >= 60 ? "Kit needs attention before deployment" : "Kit is not ready for field deployment"}
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => generateChecklist(selectedKit)}
              style={{ background: "#1a253588", border: "1px solid #3b82f644", color: "#3b82f6", fontSize: 10, padding: "6px 14px", borderRadius: 4, cursor: "pointer", letterSpacing: 1, fontWeight: 600 }}
            >GENERATE PRE-FIELD CHECKLIST</button>
          </div>

          {/* Detail checks */}
          {detailChecks.length > 0 && (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Check</th>
                  <th style={S.th}>Group</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Message</th>
                </tr>
              </thead>
              <tbody>
                {detailChecks.map((check: any, i: number) => (
                  <tr key={i}>
                    <td style={S.td}>{check.name ?? check.check ?? "—"}</td>
                    <td style={{ ...S.td, fontSize: 10 }}>{check.group ?? "—"}</td>
                    <td style={S.td}><span style={S.badge(statusBadgeColor(check.status))}>{check.status ?? "UNKNOWN"}</span></td>
                    <td style={{ ...S.td, fontSize: 10, color: "#4a6070" }}>{check.message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Generated checklist */}
          {checklist && (
            <div style={{ marginTop: 16 }}>
              <div style={{ ...S.cardTitle, marginBottom: 8 }}>Pre-Field Checklist</div>
              <pre style={{ background: "#0a1220", border: "1px solid #1a2535", borderRadius: 4, padding: 12, fontSize: 11, color: "#c9d3e0", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflow: "auto", lineHeight: 1.6 }}>
                {checklist}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
