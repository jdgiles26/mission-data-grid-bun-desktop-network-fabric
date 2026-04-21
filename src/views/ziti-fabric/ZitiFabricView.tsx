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

function routerStatusColor(status: string): string {
  const s = (status || "").toUpperCase();
  if (s === "ONLINE" || s === "HEALTHY") return "#22c55e";
  if (s === "DEGRADED" || s === "WARNING") return "#f59e0b";
  return "#ef4444";
}

// ── Component ──────────────────────────────────────────────────────────────
export function ZitiFabricView() {
  const [fabricOverview, setFabricOverview] = useState<any>(null);
  const [routerHealth, setRouterHealth] = useState<any>(null);
  const [planeIsolation, setPlaneIsolation] = useState<any>(null);
  const [linkCosts, setLinkCosts] = useState<any>(null);
  const [failureImpact, setFailureImpact] = useState<any>(null);
  const [selectedRouterType, setSelectedRouterType] = useState<string>("local-fabric");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [fo, rh, pi, lc] = await Promise.all([
        rpcHandlers.getFabricOverview().catch(() => null),
        rpcHandlers.getRouterHealth().catch(() => null),
        rpcHandlers.getPlaneIsolationStatus().catch(() => null),
        rpcHandlers.getFabricLinkCosts().catch(() => null),
      ]);
      setFabricOverview(fo);
      setRouterHealth(rh);
      setPlaneIsolation(pi);
      setLinkCosts(lc);
      setError(null);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch Ziti fabric data");
    } finally {
      setLoading(false);
    }
  }, []);

  const analyzeFailure = useCallback(async (routerType: string) => {
    try {
      const impact = await rpcHandlers.analyzeRouterFailureImpact(routerType);
      setFailureImpact(impact);
    } catch {
      setFailureImpact({ error: "Failed to analyze failure impact" });
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 30000);
    return () => clearInterval(t);
  }, [fetchAll]);

  if (loading) return <div style={S.loading}>LOADING ZITI FABRIC STATUS...</div>;
  if (error && !fabricOverview && !routerHealth)
    return <div style={S.error}>WARNING {error}</div>;

  // -- Derive KPIs --
  const totalRouters: number = fabricOverview?.totalRouters ?? 0;
  const healthyRouters: number = fabricOverview?.healthyRouters ?? 0;
  const fabricLinks: number = fabricOverview?.fabricLinks ?? 0;
  const federationStatus: string = fabricOverview?.controllerFederationStatus ?? "UNKNOWN";
  const allHealthy = totalRouters > 0 && healthyRouters === totalRouters;

  // -- Three-plane status --
  const planes = [
    { id: "local-fabric", label: "Local Fabric", data: planeIsolation?.localFabric },
    { id: "mesh-fabric", label: "Mesh Fabric", data: planeIsolation?.meshFabric },
    { id: "hq-fabric", label: "HQ Fabric", data: planeIsolation?.hqFabric },
  ];

  // -- Router health by kit --
  const routerKits: any[] = routerHealth?.kits ?? [];

  // -- Link costs --
  const linkEntries: any[] = linkCosts?.links ?? [];

  // -- Failure impact --
  const impactServices: any[] = failureImpact?.affectedServices ?? [];
  const impactDescription: string = failureImpact?.description ?? "";

  return (
    <div style={S.page}>
      {/* Header bar */}
      <div style={S.stateBar}>
        <span style={S.led(allHealthy)} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: allHealthy ? "#22c55e" : "#f59e0b" }}>
          {allHealthy ? "FABRIC HEALTHY" : "FABRIC DEGRADED"}
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
          <div style={S.kpiLabel}>Total Routers</div>
          <div style={{ ...S.kpiValue, color: "#3b82f6" }}>{totalRouters}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Healthy Routers</div>
          <div style={{ ...S.kpiValue, color: allHealthy ? "#22c55e" : "#f59e0b" }}>{healthyRouters}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Fabric Links</div>
          <div style={{ ...S.kpiValue, color: "#a78bfa" }}>{fabricLinks}</div>
        </div>
        <div style={S.kpiBox}>
          <div style={S.kpiLabel}>Federation Status</div>
          <div style={{ ...S.kpiValue, fontSize: 14, color: federationStatus === "HEALTHY" || federationStatus === "ACTIVE" ? "#22c55e" : "#f59e0b" }}>
            {federationStatus}
          </div>
        </div>
      </div>

      {/* Three-plane status panel */}
      <div style={S.card}>
        <div style={S.cardTitle}>Three-Plane Fabric Status</div>
        <div style={{ display: "flex", gap: 12 }}>
          {planes.map((plane) => {
            const status = plane.data?.status ?? "UNKNOWN";
            const healthy = status === "HEALTHY" || status === "ONLINE";
            const isolated = plane.data?.isolated === true;
            const routerCount = plane.data?.routerCount ?? 0;
            const linkCount = plane.data?.linkCount ?? 0;
            const borderColor = isolated ? "#ef4444" : healthy ? "#22c55e" : "#f59e0b";
            return (
              <div key={plane.id} style={{ flex: 1, background: "#0a1220", border: `1px solid ${borderColor}44`, borderRadius: 6, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={S.led(healthy && !isolated)} />
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: borderColor }}>{plane.label.toUpperCase()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#4a6070", marginBottom: 6 }}>
                  <span>Status</span>
                  <span style={S.badge(borderColor)}>{isolated ? "ISOLATED" : status}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#4a6070", marginBottom: 4 }}>
                  <span>Routers</span>
                  <span style={{ color: "#c9d3e0", fontFamily: "monospace" }}>{routerCount}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#4a6070" }}>
                  <span>Links</span>
                  <span style={{ color: "#c9d3e0", fontFamily: "monospace" }}>{linkCount}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Router health table per kit */}
      <div style={S.card}>
        <div style={S.cardTitle}>Router Health by Kit ({routerKits.length} kits)</div>
        {routerKits.length === 0 ? (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No router health data available</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Kit</th>
                <th style={S.th}>Local Fabric Router</th>
                <th style={S.th}>Mesh Fabric Router</th>
                <th style={S.th}>HQ Fabric Router</th>
                <th style={S.th}>Overall</th>
              </tr>
            </thead>
            <tbody>
              {routerKits.map((kit: any, i: number) => {
                const localStatus = kit.localFabric?.status ?? "UNKNOWN";
                const meshStatus = kit.meshFabric?.status ?? "UNKNOWN";
                const hqStatus = kit.hqFabric?.status ?? "UNKNOWN";
                const allOk = [localStatus, meshStatus, hqStatus].every((s) => s === "ONLINE" || s === "HEALTHY");
                return (
                  <tr key={i}>
                    <td style={S.td}><span style={{ color: "#4a90d9" }}>{kit.name ?? kit.kitId ?? `KIT-${i + 1}`}</span></td>
                    <td style={S.td}><span style={S.badge(routerStatusColor(localStatus))}>{localStatus}</span></td>
                    <td style={S.td}><span style={S.badge(routerStatusColor(meshStatus))}>{meshStatus}</span></td>
                    <td style={S.td}><span style={S.badge(routerStatusColor(hqStatus))}>{hqStatus}</span></td>
                    <td style={S.td}><span style={S.badge(allOk ? "#22c55e" : "#f59e0b")}>{allOk ? "HEALTHY" : "DEGRADED"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Link cost analysis */}
      <div style={S.card}>
        <div style={S.cardTitle}>Fabric Link Costs ({linkEntries.length} links)</div>
        {linkEntries.length === 0 ? (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>No link cost data available</div>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Source Router</th>
                <th style={S.th}>Dest Router</th>
                <th style={S.th}>Plane</th>
                <th style={S.th}>Cost</th>
                <th style={S.th}>Latency</th>
                <th style={S.th}>Throughput</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {linkEntries.map((link: any, i: number) => {
                const cost: number = link.cost ?? 0;
                const costColor = cost <= 10 ? "#22c55e" : cost <= 50 ? "#f59e0b" : "#ef4444";
                return (
                  <tr key={i}>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{link.sourceRouter ?? "—"}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{link.destRouter ?? "—"}</td>
                    <td style={S.td}><span style={S.badge("#3b82f6")}>{link.plane ?? "—"}</span></td>
                    <td style={{ ...S.td, fontFamily: "monospace", color: costColor }}>{cost}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{link.latencyMs != null ? `${link.latencyMs}ms` : "—"}</td>
                    <td style={{ ...S.td, fontFamily: "monospace" }}>{link.throughputMbps != null ? `${link.throughputMbps} Mbps` : "—"}</td>
                    <td style={S.td}>
                      <span style={S.badge(routerStatusColor(link.status ?? "UNKNOWN"))}>{link.status ?? "UNKNOWN"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Router failure impact analysis */}
      <div style={S.card}>
        <div style={S.cardTitle}>Router Failure Impact Analysis</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {["local-fabric", "mesh-fabric", "hq-fabric"].map((rt) => (
            <button
              key={rt}
              onClick={() => { setSelectedRouterType(rt); analyzeFailure(rt); }}
              style={{
                background: selectedRouterType === rt ? "#1a2535" : "none",
                border: "1px solid #1a2535",
                color: selectedRouterType === rt ? "#c9d3e0" : "#4a6070",
                fontSize: 10,
                padding: "4px 12px",
                borderRadius: 3,
                cursor: "pointer",
                letterSpacing: 1,
                textTransform: "uppercase" as const,
              }}
            >{rt.replace(/-/g, " ")}</button>
          ))}
        </div>

        {failureImpact == null ? (
          <div style={{ color: "#3b4a5a", fontSize: 11, padding: "8px 0" }}>Select a router type above to analyze failure impact</div>
        ) : failureImpact.error ? (
          <div style={{ color: "#f87171", fontSize: 11, padding: "8px 0" }}>{failureImpact.error}</div>
        ) : (
          <div>
            {impactDescription && (
              <div style={{ fontSize: 11, color: "#c9d3e0", marginBottom: 12, padding: "8px 12px", background: "#0a1220", borderRadius: 4, borderLeft: "3px solid #ef444488" }}>
                {impactDescription}
              </div>
            )}
            {impactServices.length > 0 && (
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Affected Service</th>
                    <th style={S.th}>Impact Level</th>
                    <th style={S.th}>Recovery Action</th>
                  </tr>
                </thead>
                <tbody>
                  {impactServices.map((svc: any, i: number) => {
                    const level = (svc.impactLevel || "").toUpperCase();
                    const impactCol = level === "CRITICAL" ? "#ef4444" : level === "HIGH" ? "#f97316" : level === "MEDIUM" ? "#f59e0b" : "#22c55e";
                    return (
                      <tr key={i}>
                        <td style={S.td}>{svc.service ?? "—"}</td>
                        <td style={S.td}><span style={S.badge(impactCol)}>{level || "UNKNOWN"}</span></td>
                        <td style={{ ...S.td, fontSize: 10, color: "#4a6070" }}>{svc.recovery ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {impactServices.length === 0 && !impactDescription && (
              <div style={{ color: "#22c55e", fontSize: 11 }}>No services affected by this router failure scenario.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
