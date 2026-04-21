import type { Database } from "./database";

export interface NotificationConfig {
  webhookUrl: string;
  webhookEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  emailFrom: string;
  emailTo: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
}

export interface AppNotification {
  id: string;
  timestamp: Date;
  type: "INFO" | "WARNING" | "ALERT" | "CRITICAL";
  title: string;
  body: string;
  read: boolean;
  source: string;
}

const DEFAULT_CONFIG: NotificationConfig = {
  webhookUrl: "",
  webhookEnabled: false,
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpPass: "",
  emailFrom: "",
  emailTo: "",
  emailEnabled: false,
  inAppEnabled: true,
};

export class NotificationEngine {
  private readonly db: Database;
  private config: NotificationConfig;

  constructor(db: Database) {
    this.db = db;
    this.db.initNotifications();
    this.config = this.loadConfig();
  }

  async send(notification: Omit<AppNotification, "id" | "timestamp" | "read">): Promise<AppNotification> {
    const entry: AppNotification = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      read: false,
      ...notification,
    };

    // Always store in-app
    if (this.config.inAppEnabled) {
      this.db.insertNotification(entry);
    }

    // Webhook dispatch
    if (this.config.webhookEnabled && this.config.webhookUrl) {
      this.dispatchWebhook(entry).catch((err) => {
        console.error("Webhook dispatch failed:", err);
      });
    }

    // SMTP dispatch
    if (this.config.emailEnabled && this.config.smtpHost && this.config.emailTo) {
      this.dispatchEmail(entry).catch((err) => {
        console.error("Email dispatch failed:", err);
      });
    }

    return entry;
  }

  async sendAlert(title: string, body: string, source: string): Promise<AppNotification> {
    return this.send({ type: "ALERT", title, body, source });
  }

  async sendWarning(title: string, body: string, source: string): Promise<AppNotification> {
    return this.send({ type: "WARNING", title, body, source });
  }

  async sendInfo(title: string, body: string, source: string): Promise<AppNotification> {
    return this.send({ type: "INFO", title, body, source });
  }

  async sendCritical(title: string, body: string, source: string): Promise<AppNotification> {
    return this.send({ type: "CRITICAL", title, body, source });
  }

  getUnread(): AppNotification[] {
    return this.db.getUnreadNotifications();
  }

  getAll(limit = 100): AppNotification[] {
    return this.db.getNotifications(limit);
  }

  markRead(id: string): void {
    this.db.markNotificationRead(id);
  }

  markAllRead(): void {
    this.db.markAllNotificationsRead();
  }

  getConfig(): NotificationConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();
  }

  async testWebhook(): Promise<boolean> {
    if (!this.config.webhookUrl) return false;
    try {
      const response = await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "MDG Test Notification",
          source: "Mission Data Grid",
          timestamp: new Date().toISOString(),
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async dispatchWebhook(notification: AppNotification): Promise<void> {
    const payload = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      source: notification.source,
      timestamp: notification.timestamp.toISOString(),
      application: "Mission Data Grid",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async dispatchEmail(notification: AppNotification): Promise<void> {
    // SMTP email sending via raw socket connection
    // This is a simplified implementation - for production, use a proper SMTP library
    try {
      const { smtpHost, smtpPort, smtpUser, smtpPass, emailFrom, emailTo } = this.config;

      const subject = `[MDG ${notification.type}] ${notification.title}`;
      const body = [
        `Mission Data Grid Notification`,
        ``,
        `Type: ${notification.type}`,
        `Source: ${notification.source}`,
        `Time: ${notification.timestamp.toISOString()}`,
        ``,
        notification.body,
      ].join("\r\n");

      // Use curl to send via SMTP as a fallback approach
      const proc = Bun.spawn([
        "curl", "--silent", "--ssl-reqd",
        `smtp://${smtpHost}:${smtpPort}`,
        "--mail-from", emailFrom,
        "--mail-rcpt", emailTo,
        "--user", `${smtpUser}:${smtpPass}`,
        "-T", "-",
      ], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });

      const message = [
        `From: ${emailFrom}`,
        `To: ${emailTo}`,
        `Subject: ${subject}`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        body,
      ].join("\r\n");

      proc.stdin.write(message);
      proc.stdin.end();
      await proc.exited;
    } catch (error) {
      console.error("SMTP send failed:", error);
    }
  }

  private loadConfig(): NotificationConfig {
    const stored = this.db.getNotificationConfig();
    return stored ? { ...DEFAULT_CONFIG, ...stored } : { ...DEFAULT_CONFIG };
  }

  private saveConfig(): void {
    this.db.saveNotificationConfig(this.config);
  }
}
