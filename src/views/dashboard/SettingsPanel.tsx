import React, { useEffect, useState } from "react";
import { rpcHandlers } from "../../shared/rpc-handlers";
import { useAppStore } from "../../shared/store";

interface AppSettings {
  autonetRoot: string;
  networkMode: string;
  networkInterface: string;
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings>({
    autonetRoot: "",
    networkMode: "AUTONET_ASSIST",
    networkInterface: "",
  });
  const [saved, setSaved] = useState(false);
  const [sysStatus, setSysStatus] = useState<any>(null);
  const { addNotification } = useAppStore();

  useEffect(() => {
    rpcHandlers.getSettings().then((s: any) => {
      if (s) {
        setSettings({
          autonetRoot: s.autonetRoot || "",
          networkMode: s.networkMode || "AUTONET_ASSIST",
          networkInterface: s.selectedNetworkInterface || "",
        });
      }
    }).catch(() => {});

    rpcHandlers.getSystemStatus().then((info: any) => {
      if (info) setSysStatus(info);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      await rpcHandlers.updateSettings({
        autonetRoot: settings.autonetRoot || undefined,
        networkMode: settings.networkMode as any,
        selectedNetworkInterface: settings.networkInterface || undefined,
      });
      setSaved(true);
      addNotification({ type: "success", title: "Settings saved", message: "Configuration updated successfully." });
      setTimeout(() => setSaved(false), 2500);
    } catch {
      addNotification({ type: "error", title: "Save failed", message: "Could not save settings." });
    }
  };

  const handleClearCache = async () => {
    try {
      const result = await rpcHandlers.clearCache();
      addNotification({ type: "info", title: "Cache cleared", message: `Deleted ${result.deleted} records.` });
    } catch {
      addNotification({ type: "error", title: "Clear failed", message: "Could not clear cache." });
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      {/* AutoNet Configuration */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-4 py-3 border-b border-border font-medium text-sm">AutoNet Configuration</div>
        <div className="px-4 py-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              AutoNet Root Path
            </label>
            <input
              type="text"
              value={settings.autonetRoot}
              onChange={(e) => setSettings({ ...settings, autonetRoot: e.target.value })}
              placeholder="/path/to/talon-autonet"
              className="px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Network Mode
            </label>
            <select
              value={settings.networkMode}
              onChange={(e) => setSettings({ ...settings, networkMode: e.target.value })}
              className="px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="AUTONET_ASSIST">AutoNet Assist</option>
              <option value="UNIVERSAL_INTEL">Universal Intel</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Network Interface
            </label>
            <input
              type="text"
              value={settings.networkInterface}
              onChange={(e) => setSettings({ ...settings, networkInterface: e.target.value })}
              placeholder="e.g. eth0, wlan0"
              className="px-3 py-2 bg-background border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <button
            onClick={handleSave}
            className={`w-full py-2 rounded text-sm font-medium transition-colors ${
              saved
                ? "bg-green-700 text-green-100"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {saved ? "✓ Saved" : "Save Settings"}
          </button>
        </div>
      </div>

      {/* System Status */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-4 py-3 border-b border-border font-medium text-sm">System Status</div>
        <div className="px-4 py-4 flex flex-col gap-2 text-sm">
          {sysStatus ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">CPU Usage</span>
                <span className="font-mono text-xs">{sysStatus.cpu?.usage?.toFixed(1) ?? "—"}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Memory</span>
                <span className="font-mono text-xs">{sysStatus.memory?.percentage?.toFixed(1) ?? "—"}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Disk</span>
                <span className="font-mono text-xs">{sysStatus.disk?.percentage?.toFixed(1) ?? "—"}%</span>
              </div>
            </>
          ) : (
            <span className="text-muted-foreground text-xs">Loading system info...</span>
          )}
          <button
            onClick={handleClearCache}
            className="mt-2 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground w-fit"
          >
            Clear Local Cache
          </button>
        </div>
      </div>

      {/* About */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-4 py-3 border-b border-border font-medium text-sm">About</div>
        <div className="px-4 py-4 text-sm flex flex-col gap-1 text-muted-foreground">
          <div className="flex justify-between">
            <span>Application</span>
            <span className="text-foreground">Mission Data Grid</span>
          </div>
          <div className="flex justify-between">
            <span>Version</span>
            <span className="text-foreground font-mono">2.0.0</span>
          </div>
          <div className="flex justify-between">
            <span>Purpose</span>
            <span className="text-foreground">AutoNet Tyto Athene Network Assistant</span>
          </div>
        </div>
      </div>
    </div>
  );
}
