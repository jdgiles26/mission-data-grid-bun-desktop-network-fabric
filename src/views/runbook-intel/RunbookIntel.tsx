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

function riskColor(risk: string): string {
  const r = (risk || "").toUpperCase();
  if (r === "CRITICAL" || r === "HIGH") return "#ef4444";
  if (r === "MEDIUM" || r === "WARNING") return "#f59e0b";
  if (r === "LOW") return "#22c55e";
  return "#3b82f6";
}

// ── Component ──────────────────────────────────────────────────────────────
export function RunbookIntel() {
  const [playbookAnalysis, setPlaybookAnalysis] = useState<any>(null);
  const [tagDependencies, setTagDependencies] = useState<any>(null);
  const [roleDependencies, setRoleDependencies] = useState<any>(null);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string | null>(null);
  const [impactAnalysis, setImpactAnalysis] = useState<any>(null);
  const [riskScore, setRiskScore] = useState<any>(null);
  const [rollbackAssessment, setRollbackAssessment] = useState<any>(null);
  const [planDescription, setPlanDescription] = useState("");
  const [executionPlan, setExecutionPlan] = useState<any>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [analysis, tags, roles] = await Promise.all([
        rpcHandlers.getPlaybookAnalysis().catch(() => null),
        rpcHandlers.getTagDependencyMap().catch(() => null),
        rpcHandlers.getRoleDependencyGraph().catch(() => null),
      ]);
      setPlaybookAnalysis(analysis);
      setTagDependencies(tags);
      setRoleDependencies(roles);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch runbook data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  // Fetch details when a playbook is selected
  const selectPlaybook = useCallback(async (name: string) => {
    setSelectedPlaybook(name);
    setImpactAnalysis(null);
    setRiskScore(null);
    setRollbackAssessment(null);
    const [impact, risk, rollback] = await Promise.all([
      rpcHandlers.getImpactAnalysis(name).catch(() => null),
      rpcHandlers.getRiskScore(name).catch(() => null),
      rpcHandlers.getRollbackAssessment(name).catch(() => null),
    ]);
    setImpactAnalysis(impact);
    setRiskScore(risk);
    setRollbackAssessment(rollback);
  }, []);

  const handleGeneratePlan = useCallback(async () => {
    if (!planDescription.trim()) return;
    setGeneratingPlan(true);
    setExecutionPlan(null);
    try {
      const plan = await rpcHandlers.suggestExecutionPlan(planDescription).catch(() => null);
      setExecutionPlan(plan);
    } finally {
      setGeneratingPlan(false);
    }
  }, [planDescription]);

  if (loading) return <div style={S.loading}>◌ LOADING RUNBOOK INTELLIGENCE...</div>;
  if (error && !playbookAnalysis) return <div style={S.error}>⚠ {error}</div>;

  const playbooks: any[] = playbookAnalysis?.playbooks ?? [];
  const tags: any[] = tagDependencies?.tags ?? tagDependencies?.dependencies ?? [];
  const roles: any[] = roleDependencies?.roles ?? roleDependencies?.chains ?? [];

  const highRiskCount = playbooks.filter((p: any) => {
    const r = (p.riskLevel ?? p.risk ?? "").toUpperCase();
    return r === "HIGH" || r === "CRITICAL";
  }).length;

  return (
    <div style={S.page}>
      {/* Header bar */}
      <div style={S.stateBar}>
        <span style={S.led(highRiskCount === 0)} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: highRiskCount === 0 ? "#22c55e" : "#f59e0b" }}>
          ANSIBLE RUNBOOK INTELLIGENCE
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

      {/* Playbook Catalog Table */}
      <div style={S.card}>
        <div style={S.cardTitle}>Playbook Catalog ({playbooks.length})</div>
        {playbooks.length > 0 ? (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Playbook</th>
                <th style={S.th}>Purpose</th>
                <th style={S.th}>Risk Level</th>
                <th style={S.th}>Last Run</th>
                <th style={S.th}>Tasks</th>
                <th style={S.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {playbooks.map((pb: any, i: number) => {
                const name = pb.name ?? pb.playbook ?? `playbook-${i + 1}`;
                const risk = pb.riskLevel ?? pb.risk ?? "LOW";
                const col = riskColor(risk);
                const isSelected = selectedPlaybook === name;
                return (
                  <tr key={i} style={{ background: isSelected ? "#0a122044" : "transparent" }}>
                    <td style={S.td}>
                      <span style={{ color: "#4a90d9", fontFamily: "monospace" }}>{name}</span>
                    </td>
                    <td style={S.td}>{pb.purpose ?? pb.description ?? "—"}</td>
                    <td style={S.td}><span style={S.badge(col)}>{risk.toUpperCase()}</span></td>
                    <td style={{ ...S.td, fontSize: 10 }}>
                      {pb.lastRun ? new Date(pb.lastRun).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "Never"}
                    </td>
                    <td style={S.td}>{pb.taskCount ?? pb.tasks ?? "—"}</td>
                    <td style={S.td}>
                      <button
                        onClick={() => selectPlaybook(name)}
                        style={{
                          background: isSelected ? "#3b82f622" : "none",
                          border: `1px solid ${isSelected ? "#3b82f644" : "#1a2535"}`,
                          color: isSelected ? "#3b82f6" : "#4a6070",
                          fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 0.5,
                        }}
                      >
                        {isSelected ? "SELECTED" : "ANALYZE"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No playbooks found</div>
        )}
      </div>

      {/* Tag Dependency Graph */}
      <div style={S.card}>
        <div style={S.cardTitle}>Tag Dependency Map</div>
        {tags.length > 0 ? (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Tag</th>
                <th style={S.th}>Dependencies</th>
                <th style={S.th}>Used By</th>
              </tr>
            </thead>
            <tbody>
              {tags.map((tag: any, i: number) => (
                <tr key={i}>
                  <td style={S.td}>
                    <span style={{ color: "#8b5cf6", fontFamily: "monospace" }}>{tag.name ?? tag.tag ?? "—"}</span>
                  </td>
                  <td style={S.td}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(tag.dependencies ?? tag.dependsOn ?? []).map((dep: string, j: number) => (
                        <span key={j} style={S.badge("#f59e0b")}>{dep}</span>
                      ))}
                      {(tag.dependencies ?? tag.dependsOn ?? []).length === 0 && (
                        <span style={{ color: "#3b4a5a", fontSize: 10 }}>None</span>
                      )}
                    </div>
                  </td>
                  <td style={S.td}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(tag.usedBy ?? tag.playbooks ?? []).map((pb: string, j: number) => (
                        <span key={j} style={{ fontSize: 10, color: "#4a90d9" }}>{pb}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No tag dependency data available</div>
        )}
      </div>

      {/* Impact Analysis + Risk Score (side by side) */}
      {selectedPlaybook && (
        <div style={S.row}>
          {/* Impact Analysis */}
          <div style={{ ...S.card, flex: 2 }}>
            <div style={S.cardTitle}>Impact Analysis: {selectedPlaybook}</div>
            {impactAnalysis ? (
              <div>
                {/* Affected VMs / Services */}
                {impactAnalysis.affectedVMs && impactAnalysis.affectedVMs.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>AFFECTED VMs</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(impactAnalysis.affectedVMs as any[]).map((vm: any, i: number) => (
                        <span key={i} style={S.badge("#f97316")}>{typeof vm === "string" ? vm : vm.name ?? vm.id}</span>
                      ))}
                    </div>
                  </div>
                )}
                {impactAnalysis.affectedServices && impactAnalysis.affectedServices.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>AFFECTED SERVICES</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(impactAnalysis.affectedServices as any[]).map((svc: any, i: number) => (
                        <span key={i} style={S.badge("#3b82f6")}>{typeof svc === "string" ? svc : svc.name ?? svc.id}</span>
                      ))}
                    </div>
                  </div>
                )}
                {impactAnalysis.downtime && (
                  <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 6 }}>
                    Estimated downtime: {impactAnalysis.downtime}
                  </div>
                )}
                {!impactAnalysis.affectedVMs && !impactAnalysis.affectedServices && (
                  <div style={{ color: "#3b4a5a", fontSize: 11 }}>No detailed impact data</div>
                )}
              </div>
            ) : (
              <div style={{ color: "#64748b", fontSize: 11 }}>Loading impact analysis...</div>
            )}
          </div>

          {/* Risk Score */}
          <div style={{ ...S.card, flex: 1 }}>
            <div style={S.cardTitle}>Risk Score</div>
            {riskScore ? (
              <div style={{ textAlign: "center" as const }}>
                <div style={{
                  fontSize: 36, fontWeight: 700, fontFamily: "monospace",
                  color: riskColor(riskScore.level ?? (riskScore.score > 70 ? "HIGH" : riskScore.score > 40 ? "MEDIUM" : "LOW")),
                  marginBottom: 8,
                }}>
                  {riskScore.score ?? riskScore.value ?? 0}
                  <span style={{ fontSize: 12, color: "#64748b" }}>/100</span>
                </div>
                <span style={S.badge(riskColor(riskScore.level ?? "LOW"))}>
                  {(riskScore.level ?? (riskScore.score > 70 ? "HIGH" : riskScore.score > 40 ? "MEDIUM" : "LOW")).toUpperCase()}
                </span>
                {riskScore.factors && (
                  <div style={{ marginTop: 10, textAlign: "left" as const }}>
                    {(riskScore.factors as any[]).map((f: any, i: number) => (
                      <div key={i} style={{ fontSize: 9, color: "#4a6070", padding: "2px 0" }}>
                        {f.name ?? f.factor}: <span style={{ color: "#c9d3e0" }}>{f.impact ?? f.score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: "#64748b", fontSize: 11 }}>Loading risk score...</div>
            )}
          </div>
        </div>
      )}

      {/* Role Dependency Chain */}
      <div style={S.card}>
        <div style={S.cardTitle}>Role Dependency Chains</div>
        {roles.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {roles.map((role: any, i: number) => {
              const name = role.name ?? role.role ?? `role-${i + 1}`;
              const deps: any[] = role.dependencies ?? role.dependsOn ?? [];
              return (
                <div key={i} style={{ background: "#0a1220", border: "1px solid #1a2535", borderRadius: 5, padding: "8px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: deps.length > 0 ? 6 : 0 }}>
                    <span style={{ color: "#8b5cf6", fontSize: 11, fontWeight: 600 }}>{name}</span>
                    {role.playbookCount != null && (
                      <span style={{ fontSize: 9, color: "#4a6070" }}>({role.playbookCount} playbooks)</span>
                    )}
                  </div>
                  {deps.length > 0 && (
                    <div style={{ paddingLeft: 12, borderLeft: "1px solid #1a2535" }}>
                      {deps.map((dep: any, j: number) => {
                        const depName = typeof dep === "string" ? dep : dep.name ?? dep.role ?? "—";
                        const subDeps: any[] = typeof dep === "object" ? (dep.dependencies ?? dep.dependsOn ?? []) : [];
                        return (
                          <div key={j}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 0" }}>
                              <span style={{ color: "#3b4a5a", fontSize: 9 }}>└</span>
                              <span style={{ fontSize: 10, color: "#4a90d9" }}>{depName}</span>
                            </div>
                            {subDeps.length > 0 && (
                              <div style={{ paddingLeft: 16 }}>
                                {subDeps.map((sd: any, k: number) => (
                                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, padding: "1px 0" }}>
                                    <span style={{ color: "#3b4a5a", fontSize: 8 }}>└</span>
                                    <span style={{ fontSize: 9, color: "#64748b" }}>{typeof sd === "string" ? sd : sd.name ?? "—"}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No role dependency data available</div>
        )}
      </div>

      {/* Execution Plan Generator */}
      <div style={S.card}>
        <div style={S.cardTitle}>Execution Plan Generator</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={planDescription}
            onChange={(e) => setPlanDescription(e.target.value)}
            placeholder="Describe the change (e.g., 'upgrade WireGuard on all kits')"
            style={{
              flex: 1, background: "#0a1220", border: "1px solid #1a2535", borderRadius: 4,
              padding: "8px 12px", color: "#c9d3e0", fontSize: 11, fontFamily: "monospace",
              outline: "none",
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleGeneratePlan(); }}
          />
          <button
            onClick={handleGeneratePlan}
            disabled={generatingPlan || !planDescription.trim()}
            style={{
              background: generatingPlan ? "#1a2535" : "#3b82f622",
              border: "1px solid #3b82f644", color: generatingPlan ? "#4a6070" : "#3b82f6",
              fontSize: 10, padding: "8px 16px", borderRadius: 4, cursor: generatingPlan ? "default" : "pointer",
              letterSpacing: 1, fontWeight: 600, whiteSpace: "nowrap" as const,
            }}
          >
            {generatingPlan ? "GENERATING..." : "GENERATE PLAN"}
          </button>
        </div>
        {executionPlan && (
          <div style={{ background: "#0a1220", border: "1px solid #1a2535", borderRadius: 4, padding: 12 }}>
            {executionPlan.steps ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(executionPlan.steps as any[]).map((step: any, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: "#3b82f6", minWidth: 20,
                      textAlign: "right" as const,
                    }}>{i + 1}.</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: "#c9d3e0" }}>{step.description ?? step.action ?? step.name ?? "—"}</div>
                      {step.playbook && <span style={{ fontSize: 9, color: "#4a90d9" }}>Playbook: {step.playbook}</span>}
                      {step.risk && (
                        <span style={{ ...S.badge(riskColor(step.risk)), marginLeft: 6 }}>{step.risk}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : executionPlan.plan ? (
              <pre style={{ fontSize: 10, color: "#c9d3e0", whiteSpace: "pre-wrap" as const, margin: 0 }}>
                {typeof executionPlan.plan === "string" ? executionPlan.plan : JSON.stringify(executionPlan.plan, null, 2)}
              </pre>
            ) : (
              <div style={{ fontSize: 10, color: "#c9d3e0" }}>{JSON.stringify(executionPlan, null, 2)}</div>
            )}
          </div>
        )}
      </div>

      {/* Rollback Assessment */}
      {selectedPlaybook && rollbackAssessment && (
        <div style={S.card}>
          <div style={S.cardTitle}>Rollback Assessment: {selectedPlaybook}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{
              flex: "1 1 150px", background: "#0a1220", border: "1px solid #1a2535",
              borderRadius: 5, padding: "10px 14px",
            }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>ROLLBACK POSSIBLE</div>
              <span style={S.badge(rollbackAssessment.possible !== false ? "#22c55e" : "#ef4444")}>
                {rollbackAssessment.possible !== false ? "YES" : "NO"}
              </span>
            </div>
            <div style={{
              flex: "1 1 150px", background: "#0a1220", border: "1px solid #1a2535",
              borderRadius: 5, padding: "10px 14px",
            }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>ROLLBACK COMPLEXITY</div>
              <span style={S.badge(riskColor(rollbackAssessment.complexity ?? "LOW"))}>
                {(rollbackAssessment.complexity ?? "LOW").toUpperCase()}
              </span>
            </div>
            <div style={{
              flex: "1 1 150px", background: "#0a1220", border: "1px solid #1a2535",
              borderRadius: 5, padding: "10px 14px",
            }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>EST. ROLLBACK TIME</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#c9d3e0", fontFamily: "monospace" }}>
                {rollbackAssessment.estimatedTime ?? rollbackAssessment.duration ?? "—"}
              </div>
            </div>
          </div>
          {rollbackAssessment.steps && rollbackAssessment.steps.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 6 }}>ROLLBACK STEPS</div>
              {(rollbackAssessment.steps as any[]).map((step: any, i: number) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 10 }}>
                  <span style={{ color: "#3b82f6", minWidth: 16, textAlign: "right" as const }}>{i + 1}.</span>
                  <span style={{ color: "#c9d3e0" }}>{typeof step === "string" ? step : step.description ?? step.action ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
          {rollbackAssessment.warnings && rollbackAssessment.warnings.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {(rollbackAssessment.warnings as any[]).map((warn: any, i: number) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                  <span style={S.badge("#f59e0b")}>WARN</span>
                  <span style={{ fontSize: 10, color: "#f59e0b" }}>{typeof warn === "string" ? warn : warn.message ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RunbookIntel;
