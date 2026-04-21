// Log Aggregator - Parses Ansible logs and system logs for the AutoNet project
import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";

export interface LogEntry {
  id: string;
  timestamp: Date;
  source: string;
  level: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  message: string;
  host?: string;
  task?: string;
  playbook?: string;
}

export interface LogSummary {
  totalEntries: number;
  byLevel: Record<string, number>;
  bySource: Record<string, number>;
  recentErrors: LogEntry[];
  timeRange: { start: Date | null; end: Date | null };
}

export class LogAggregator {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = resolve(rootPath);
  }

  async getRecentLogs(limit = 200): Promise<LogEntry[]> {
    const entries: LogEntry[] = [];

    // Try to read any .log files in the project
    const logFiles = this.findLogFiles();
    for (const logFile of logFiles.slice(0, 5)) {
      try {
        const content = readFileSync(logFile, "utf8");
        const parsed = this.parseAnsibleLog(content, logFile);
        entries.push(...parsed);
      } catch {
        // Skip unreadable files
      }
    }

    // Also check for ansible fact cache or stdout logs
    const factCacheDir = join(this.rootPath, "artifacts");
    if (existsSync(factCacheDir)) {
      // Could read artifact logs here
    }

    return entries
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  getLogSummary(): LogSummary {
    // This is a lightweight summary - could be enhanced by reading actual logs
    const byLevel: Record<string, number> = { DEBUG: 0, INFO: 0, WARNING: 0, ERROR: 0, CRITICAL: 0 };
    const bySource: Record<string, number> = {};
    const recentErrors: LogEntry[] = [];

    const logFiles = this.findLogFiles();
    for (const logFile of logFiles) {
      const source = logFile.split("/").pop() || "unknown";
      bySource[source] = (bySource[source] || 0) + 1;
    }

    return {
      totalEntries: 0,
      byLevel,
      bySource,
      recentErrors,
      timeRange: { start: null, end: null },
    };
  }

  private findLogFiles(): string[] {
    const logs: string[] = [];
    if (!existsSync(this.rootPath)) return logs;

    try {
      const entries = readdirSync(this.rootPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".log")) {
          logs.push(join(this.rootPath, entry.name));
        }
      }
    } catch {
      // Ignore
    }

    return logs;
  }

  private parseAnsibleLog(content: string, sourcePath: string): LogEntry[] {
    const entries: LogEntry[] = [];
    const lines = content.split(/\r?\n/);
    const source = sourcePath.split("/").pop() || "unknown";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let level: LogEntry["level"] = "INFO";
      if (trimmed.includes("FAILED") || trimmed.includes("fatal:")) level = "ERROR";
      else if (trimmed.includes("WARNING")) level = "WARNING";
      else if (trimmed.includes("changed=")) level = "INFO";
      else if (trimmed.includes("ok=")) level = "INFO";
      else if (trimmed.includes("UNREACHABLE")) level = "CRITICAL";

      const hostMatch = trimmed.match(/\[(\w+)\]/);
      const taskMatch = trimmed.match(/TASK\s+\[(.+?)\]/);

      entries.push({
        id: crypto.randomUUID(),
        timestamp: new Date(), // Logs often lack timestamps; use now as fallback
        source,
        level,
        message: trimmed,
        host: hostMatch?.[1],
        task: taskMatch?.[1],
      });
    }

    return entries;
  }
}
