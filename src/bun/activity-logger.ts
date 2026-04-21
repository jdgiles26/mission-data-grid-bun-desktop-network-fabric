import type { Database } from "./database";

export interface ActivityEvent {
  id: string;
  timestamp: Date;
  type: "SYNC" | "DEVICE" | "SECURITY" | "SYSTEM" | "USER" | "MESH" | "AI";
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  title: string;
  detail: string;
  source: string;
}

export class ActivityLogger {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    this.db.initActivityLog();
  }

  log(event: Omit<ActivityEvent, "id" | "timestamp">): ActivityEvent {
    const entry: ActivityEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...event,
    };
    this.db.insertActivityEvent(entry);
    return entry;
  }

  info(title: string, detail: string, source: string, type: ActivityEvent["type"] = "SYSTEM"): void {
    this.log({ type, severity: "INFO", title, detail, source });
  }

  warn(title: string, detail: string, source: string, type: ActivityEvent["type"] = "SYSTEM"): void {
    this.log({ type, severity: "WARNING", title, detail, source });
  }

  error(title: string, detail: string, source: string, type: ActivityEvent["type"] = "SYSTEM"): void {
    this.log({ type, severity: "ERROR", title, detail, source });
  }

  critical(title: string, detail: string, source: string, type: ActivityEvent["type"] = "SYSTEM"): void {
    this.log({ type, severity: "CRITICAL", title, detail, source });
  }

  getRecent(limit = 50): ActivityEvent[] {
    return this.db.getActivityEvents(limit);
  }

  getByType(type: ActivityEvent["type"], limit = 50): ActivityEvent[] {
    return this.db.getActivityEventsByType(type, limit);
  }

  getBySeverity(severity: ActivityEvent["severity"], limit = 50): ActivityEvent[] {
    return this.db.getActivityEventsBySeverity(severity, limit);
  }
}
