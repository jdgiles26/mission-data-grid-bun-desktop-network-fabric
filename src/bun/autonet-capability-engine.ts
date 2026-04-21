import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

export type ValidationStatus = "PASS" | "WARN" | "FAIL" | "UNKNOWN";

export interface CapabilityEntry {
  id: string;
  label: string;
  available: boolean;
  detail: string;
}

export interface AutoNetCapabilitySnapshot {
  generatedAt: Date;
  projectPath: string;
  lifecycle: CapabilityEntry[];
  validation: CapabilityEntry[];
  controlSurfaces: CapabilityEntry[];
  docs: CapabilityEntry[];
  gaps: string[];
}

export interface AutoNetValidationSummary {
  generatedAt: Date;
  projectPath: string;
  status: ValidationStatus;
  kitName: string | null;
  exitCode: number | null;
  okCount: number;
  warnCount: number;
  failCount: number;
  summary: string;
  excerpts: string[];
  error?: string;
}

interface CachedValue<T> {
  value: T;
  timestampMs: number;
}

export class AutoNetCapabilityEngine {
  private capabilityCache: CachedValue<AutoNetCapabilitySnapshot> | null = null;
  private validationCache: CachedValue<AutoNetValidationSummary> | null = null;
  private readonly capabilityTtlMs = 60_000;
  private readonly validationTtlMs = 120_000;

  async getCapabilities(rootPath: string, forceRefresh = false): Promise<AutoNetCapabilitySnapshot> {
    if (!forceRefresh && this.capabilityCache && Date.now() - this.capabilityCache.timestampMs < this.capabilityTtlMs) {
      return this.capabilityCache.value;
    }

    const snapshot = this.buildCapabilities(rootPath);
    this.capabilityCache = { value: snapshot, timestampMs: Date.now() };
    return snapshot;
  }

  async getValidationSummary(rootPath: string, forceRefresh = false): Promise<AutoNetValidationSummary> {
    if (!forceRefresh && this.validationCache && Date.now() - this.validationCache.timestampMs < this.validationTtlMs) {
      return this.validationCache.value;
    }

    const summary = await this.runValidation(rootPath);
    this.validationCache = { value: summary, timestampMs: Date.now() };
    return summary;
  }

  private buildCapabilities(rootPath: string): AutoNetCapabilitySnapshot {
    const generatedAt = new Date();
    const gaps: string[] = [];

    if (!existsSync(rootPath)) {
      return {
        generatedAt,
        projectPath: rootPath,
        lifecycle: [],
        validation: [],
        controlSurfaces: [],
        docs: [],
        gaps: [`AutoNet path not found: ${rootPath}`],
      };
    }

    const has = (...parts: string[]): boolean => existsSync(join(rootPath, ...parts));
    const readme = this.readTextIfExists(join(rootPath, "README.md"));

    const lifecycle: CapabilityEntry[] = [
      { id: "deploy", label: "Deploy kit stack (site.yml)", available: has("site.yml"), detail: has("site.yml") ? "Present" : "Missing site.yml" },
      { id: "update", label: "Reapply updates (update.yml)", available: has("update.yml"), detail: has("update.yml") ? "Present" : "Missing update.yml" },
      { id: "modify", label: "Structural modify (modify.yml)", available: has("modify.yml"), detail: has("modify.yml") ? "Present" : "Missing modify.yml" },
      { id: "destroy", label: "Destroy kit (destroy.yml)", available: has("destroy.yml"), detail: has("destroy.yml") ? "Present" : "Missing destroy.yml" },
      { id: "revoke", label: "Revoke compromised kit (revoke-kit.yml)", available: has("revoke-kit.yml"), detail: has("revoke-kit.yml") ? "Present" : "Missing revoke-kit.yml" },
      { id: "emergency", label: "Emergency VM rebuild", available: has("emergency-rebuild.yml"), detail: has("emergency-rebuild.yml") ? "Present" : "Missing emergency-rebuild.yml" },
      { id: "peer_exchange", label: "Peer exchange / WG verification", available: has("peer-exchange.yml"), detail: has("peer-exchange.yml") ? "Present" : "Missing peer-exchange.yml" },
    ];

    const validation: CapabilityEntry[] = [
      {
        id: "preflight_role",
        label: "Preflight role checks",
        available: has("roles", "autonet", "tasks", "preflight.yml"),
        detail: has("roles", "autonet", "tasks", "preflight.yml")
          ? "roles/autonet/tasks/preflight.yml present"
          : "Preflight task file missing",
      },
      {
        id: "validate_script",
        label: "Kit validation script",
        available: has("scripts", "validate-kit.sh"),
        detail: has("scripts", "validate-kit.sh")
          ? "scripts/validate-kit.sh present"
          : "Validation script missing",
      },
    ];

    const controlSurfaces: CapabilityEntry[] = [
      {
        id: "grafana_monitoring",
        label: "Grafana monitoring path",
        available: has("roles", "autonet", "tasks", "step11_monitoring.yml"),
        detail: has("roles", "autonet", "tasks", "step11_monitoring.yml")
          ? "Monitoring step present"
          : "Monitoring step missing",
      },
      {
        id: "zac_controller",
        label: "ZAC via Ziti controller",
        available: has("roles", "autonet", "tasks", "step6_ziti_ctrl.yml"),
        detail: has("roles", "autonet", "tasks", "step6_ziti_ctrl.yml")
          ? "Controller step present"
          : "Controller step missing",
      },
      {
        id: "autonet_api_role",
        label: "AutoNet REST API role",
        available: has("roles", "autonet_api"),
        detail: has("roles", "autonet_api")
          ? "roles/autonet_api present"
          : "roles/autonet_api missing",
      },
    ];

    const autonetApiDocumented = readme.includes("AUTONET REST API") || readme.includes("autonet_api");
    const docs: CapabilityEntry[] = [
      {
        id: "api_documented",
        label: "AutoNet REST API documented",
        available: autonetApiDocumented,
        detail: autonetApiDocumented ? "README documents API surface" : "README does not document API surface",
      },
    ];

    if (autonetApiDocumented && !has("roles", "autonet_api")) {
      gaps.push("README documents AutoNet REST API, but roles/autonet_api is not present in repository.");
    }
    if (lifecycle.some((entry) => !entry.available)) {
      gaps.push("One or more lifecycle playbooks are missing; orchestration coverage is incomplete.");
    }
    if (!validation.every((entry) => entry.available)) {
      gaps.push("Validation path is incomplete; preflight parity cannot be guaranteed.");
    }

    return {
      generatedAt,
      projectPath: rootPath,
      lifecycle,
      validation,
      controlSurfaces,
      docs,
      gaps,
    };
  }

  private async runValidation(rootPath: string): Promise<AutoNetValidationSummary> {
    const generatedAt = new Date();
    const scriptPath = join(rootPath, "scripts", "validate-kit.sh");

    if (!existsSync(rootPath)) {
      return {
        generatedAt,
        projectPath: rootPath,
        status: "UNKNOWN",
        kitName: null,
        exitCode: null,
        okCount: 0,
        warnCount: 0,
        failCount: 0,
        summary: "AutoNet path not found",
        excerpts: [],
        error: `AutoNet path not found: ${rootPath}`,
      };
    }

    if (!existsSync(scriptPath)) {
      return {
        generatedAt,
        projectPath: rootPath,
        status: "UNKNOWN",
        kitName: null,
        exitCode: null,
        okCount: 0,
        warnCount: 0,
        failCount: 0,
        summary: "validate-kit.sh not found",
        excerpts: [],
        error: "scripts/validate-kit.sh not found",
      };
    }

    const kitName = this.deriveKitName(rootPath);
    if (!kitName) {
      return {
        generatedAt,
        projectPath: rootPath,
        status: "UNKNOWN",
        kitName: null,
        exitCode: null,
        okCount: 0,
        warnCount: 0,
        failCount: 0,
        summary: "No kit name inferred from inventory/host_vars",
        excerpts: [],
        error: "Unable to infer kit name for validation run",
      };
    }

    try {
      const result = await this.runCommand(
        ["bash", "scripts/validate-kit.sh", kitName],
        rootPath,
        45_000,
      );

      const text = `${result.stdout}\n${result.stderr}`.trim();
      const lines = text.length > 0 ? text.split(/\r?\n/) : [];
      const okCount = (text.match(/\[OK\]/g) || []).length;
      const warnCount = (text.match(/\[WARN\]/g) || []).length;
      const failCount = (text.match(/\[FAIL\]/g) || []).length;

      let status: ValidationStatus = "UNKNOWN";
      if (failCount > 0 || (result.exitCode !== 0 && failCount === 0)) {
        status = "FAIL";
      } else if (warnCount > 0) {
        status = "WARN";
      } else if (result.exitCode === 0) {
        status = "PASS";
      }

      const summary =
        status === "PASS"
          ? "Validation script completed with no failures"
          : status === "WARN"
            ? "Validation completed with warnings"
            : status === "FAIL"
              ? "Validation failed"
              : "Validation status unknown";

      return {
        generatedAt,
        projectPath: rootPath,
        status,
        kitName,
        exitCode: result.exitCode,
        okCount,
        warnCount,
        failCount,
        summary,
        excerpts: lines.slice(-12),
        error: result.error,
      };
    } catch (error) {
      return {
        generatedAt,
        projectPath: rootPath,
        status: "FAIL",
        kitName,
        exitCode: null,
        okCount: 0,
        warnCount: 0,
        failCount: 1,
        summary: "Validation execution error",
        excerpts: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private deriveKitName(rootPath: string): string | null {
    const hostVarsPath = join(rootPath, "inventory", "host_vars");
    if (!existsSync(hostVarsPath)) {
      return null;
    }

    const hosts = readdirSync(hostVarsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    if (hosts.length === 0) {
      return null;
    }

    const pveHost = hosts.find((host) => host.includes("-pve-"));
    const selected = pveHost || hosts[0];
    if (!selected) {
      return null;
    }
    const idx = selected.indexOf("-pve-");
    if (idx > 0) {
      return selected.slice(0, idx);
    }
    return selected.split("-")[0] || null;
  }

  private readTextIfExists(path: string): string {
    if (!existsSync(path)) {
      return "";
    }
    try {
      return readFileSync(path, "utf8");
    } catch {
      return "";
    }
  }

  private async runCommand(args: string[], cwd: string, timeoutMs: number): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    error?: string;
  }> {
    const process = Bun.spawn(args, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        process.kill();
      } catch {
        // No-op if process already exited.
      }
    }, timeoutMs);

    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ]);

    clearTimeout(timeout);
    return {
      exitCode,
      stdout,
      stderr,
      error: timedOut ? `Command timed out after ${timeoutMs}ms` : undefined,
    };
  }
}
