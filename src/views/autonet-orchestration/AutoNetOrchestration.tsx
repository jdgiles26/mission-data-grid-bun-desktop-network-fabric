/**
 * AutoNet Orchestration - Playbook Builder & Kit Configuration
 * Uses inline styles only — no shared component library dependency.
 */

import React, { useEffect, useState, useCallback } from "react";
import { rpcHandlers } from "../../shared/rpc-handlers";

// ── Style constants ────────────────────────────────────────────────────────
const C = {
  bg: "#0b0f17",
  card: "#0d1520",
  border: "#1a2535",
  text: "#c9d3e0",
  muted: "#64748b",
  green: "#22c55e",
  blue: "#3b82f6",
  amber: "#f59e0b",
  red: "#ef4444",
  cyan: "#06b6d4",
};

const S = {
  page: { padding: 16, color: C.text, fontFamily: "monospace", background: C.bg, minHeight: "100%" } as React.CSSProperties,
  card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginBottom: 16 } as React.CSSProperties,
  cardTitle: { fontSize: 11, fontWeight: 700, letterSpacing: 2, color: C.muted, marginBottom: 12, textTransform: "uppercase" as const },
  tab: (active: boolean) => ({
    padding: "7px 18px", fontSize: 11, cursor: "pointer", border: "none",
    background: active ? "#0f1a2a" : "none",
    borderBottom: active ? `2px solid ${C.green}` : "2px solid transparent",
    color: active ? C.green : C.muted,
    letterSpacing: 1, fontFamily: "monospace",
    transition: "all 0.15s",
  } as React.CSSProperties),
  btn: (variant: "primary" | "secondary" | "danger" = "secondary") => ({
    padding: "6px 14px", fontSize: 11, cursor: "pointer", borderRadius: 4,
    border: variant === "primary" ? "none" : `1px solid ${C.border}`,
    background: variant === "primary" ? C.green : variant === "danger" ? "#7c1c1c" : "#0a1220",
    color: variant === "primary" ? "#000" : variant === "danger" ? C.red : C.muted,
    fontFamily: "monospace", letterSpacing: 1, fontWeight: variant === "primary" ? 700 : 400,
    transition: "opacity 0.15s",
  } as React.CSSProperties),
  input: { width: "100%", background: "#080e1a", border: `1px solid ${C.border}`, borderRadius: 4, padding: "6px 10px", color: C.text, fontSize: 11, fontFamily: "monospace", outline: "none", boxSizing: "border-box" as const },
  label: { fontSize: 10, color: C.muted, letterSpacing: 1, marginBottom: 4, display: "block", textTransform: "uppercase" as const },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 11 },
  th: { textAlign: "left" as const, padding: "6px 10px", color: "#4a6070", fontSize: 10, letterSpacing: 1, borderBottom: `1px solid ${C.border}`, textTransform: "uppercase" as const },
  td: { padding: "7px 10px", borderBottom: "1px solid #111b28", color: C.text },
  badge: (color: string) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 600, background: color + "22", color, border: `1px solid ${color}44` }),
  statusDot: (ok: boolean) => ({ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: ok ? C.green : C.red, boxShadow: ok ? `0 0 5px ${C.green}` : `0 0 5px ${C.red}`, marginRight: 6 }),
  codeBlock: { background: "#070c14", border: `1px solid ${C.border}`, borderRadius: 4, padding: 12, fontFamily: "monospace", fontSize: 11, color: "#8fb8d8", whiteSpace: "pre-wrap" as const, overflowX: "auto" as const, maxHeight: 300, overflowY: "auto" as const },
};

// ── Playbook Builder ───────────────────────────────────────────────────────
interface Playbook {
  name: string;
  path: string;
  description: string;
  taskCount: number;
  lastModified?: Date;
  vars?: string[];
}

interface RunResult {
  id: string;
  playbook: string;
  status: "success" | "failed";
  startTime: Date;
  output: string;
}

function PlaybookBuilder() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [selected, setSelected] = useState<Playbook | null>(null);
  const [runs, setRuns] = useState<RunResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [ansibleOk, setAnsibleOk] = useState(false);
  const [ansibleVersion, setAnsibleVersion] = useState<string | undefined>();
  const [running, setRunning] = useState(false);
  const [limitFilter, setLimitFilter] = useState("");
  const [tagsFilter, setTagsFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [versionCheck, playbookList] = await Promise.all([
        rpcHandlers.checkAnsibleVersion().catch(() => ({ installed: false })),
        rpcHandlers.listPlaybooks().catch(() => []),
      ]);
      setAnsibleOk(versionCheck.installed);
      setAnsibleVersion((versionCheck as any).version);
      const list = (playbookList as Playbook[]);
      setPlaybooks(list);
      if (list.length > 0 && !selected) setSelected(list[0]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load playbooks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runCheck = async () => {
    if (!selected) return;
    setRunning(true);
    try {
      const result = await rpcHandlers.runPlaybookCheck({
        playbook: selected.name,
        limit: limitFilter || undefined,
        tags: tagsFilter ? tagsFilter.split(",").map(t => t.trim()) : undefined,
      }) as any;
      setRuns(prev => [{
        id: `run-${Date.now()}`,
        playbook: selected.name,
        status: result.success ? "success" : "failed",
        startTime: new Date(),
        output: result.stderr || result.stdout || "(no output)",
      }, ...prev.slice(0, 9)]);
    } catch (e) {
      setRuns(prev => [{
        id: `run-${Date.now()}`,
        playbook: selected.name,
        status: "failed",
        startTime: new Date(),
        output: e instanceof Error ? e.message : "Error",
      }, ...prev.slice(0, 9)]);
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <div style={{ color: C.muted, fontSize: 12, padding: 20 }}>◌ Loading playbooks...</div>;

  if (!ansibleOk) {
    return (
      <div style={{ ...S.card, borderColor: C.amber + "55" }}>
        <div style={{ ...S.cardTitle, color: C.amber }}>⚠ Ansible Not Found</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          Ansible is not installed or not in PATH. Install Ansible to use playbook features.
        </div>
        <code style={{ fontSize: 11, color: "#8fb8d8" }}>pip3 install ansible</code>
      </div>
    );
  }

  return (
    <div>
      {/* Ansible version badge */}
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={S.statusDot(true)} />
        <span style={{ fontSize: 10, color: C.green, letterSpacing: 1 }}>ANSIBLE {ansibleVersion ?? "INSTALLED"}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Playbook list */}
        <div style={S.card}>
          <div style={S.cardTitle}>Available Playbooks ({playbooks.length})</div>
          {playbooks.length === 0 ? (
            <div style={{ fontSize: 11, color: C.muted }}>No playbooks found in AutoNet root</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {playbooks.map(pb => (
                <button
                  key={pb.name}
                  onClick={() => setSelected(pb)}
                  style={{
                    padding: "8px 10px", textAlign: "left", border: "none", borderRadius: 4, cursor: "pointer",
                    background: selected?.name === pb.name ? "#0f1a2a" : "#080e1a",
                    borderLeft: `2px solid ${selected?.name === pb.name ? C.cyan : "transparent"}`,
                    color: selected?.name === pb.name ? C.cyan : C.muted,
                    fontFamily: "monospace", fontSize: 11,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>▶ {pb.name}</div>
                  {pb.taskCount > 0 && <div style={{ fontSize: 10, color: "#3b4a5a", marginTop: 2 }}>{pb.taskCount} tasks</div>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details + run controls */}
        <div style={S.card}>
          <div style={S.cardTitle}>Playbook Details</div>
          {selected ? (
            <>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 4 }}>{selected.name}</div>
                {selected.description && <div style={{ fontSize: 11, color: C.muted }}>{selected.description}</div>}
                {selected.path && <div style={{ fontSize: 10, color: "#3b4a5a", marginTop: 4, fontFamily: "monospace" }}>{selected.path}</div>}
              </div>
              {(selected.vars ?? []).length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ ...S.label }}>Variables</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(selected.vars ?? []).map(v => <span key={v} style={S.badge(C.blue)}>{v}</span>)}
                  </div>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={S.label}>Limit (hosts)</label>
                  <input style={S.input} value={limitFilter} onChange={e => setLimitFilter(e.target.value)} placeholder="all hosts" />
                </div>
                <div>
                  <label style={S.label}>Tags</label>
                  <input style={S.input} value={tagsFilter} onChange={e => setTagsFilter(e.target.value)} placeholder="tag1,tag2" />
                </div>
              </div>
              <button style={S.btn("primary")} onClick={runCheck} disabled={running}>
                {running ? "◌ Running..." : "▶ Run Dry-Check"}
              </button>
            </>
          ) : (
            <div style={{ fontSize: 11, color: C.muted }}>Select a playbook</div>
          )}
        </div>
      </div>

      {/* Run history */}
      {runs.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Run History</div>
          {runs.map(run => (
            <div key={run.id} style={{ marginBottom: 10, borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={S.badge(run.status === "success" ? C.green : C.red)}>{run.status.toUpperCase()}</span>
                <span style={{ fontSize: 11, color: C.text }}>{run.playbook}</span>
                <span style={{ fontSize: 10, color: C.muted, marginLeft: "auto" }}>{run.startTime.toLocaleTimeString("en-US", { hour12: false })}</span>
              </div>
              {run.output && <pre style={S.codeBlock}>{run.output.slice(0, 2000)}</pre>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Kit Builder ────────────────────────────────────────────────────────────
interface KitForm {
  kitName: string;
  kitId: number;
  missionId: number;
  proxmoxIp: string;
  vmidBase: number;
  lanBase: string;
  wgBase: string;
}

const defaultForm: KitForm = {
  kitName: "", kitId: 1, missionId: 1,
  proxmoxIp: "", vmidBase: 100,
  lanBase: "10.0.0.0/24", wgBase: "10.255.1.1",
};

function KitBuilder() {
  const [form, setForm] = useState<KitForm>(defaultForm);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await rpcHandlers.getKitAddressPlan(form) as any;
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to build plan");
    } finally {
      setLoading(false);
    }
  };

  const field = (label: string, key: keyof KitForm, type: "text" | "number" = "text") => (
    <div>
      <label style={S.label}>{label}</label>
      <input
        style={S.input}
        type={type}
        value={form[key] as any}
        onChange={e => setForm(f => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
      />
    </div>
  );

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>Kit Address Plan Builder</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
          {field("Kit Name", "kitName")}
          {field("Kit ID", "kitId", "number")}
          {field("Mission ID", "missionId", "number")}
          {field("Proxmox IP", "proxmoxIp")}
          {field("VMID Base", "vmidBase", "number")}
          {field("LAN Base", "lanBase")}
          {field("WireGuard Base", "wgBase")}
        </div>
        <button style={S.btn("primary")} onClick={buildPlan} disabled={loading}>
          {loading ? "◌ Computing..." : "⊞ Build Address Plan"}
        </button>
        {error && <div style={{ color: C.red, fontSize: 11, marginTop: 8 }}>⚠ {error}</div>}
      </div>

      {result && (
        <div style={S.card}>
          <div style={S.cardTitle}>
            {result.valid ? <span style={{ color: C.green }}>✓ VALID PLAN</span> : <span style={{ color: C.red }}>✗ INVALID PLAN</span>}
          </div>
          {result.errors?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {result.errors.map((e: string, i: number) => (
                <div key={i} style={{ color: C.red, fontSize: 11, marginBottom: 2 }}>⚠ {e}</div>
              ))}
            </div>
          )}
          {result.plan && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...S.cardTitle, marginBottom: 8 }}>Address Plan</div>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Component</th>
                    <th style={S.th}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.plan).map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ ...S.td, color: C.muted, fontSize: 10 }}>{k}</td>
                      <td style={{ ...S.td, fontFamily: "monospace", fontSize: 11 }}>{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.yaml && (
            <>
              <div style={{ ...S.label, marginBottom: 6 }}>Generated host_vars YAML</div>
              <pre style={S.codeBlock}>{result.yaml}</pre>
            </>
          )}
          {result.inventory && (
            <>
              <div style={{ ...S.label, marginTop: 12, marginBottom: 6 }}>Inventory Entry</div>
              <pre style={S.codeBlock}>{result.inventory}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export function AutoNetOrchestration() {
  const [tab, setTab] = useState<"playbooks" | "kits">("playbooks");

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.cyan, letterSpacing: 2, marginBottom: 4 }}>
          ▶ AUTONET ORCHESTRATION
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>Manage playbooks, configure mission kits, orchestrate automated deployments</div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 16 }}>
        <button style={S.tab(tab === "playbooks")} onClick={() => setTab("playbooks")}>▶ PLAYBOOKS</button>
        <button style={S.tab(tab === "kits")} onClick={() => setTab("kits")}>⊞ KIT BUILDER</button>
      </div>

      {tab === "playbooks" && <PlaybookBuilder />}
      {tab === "kits" && <KitBuilder />}
    </div>
  );
}

