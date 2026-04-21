// AutoNet Playbook Helper
// Assists with running Ansible playbooks in check/dry-run mode

import { existsSync } from "fs";
import { resolve, join } from "path";

export interface PlaybookRunResult {
  playbook: string;
  success: boolean;
  dryRun: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  parsedTasks: {
    ok: number;
    changed: number;
    unreachable: number;
    failed: number;
    skipped: number;
    rescued: number;
    ignored: number;
  };
}

export interface PlaybookListItem {
  name: string;
  path: string;
  description: string;
  hasVault: boolean;
}

export interface LintResult {
  file: string;
  issues: Array<{
    line: number;
    message: string;
    rule: string;
  }>;
}

export class AutonetPlaybookHelper {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = resolve(rootPath);
  }

  listPlaybooks(): PlaybookListItem[] {
    const playbooks: PlaybookListItem[] = [];
    const candidates = [
      { name: "site.yml", desc: "Main deployment playbook" },
      { name: "destroy.yml", desc: "Destroy mission infrastructure" },
      { name: "modify.yml", desc: "Modify existing deployment" },
      { name: "peer-exchange.yml", desc: "Exchange peer WireGuard keys" },
      { name: "emergency-rebuild.yml", desc: "Emergency rebuild procedures" },
      { name: "update.yml", desc: "Update existing kits" },
      { name: "revoke-kit.yml", desc: "Revoke a kit from the mesh" },
    ];

    for (const cand of candidates) {
      const path = join(this.rootPath, cand.name);
      if (existsSync(path)) {
        playbooks.push({
          name: cand.name,
          path,
          description: cand.desc,
          hasVault: this.checkVaultRefs(path),
        });
      }
    }
    return playbooks;
  }

  async runPlaybook(playbookName: string, options: {
    dryRun?: boolean;
    limit?: string;
    tags?: string[];
    extraVars?: Record<string, string>;
    askVaultPass?: boolean;
  } = {}): Promise<PlaybookRunResult> {
    const playbookPath = join(this.rootPath, playbookName);
    if (!existsSync(playbookPath)) {
      return {
        playbook: playbookName,
        success: false,
        dryRun: false,
        exitCode: 1,
        stdout: "",
        stderr: `Playbook not found: ${playbookPath}`,
        durationMs: 0,
        parsedTasks: { ok: 0, changed: 0, unreachable: 0, failed: 0, skipped: 0, rescued: 0, ignored: 0 },
      };
    }

    const args = ["ansible-playbook", "-i", join(this.rootPath, "inventory/inventory.yml")];
    
    if (options.dryRun) {
      args.push("--check");
      args.push("--diff");
    }
    if (options.limit) {
      args.push("--limit", options.limit);
    }
    if (options.tags && options.tags.length > 0) {
      args.push("--tags", options.tags.join(","));
    }
    if (options.askVaultPass) {
      args.push("--ask-vault-pass");
    }
    if (options.extraVars) {
      const ev = Object.entries(options.extraVars)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      args.push("-e", ev);
    }

    args.push(playbookPath);

    const start = Date.now();
    try {
      const proc = Bun.spawn(args, {
        cwd: this.rootPath,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...Bun.env, ANSIBLE_FORCE_COLOR: "0" },
      });

      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      const durationMs = Date.now() - start;
      const parsed = this.parseAnsibleOutput(stdout + "\n" + stderr);

      return {
        playbook: playbookName,
        success: exitCode === 0,
        dryRun: !!options.dryRun,
        exitCode,
        stdout,
        stderr,
        durationMs,
        parsedTasks: parsed,
      };
    } catch (error) {
      return {
        playbook: playbookName,
        success: false,
        dryRun: !!options.dryRun,
        exitCode: -1,
        stdout: "",
        stderr: `Execution error: ${error}`,
        durationMs: Date.now() - start,
        parsedTasks: { ok: 0, changed: 0, unreachable: 0, failed: 0, skipped: 0, rescued: 0, ignored: 0 },
      };
    }
  }

  async syntaxCheck(playbookName: string): Promise<{ valid: boolean; errors: string[] }> {
    const playbookPath = join(this.rootPath, playbookName);
    if (!existsSync(playbookPath)) {
      return { valid: false, errors: ["Playbook not found"] };
    }

    try {
      const proc = Bun.spawn(
        ["ansible-playbook", "--syntax-check", playbookPath],
        { cwd: this.rootPath, stdout: "pipe", stderr: "pipe" },
      );
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      const errors: string[] = [];
      if (exitCode !== 0) {
        const combined = stdout + "\n" + stderr;
        for (const line of combined.split("\n")) {
          if (line.includes("ERROR") || line.includes("fatal") || line.includes("syntax")) {
            errors.push(line.trim());
          }
        }
        if (errors.length === 0) errors.push(stderr || stdout || "Syntax check failed");
      }

      return { valid: exitCode === 0, errors };
    } catch (error) {
      return { valid: false, errors: [String(error)] };
    }
  }

  async runLint(playbookName?: string): Promise<LintResult[]> {
    const target = playbookName ? join(this.rootPath, playbookName) : this.rootPath;
    const results: LintResult[] = [];

    try {
      const proc = Bun.spawn(
        ["ansible-lint", "-p", "--offline", target],
        { cwd: this.rootPath, stdout: "pipe", stderr: "pipe" },
      );
      const [exitCode, stdout] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
      ]);

      // ansible-lint returns 0 or 2 for warnings/issues
      if (exitCode === 0 || exitCode === 2) {
        for (const line of stdout.split("\n")) {
          const match = line.match(/^(.+):(\d+):\s+(.+)$/);
          if (match) {
            const [, file, lineNum, message] = match;
            let result = results.find((r) => r.file === file);
            if (!result) {
              result = { file, issues: [] };
              results.push(result);
            }
            result.issues.push({
              line: parseInt(lineNum, 10),
              message,
              rule: "ansible-lint",
            });
          }
        }
      }
    } catch {
      // ansible-lint not installed - not critical
    }

    return results;
  }

  async checkAnsibleVersion(): Promise<{ installed: boolean; version?: string }> {
    try {
      const proc = Bun.spawn(["ansible-playbook", "--version"], { stdout: "pipe", stderr: "pipe" });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      const match = stdout.match(/ansible-playbook\s+\[core?\s*(\d+\.\d+\.?\d*)/i);
      return { installed: true, version: match?.[1] || "unknown" };
    } catch {
      return { installed: false };
    }
  }

  private parseAnsibleOutput(output: string): PlaybookRunResult["parsedTasks"] {
    const result = { ok: 0, changed: 0, unreachable: 0, failed: 0, skipped: 0, rescued: 0, ignored: 0 };
    // Look for PLAY RECAP lines
    const recapMatch = output.match(/ok=(\d+)\s+changed=(\d+)\s+unreachable=(\d+)\s+failed=(\d+)\s+skipped=(\d+)\s+rescued=(\d+)\s+ignored=(\d+)/);
    if (recapMatch) {
      result.ok = parseInt(recapMatch[1], 10) || 0;
      result.changed = parseInt(recapMatch[2], 10) || 0;
      result.unreachable = parseInt(recapMatch[3], 10) || 0;
      result.failed = parseInt(recapMatch[4], 10) || 0;
      result.skipped = parseInt(recapMatch[5], 10) || 0;
      result.rescued = parseInt(recapMatch[6], 10) || 0;
      result.ignored = parseInt(recapMatch[7], 10) || 0;
    }
    return result;
  }

  private checkVaultRefs(path: string): boolean {
    try {
      const content = readFileSync(path, "utf8");
      return content.includes("vault_") || content.includes("!vault");
    } catch {
      return false;
    }
  }
}
