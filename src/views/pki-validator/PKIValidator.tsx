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

function expiryColor(daysUntil: number): string {
  if (daysUntil <= 30) return "#ef4444";
  if (daysUntil <= 60) return "#f59e0b";
  if (daysUntil <= 90) return "#3b82f6";
  return "#22c55e";
}

function statusColor(valid: boolean | string): string {
  if (valid === true || valid === "VALID" || valid === "ACTIVE") return "#22c55e";
  if (valid === "EXPIRING") return "#f59e0b";
  return "#ef4444";
}

// ── Component ──────────────────────────────────────────────────────────────
export function PKIValidator() {
  const [inventory, setInventory] = useState<any>(null);
  const [trustHealth, setTrustHealth] = useState<any>(null);
  const [expiryAlerts, setExpiryAlerts] = useState<any>(null);
  const [revocationStatus, setRevocationStatus] = useState<any>(null);
  const [crossKitTrust, setCrossKitTrust] = useState<any>(null);
  const [chainValidations, setChainValidations] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [inv, health, expiry, revocation, trust] = await Promise.all([
        rpcHandlers.getCertificateInventory().catch(() => null),
        rpcHandlers.getTrustModelHealth().catch(() => null),
        rpcHandlers.getExpiryAlerts().catch(() => null),
        rpcHandlers.getRevocationStatus().catch(() => null),
        rpcHandlers.validateCrossKitTrust().catch(() => null),
      ]);

      setInventory(inv);
      setTrustHealth(health);
      setExpiryAlerts(expiry);
      setRevocationStatus(revocation);
      setCrossKitTrust(trust);

      // Validate chains for each kit found in inventory
      const kitNames: string[] = inv?.kits?.map((k: any) => k.kitName ?? k.name) ?? [];
      if (kitNames.length > 0) {
        const validations = await Promise.all(
          kitNames.map(async (name) => {
            const r = await rpcHandlers.validateChain(name).catch(() => null);
            return [name, r] as const;
          })
        );
        setChainValidations(Object.fromEntries(validations));
      }

      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch PKI data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  if (loading) return <div style={S.loading}>◌ LOADING PKI DATA...</div>;
  if (error && !inventory) return <div style={S.error}>⚠ {error}</div>;

  const certs: any[] = inventory?.certificates ?? inventory?.certs ?? [];
  const kits: any[] = inventory?.kits ?? [];
  const totalCerts = certs.length || (inventory?.totalCertificates ?? 0);
  const validChains = inventory?.validChains ?? kits.filter((k: any) => k.chainValid !== false).length;
  const expiring30d = expiryAlerts?.expiring30d ?? certs.filter((c: any) => (c.daysUntilExpiry ?? 999) <= 30).length;
  const revokedKits = revocationStatus?.revokedCount ?? revocationStatus?.revoked?.length ?? 0;
  const healthScore = trustHealth?.score ?? trustHealth?.overallScore ?? 0;
  const healthOk = healthScore >= 80;

  // Build hierarchy
  const rootCAs: any[] = inventory?.hierarchy?.rootCAs ?? inventory?.rootCAs ?? [];
  const intermediateCAs: any[] = inventory?.hierarchy?.intermediateCAs ?? inventory?.intermediateCAs ?? [];

  return (
    <div style={S.page}>
      {/* Header bar */}
      <div style={S.stateBar}>
        <span style={S.led(healthOk)} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: healthOk ? "#22c55e" : "#ef4444" }}>
          PKI CHAIN VALIDATOR
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
          <div style={S.kpiLabel}>Total Certificates</div>
          <div style={{ ...S.kpiValue, color: "#3b82f6" }}>{totalCerts}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Valid Chains</div>
          <div style={{ ...S.kpiValue, color: "#22c55e" }}>{validChains}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Expiring (30d)</div>
          <div style={{ ...S.kpiValue, color: expiring30d > 0 ? "#ef4444" : "#22c55e" }}>{expiring30d}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Revoked Kits</div>
          <div style={{ ...S.kpiValue, color: revokedKits > 0 ? "#ef4444" : "#22c55e" }}>{revokedKits}</div>
        </div>
      </div>

      {/* PKI Hierarchy Visualization */}
      <div style={S.card}>
        <div style={S.cardTitle}>PKI Hierarchy</div>
        {(rootCAs.length > 0 || intermediateCAs.length > 0 || kits.length > 0) ? (
          <div style={{ paddingLeft: 0 }}>
            {/* Root CAs */}
            {rootCAs.map((root: any, i: number) => (
              <div key={`root-${i}`} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#22c55e11", border: "1px solid #22c55e33", borderRadius: 4 }}>
                  <span style={{ color: "#22c55e", fontSize: 12 }}>◆</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>ROOT CA</span>
                  <span style={{ fontSize: 10, color: "#c9d3e0" }}>{root.subject ?? root.name ?? `Root-${i + 1}`}</span>
                  <span style={{ flex: 1 }} />
                  <span style={S.badge(statusColor(root.valid ?? root.status ?? true))}>{root.valid !== false ? "VALID" : "INVALID"}</span>
                </div>

                {/* Intermediate CAs under this root */}
                <div style={{ paddingLeft: 24, borderLeft: "1px solid #1a2535", marginLeft: 16, marginTop: 4 }}>
                  {(root.intermediates ?? intermediateCAs).map((inter: any, j: number) => (
                    <div key={`inter-${j}`} style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#3b82f611", border: "1px solid #3b82f633", borderRadius: 4 }}>
                        <span style={{ color: "#3b82f6", fontSize: 10 }}>◇</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#3b82f6" }}>INTERMEDIATE CA</span>
                        <span style={{ fontSize: 10, color: "#c9d3e0" }}>{inter.subject ?? inter.name ?? `Inter-${j + 1}`}</span>
                      </div>

                      {/* Kit CAs under this intermediate */}
                      <div style={{ paddingLeft: 24, borderLeft: "1px solid #111b28", marginLeft: 16, marginTop: 2 }}>
                        {(inter.kitCAs ?? kits.filter((k: any) => k.issuedBy === inter.name || !inter.name)).slice(0, 5).map((kit: any, k: number) => (
                          <div key={`kit-${k}`} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", fontSize: 10 }}>
                            <span style={{ color: "#64748b", fontSize: 8 }}>○</span>
                            <span style={{ color: "#4a90d9" }}>{kit.kitName ?? kit.name ?? `Kit-${k + 1}`}</span>
                            {kit.daysUntilExpiry != null && (
                              <span style={{ color: expiryColor(kit.daysUntilExpiry), fontSize: 9 }}>
                                {kit.daysUntilExpiry}d
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {rootCAs.length === 0 && kits.length > 0 && (
              <div style={{ color: "#4a6070", fontSize: 10, padding: "4px 0" }}>Hierarchy data not available — showing flat inventory below</div>
            )}
          </div>
        ) : (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No PKI hierarchy data available</div>
        )}
      </div>

      {/* Certificate Inventory Table */}
      <div style={S.card}>
        <div style={S.cardTitle}>Certificate Inventory ({totalCerts})</div>
        {certs.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Kit</th>
                  <th style={S.th}>Type</th>
                  <th style={S.th}>Subject</th>
                  <th style={S.th}>Issuer</th>
                  <th style={S.th}>Expiry</th>
                  <th style={S.th}>Days Left</th>
                  <th style={S.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {certs.map((cert: any, i: number) => {
                  const days = cert.daysUntilExpiry ?? cert.daysLeft ?? null;
                  const valid = cert.isValid ?? cert.valid ?? cert.status === "VALID";
                  const col = valid ? (days !== null ? expiryColor(days) : "#22c55e") : "#ef4444";
                  return (
                    <tr key={cert.id ?? i}>
                      <td style={S.td}><span style={{ color: "#4a90d9" }}>{cert.kitName ?? cert.kit ?? "—"}</span></td>
                      <td style={S.td}><span style={{ color: "#64748b" }}>{cert.type ?? cert.certType ?? "X.509"}</span></td>
                      <td style={{ ...S.td, fontSize: 10, fontFamily: "monospace" }}>{cert.subject ?? "—"}</td>
                      <td style={{ ...S.td, fontSize: 10, fontFamily: "monospace" }}>{cert.issuer ?? "—"}</td>
                      <td style={{ ...S.td, fontSize: 10 }}>
                        {cert.notAfter ? new Date(cert.notAfter).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                      </td>
                      <td style={S.td}>
                        {days !== null ? (
                          <span style={{ color: expiryColor(days), fontWeight: 600 }}>{days}d</span>
                        ) : "—"}
                      </td>
                      <td style={S.td}><span style={S.badge(col)}>{valid ? "VALID" : "INVALID"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No certificates in inventory</div>
        )}
      </div>

      {/* Expiry Alerts */}
      <div style={S.card}>
        <div style={S.cardTitle}>Certificate Expiry Alerts</div>
        {expiryAlerts?.alerts && expiryAlerts.alerts.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(expiryAlerts.alerts as any[]).map((alert: any, i: number) => {
              const days = alert.daysUntilExpiry ?? alert.daysLeft ?? 0;
              const col = expiryColor(days);
              const urgency = days <= 30 ? "CRITICAL" : days <= 60 ? "WARNING" : "INFO";
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                  background: col + "08", borderRadius: 4, border: `1px solid ${col}22`,
                }}>
                  <span style={S.badge(col)}>{urgency}</span>
                  <span style={{ fontSize: 11, color: "#c9d3e0", flex: 1 }}>
                    {alert.kitName ?? alert.kit ?? "—"}: {alert.subject ?? alert.description ?? "Certificate expiring"}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: col }}>{days}d</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: "#22c55e", fontSize: 11, padding: "8px 0" }}>No certificates expiring within 90 days</div>
        )}
      </div>

      <div style={S.row}>
        {/* Trust Model Health Score */}
        <div style={{ ...S.card, flex: 1 }}>
          <div style={S.cardTitle}>Trust Model Health</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Gauge */}
            <div style={{
              width: 80, height: 80, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: `conic-gradient(${healthOk ? "#22c55e" : healthScore >= 50 ? "#f59e0b" : "#ef4444"} ${healthScore * 3.6}deg, #111b28 0deg)`,
            }}>
              <div style={{
                width: 60, height: 60, borderRadius: "50%", background: "#0d1520",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: healthOk ? "#22c55e" : healthScore >= 50 ? "#f59e0b" : "#ef4444", fontFamily: "monospace" }}>
                  {healthScore}
                </span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: healthOk ? "#22c55e" : "#f59e0b", marginBottom: 4 }}>
                {healthOk ? "HEALTHY" : healthScore >= 50 ? "DEGRADED" : "CRITICAL"}
              </div>
              {trustHealth?.details && (
                <div style={{ fontSize: 9, color: "#4a6070" }}>
                  {(trustHealth.details as any[]).slice(0, 3).map((d: any, i: number) => (
                    <div key={i}>{d.label ?? d.metric}: {d.value ?? d.score}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cross-Kit Trust Matrix */}
        <div style={{ ...S.card, flex: 2 }}>
          <div style={S.cardTitle}>Cross-Kit Trust</div>
          {crossKitTrust?.matrix && crossKitTrust.matrix.length > 0 ? (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Kit</th>
                  {(crossKitTrust.kitNames ?? crossKitTrust.matrix.map((r: any) => r.kitName ?? r.name)).map((name: string, i: number) => (
                    <th key={i} style={{ ...S.th, textAlign: "center" as const, fontSize: 9 }}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(crossKitTrust.matrix as any[]).map((row: any, i: number) => {
                  const name = row.kitName ?? row.name ?? `Kit-${i + 1}`;
                  const trustValues: any[] = row.trusts ?? row.values ?? [];
                  return (
                    <tr key={i}>
                      <td style={S.td}><span style={{ color: "#4a90d9" }}>{name}</span></td>
                      {trustValues.map((val: any, j: number) => {
                        const trusted = typeof val === "boolean" ? val : val?.trusted !== false;
                        return (
                          <td key={j} style={{ ...S.td, textAlign: "center" as const }}>
                            {i === j ? (
                              <span style={{ color: "#3b4a5a" }}>--</span>
                            ) : (
                              <span style={{ color: trusted ? "#22c55e" : "#ef4444", fontSize: 13 }}>
                                {trusted ? "✓" : "✗"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No cross-kit trust data available</div>
          )}
        </div>
      </div>

      {/* Revocation Status */}
      <div style={S.card}>
        <div style={S.cardTitle}>Revocation Status</div>
        {revocationStatus?.kits && revocationStatus.kits.length > 0 ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(revocationStatus.kits as any[]).map((kit: any, i: number) => {
              const revoked = kit.revoked ?? kit.status === "REVOKED";
              const col = revoked ? "#ef4444" : "#22c55e";
              return (
                <div key={i} style={{
                  background: "#0a1220", border: `1px solid ${col}33`, borderRadius: 5,
                  padding: "8px 14px", minWidth: 120,
                }}>
                  <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>{kit.kitName ?? kit.name ?? `Kit-${i + 1}`}</div>
                  <span style={S.badge(col)}>{revoked ? "REVOKED" : "ACTIVE"}</span>
                  {kit.revokedAt && (
                    <div style={{ fontSize: 8, color: "#4a6070", marginTop: 3 }}>
                      {new Date(kit.revokedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ color: "#22c55e", fontSize: 11, padding: "8px 0" }}>No revocation data — all kits active</div>
        )}
      </div>
    </div>
  );
}

export default PKIValidator;
