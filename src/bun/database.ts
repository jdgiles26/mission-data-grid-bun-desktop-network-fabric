
import SQLiteDatabase from "bun:sqlite";
import { existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { MDGDataRecord, MissionKit } from "../shared/types";
import type { ActivityEvent } from "./activity-logger";
import type { AppNotification, NotificationConfig } from "./notification-engine";
import type { AssistantMessage } from "./ai-assistant";
import type { NetworkMode, UniversalTelemetryEvent } from "./network-intelligence";

export interface StoredCredentials {
  apiKey?: string;
  jwtToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  codiceBaseUrl?: string;
  autonetRoot?: string;
}

export interface RuntimeSettings {
  syncIntervalSeconds: number;
  autoSync: boolean;
  networkMode: NetworkMode;
  selectedNetworkInterface: string;
  autonetMonitoringEnabled: boolean;
}

export class Database {
  private readonly db: SQLiteDatabase;
  private readonly dbPath: string;

  constructor() {
    const dataDir = join(homedir(), "Library/Application Support/MissionDataGrid");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = join(dataDir, "mission-data-grid.db");
    this.db = new SQLiteDatabase(this.dbPath, { create: true });
    this.initializeTables();
    console.log(`Database initialized at ${this.dbPath}`);
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mission_kits (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        mission_id INTEGER NOT NULL,
        kit_id INTEGER NOT NULL,
        lan_subnet TEXT NOT NULL,
        wireguard_ip TEXT NOT NULL,
        bgp_as INTEGER NOT NULL,
        status TEXT NOT NULL,
        last_seen TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS data_records (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        kit_id TEXT NOT NULL,
        priority TEXT NOT NULL,
        classification TEXT NOT NULL,
        data_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0,
        sync_error TEXT
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS universal_telemetry_events (
        id TEXT PRIMARY KEY,
        captured_at TEXT NOT NULL,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        source TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        detail TEXT NOT NULL,
        interface_name TEXT,
        data_json TEXT NOT NULL
      );
    `);

    // Initialize Phase 9 Intelligence Tiers tables
    this.initializeIntelligenceTables();
  }

  saveMissionKits(kits: MissionKit[]): void {
    const clear = this.db.prepare("DELETE FROM mission_kits");
    const insert = this.db.prepare(`
      INSERT INTO mission_kits (
        id, name, mission_id, kit_id, lan_subnet, wireguard_ip, bgp_as, status, last_seen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((incomingKits: MissionKit[]) => {
      clear.run();
      for (const kit of incomingKits) {
        insert.run(
          kit.id,
          kit.name,
          kit.missionId,
          kit.kitId,
          kit.lanSubnet,
          kit.wireguardIP,
          kit.bgpAS,
          kit.status,
          kit.lastSeen.toISOString(),
        );
      }
    });

    transaction(kits);
  }

  getMissionKits(): MissionKit[] {
    const rows = this.db.prepare(`
      SELECT id, name, mission_id, kit_id, lan_subnet, wireguard_ip, bgp_as, status, last_seen
      FROM mission_kits
      ORDER BY mission_id, kit_id
    `).all() as Array<{
      id: string;
      name: string;
      mission_id: number;
      kit_id: number;
      lan_subnet: string;
      wireguard_ip: string;
      bgp_as: number;
      status: MissionKit["status"];
      last_seen: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      missionId: row.mission_id,
      kitId: row.kit_id,
      lanSubnet: row.lan_subnet,
      wireguardIP: row.wireguard_ip,
      bgpAS: row.bgp_as,
      status: row.status,
      lastSeen: new Date(row.last_seen),
    }));
  }

  getDataRecords(limit = 100, kitId?: string): MDGDataRecord[] {
    const sql = kitId
      ? `SELECT * FROM data_records WHERE kit_id = ? ORDER BY timestamp DESC LIMIT ?`
      : `SELECT * FROM data_records ORDER BY timestamp DESC LIMIT ?`;
    const rows = kitId
      ? this.db.prepare(sql).all(kitId, limit)
      : this.db.prepare(sql).all(limit);

    return (rows as Array<Record<string, unknown>>).map((row) => this.mapRecordRow(row));
  }

  saveDataRecord(record: MDGDataRecord): void {
    this.db.prepare(`
      INSERT INTO data_records (
        id, timestamp, kit_id, priority, classification, data_type, payload_json, synced, sync_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        timestamp = excluded.timestamp,
        kit_id = excluded.kit_id,
        priority = excluded.priority,
        classification = excluded.classification,
        data_type = excluded.data_type,
        payload_json = excluded.payload_json,
        synced = excluded.synced,
        sync_error = excluded.sync_error
    `).run(
      record.id,
      record.timestamp.toISOString(),
      record.kitId,
      record.priority,
      record.classification,
      record.dataType,
      JSON.stringify(record.payload ?? {}),
      record.synced ? 1 : 0,
      record.syncError ?? null,
    );
  }

  markRecordSynced(id: string): void {
    this.db.prepare(`
      UPDATE data_records
      SET synced = 1, sync_error = NULL
      WHERE id = ?
    `).run(id);
  }

  markRecordFailed(id: string, error: string): void {
    this.db.prepare(`
      UPDATE data_records
      SET sync_error = ?, synced = 0
      WHERE id = ?
    `).run(error, id);
  }

  getUnsyncedRecords(): MDGDataRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM data_records
      WHERE synced = 0
      ORDER BY timestamp ASC
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapRecordRow(row));
  }

  getSyncStats(): { pending: number; synced: number; failed: number } {
    const row = this.db.prepare(`
      SELECT
        SUM(CASE WHEN synced = 0 THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN synced = 1 THEN 1 ELSE 0 END) AS synced,
        SUM(CASE WHEN sync_error IS NOT NULL AND sync_error != '' THEN 1 ELSE 0 END) AS failed
      FROM data_records
    `).get() as { pending: number | null; synced: number | null; failed: number | null };

    return {
      pending: row.pending ?? 0,
      synced: row.synced ?? 0,
      failed: row.failed ?? 0,
    };
  }

  clearDataRecords(): number {
    const result = this.db.prepare(`DELETE FROM data_records`).run();
    return result.changes ?? 0;
  }

  saveCredentials(credentials: StoredCredentials): void {
    const merged = {
      ...this.getCredentials(),
      ...credentials,
    };

    this.setConfigValue("api_key", merged.apiKey ?? "");
    this.setConfigValue("jwt_token", merged.jwtToken ?? "");
    this.setConfigValue("refresh_token", merged.refreshToken ?? "");
    this.setConfigValue("expires_at", merged.expiresAt ? merged.expiresAt.toISOString() : "");
    this.setConfigValue("codice_base_url", merged.codiceBaseUrl ?? "");
    this.setConfigValue("autonet_root", merged.autonetRoot ?? "");
  }

  getCredentials(): StoredCredentials {
    const apiKey = this.getConfigValue("api_key");
    const jwtToken = this.getConfigValue("jwt_token");
    const refreshToken = this.getConfigValue("refresh_token");
    const expiresAtRaw = this.getConfigValue("expires_at");
    const codiceBaseUrl = this.getConfigValue("codice_base_url");
    const autonetRoot = this.getConfigValue("autonet_root");

    return {
      apiKey: apiKey || undefined,
      jwtToken: jwtToken || undefined,
      refreshToken: refreshToken || undefined,
      expiresAt: expiresAtRaw ? new Date(expiresAtRaw) : undefined,
      codiceBaseUrl: codiceBaseUrl || undefined,
      autonetRoot: autonetRoot || undefined,
    };
  }

  saveRuntimeSettings(settings: Partial<RuntimeSettings>): void {
    if (typeof settings.syncIntervalSeconds === "number" && Number.isFinite(settings.syncIntervalSeconds)) {
      this.setConfigValue("sync_interval_seconds", String(Math.max(15, Math.floor(settings.syncIntervalSeconds))));
    }

    if (typeof settings.autoSync === "boolean") {
      this.setConfigValue("auto_sync", settings.autoSync ? "1" : "0");
    }

    if (settings.networkMode === "AUTONET_ASSIST" || settings.networkMode === "UNIVERSAL_INTEL") {
      this.setConfigValue("network_mode", settings.networkMode);
    }

    if (typeof settings.selectedNetworkInterface === "string") {
      this.setConfigValue("selected_network_interface", settings.selectedNetworkInterface.trim());
    }

    if (typeof settings.autonetMonitoringEnabled === "boolean") {
      this.setConfigValue("autonet_monitoring_enabled", settings.autonetMonitoringEnabled ? "1" : "0");
    }
  }

  getRuntimeSettings(): RuntimeSettings {
    const syncIntervalRaw = this.getConfigValue("sync_interval_seconds");
    const autoSyncRaw = this.getConfigValue("auto_sync");
    const networkModeRaw = this.getConfigValue("network_mode");
    const selectedNetworkInterfaceRaw = this.getConfigValue("selected_network_interface");
    const autonetMonitoringRaw = this.getConfigValue("autonet_monitoring_enabled");

    return {
      syncIntervalSeconds: syncIntervalRaw ? Math.max(15, parseInt(syncIntervalRaw, 10) || 300) : 300,
      autoSync: autoSyncRaw ? autoSyncRaw === "1" : true,
      networkMode: networkModeRaw === "UNIVERSAL_INTEL" ? "UNIVERSAL_INTEL" : "AUTONET_ASSIST",
      selectedNetworkInterface: selectedNetworkInterfaceRaw || "",
      autonetMonitoringEnabled: autonetMonitoringRaw === "1",
    };
  }

  getStorageStats(): { dbPath: string; dbSizeBytes: number; records: number } {
    const recordRow = this.db.prepare(`
      SELECT (
        (SELECT COUNT(*) FROM data_records) +
        (SELECT COUNT(*) FROM universal_telemetry_events)
      ) AS count
    `).get() as { count: number };
    const dbSizeBytes = existsSync(this.dbPath) ? statSync(this.dbPath).size : 0;

    return {
      dbPath: this.dbPath,
      dbSizeBytes,
      records: recordRow.count ?? 0,
    };
  }

  saveUniversalTelemetryEvents(events: UniversalTelemetryEvent[]): number {
    if (events.length === 0) {
      return 0;
    }

    const insert = this.db.prepare(`
      INSERT INTO universal_telemetry_events (
        id, captured_at, event_type, severity, source, title, summary, detail, interface_name, data_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        captured_at = excluded.captured_at,
        event_type = excluded.event_type,
        severity = excluded.severity,
        source = excluded.source,
        title = excluded.title,
        summary = excluded.summary,
        detail = excluded.detail,
        interface_name = excluded.interface_name,
        data_json = excluded.data_json
    `);

    const transaction = this.db.transaction((incoming: UniversalTelemetryEvent[]) => {
      for (const event of incoming) {
        insert.run(
          event.id,
          event.capturedAt.toISOString(),
          event.eventType,
          event.severity,
          event.source,
          event.title,
          event.summary,
          event.detail,
          event.interfaceName ?? null,
          JSON.stringify(event.data ?? {}),
        );
      }

      this.db.prepare(`
        DELETE FROM universal_telemetry_events
        WHERE id NOT IN (
          SELECT id FROM universal_telemetry_events
          ORDER BY captured_at DESC
          LIMIT 5000
        )
      `).run();
    });

    transaction(events);
    return events.length;
  }

  getUniversalTelemetryEvents(limit = 500): UniversalTelemetryEvent[] {
    const rows = this.db.prepare(`
      SELECT id, captured_at, event_type, severity, source, title, summary, detail, interface_name, data_json
      FROM universal_telemetry_events
      ORDER BY captured_at DESC
      LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      capturedAt: new Date(String(row.captured_at)),
      eventType: String(row.event_type) as UniversalTelemetryEvent["eventType"],
      severity: String(row.severity) as UniversalTelemetryEvent["severity"],
      source: String(row.source),
      title: String(row.title),
      summary: String(row.summary),
      detail: String(row.detail),
      interfaceName: row.interface_name ? String(row.interface_name) : undefined,
      data: JSON.parse(String(row.data_json || "{}")) as Record<string, unknown>,
    }));
  }

  clearUniversalTelemetryEvents(): number {
    const result = this.db.prepare(`DELETE FROM universal_telemetry_events`).run();
    return result.changes ?? 0;
  }

  // --- Activity Log ---

  initActivityLog(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        source TEXT NOT NULL
      );
    `);
  }

  insertActivityEvent(event: ActivityEvent): void {
    this.db.prepare(`
      INSERT INTO activity_log (id, timestamp, type, severity, title, detail, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(event.id, event.timestamp.toISOString(), event.type, event.severity, event.title, event.detail, event.source);
  }

  getActivityEvents(limit = 50): ActivityEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      timestamp: new Date(String(row.timestamp)),
      type: String(row.type) as ActivityEvent["type"],
      severity: String(row.severity) as ActivityEvent["severity"],
      title: String(row.title),
      detail: String(row.detail),
      source: String(row.source),
    }));
  }

  getActivityEventsByType(type: string, limit = 50): ActivityEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM activity_log WHERE type = ? ORDER BY timestamp DESC LIMIT ?
    `).all(type, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      timestamp: new Date(String(row.timestamp)),
      type: String(row.type) as ActivityEvent["type"],
      severity: String(row.severity) as ActivityEvent["severity"],
      title: String(row.title),
      detail: String(row.detail),
      source: String(row.source),
    }));
  }

  getActivityEventsBySeverity(severity: string, limit = 50): ActivityEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM activity_log WHERE severity = ? ORDER BY timestamp DESC LIMIT ?
    `).all(severity, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      timestamp: new Date(String(row.timestamp)),
      type: String(row.type) as ActivityEvent["type"],
      severity: String(row.severity) as ActivityEvent["severity"],
      title: String(row.title),
      detail: String(row.detail),
      source: String(row.source),
    }));
  }

  // --- Notifications ---

  initNotifications(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL
      );
    `);
  }

  insertNotification(n: AppNotification): void {
    this.db.prepare(`
      INSERT INTO notifications (id, timestamp, type, title, body, read, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(n.id, n.timestamp.toISOString(), n.type, n.title, n.body, n.read ? 1 : 0, n.source);
  }

  getNotifications(limit = 100): AppNotification[] {
    const rows = this.db.prepare(`
      SELECT * FROM notifications ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapNotificationRow(row));
  }

  getUnreadNotifications(): AppNotification[] {
    const rows = this.db.prepare(`
      SELECT * FROM notifications WHERE read = 0 ORDER BY timestamp DESC
    `).all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapNotificationRow(row));
  }

  markNotificationRead(id: string): void {
    this.db.prepare(`UPDATE notifications SET read = 1 WHERE id = ?`).run(id);
  }

  markAllNotificationsRead(): void {
    this.db.prepare(`UPDATE notifications SET read = 1 WHERE read = 0`).run();
  }

  getNotificationConfig(): Partial<NotificationConfig> | null {
    const raw = this.getConfigValue("notification_config");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  saveNotificationConfig(config: NotificationConfig): void {
    this.setConfigValue("notification_config", JSON.stringify(config));
  }

  // --- AI Messages ---

  initAIMessages(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
    `);
  }

  saveAIMessage(msg: AssistantMessage): void {
    this.db.prepare(`
      INSERT INTO ai_messages (id, role, content, timestamp)
      VALUES (?, ?, ?, ?)
    `).run(msg.id, msg.role, msg.content, msg.timestamp.toISOString());
  }

  getAIMessages(limit = 50): AssistantMessage[] {
    const rows = this.db.prepare(`
      SELECT * FROM ai_messages ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      role: String(row.role) as AssistantMessage["role"],
      content: String(row.content),
      timestamp: new Date(String(row.timestamp)),
    })).reverse();
  }

  clearAIMessages(): void {
    this.db.prepare(`DELETE FROM ai_messages`).run();
  }

  close(): void {
    this.db.close();
  }

  private getConfigValue(key: string): string | undefined {
    const row = this.db.prepare(`SELECT value FROM app_config WHERE key = ?`).get(key) as { value: string } | null;
    if (!row) {
      return undefined;
    }
    return row.value;
  }

  private setConfigValue(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO app_config (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  private mapNotificationRow(row: Record<string, unknown>): AppNotification {
    return {
      id: String(row.id),
      timestamp: new Date(String(row.timestamp)),
      type: String(row.type) as AppNotification["type"],
      title: String(row.title),
      body: String(row.body),
      read: Number(row.read) === 1,
      source: String(row.source),
    };
  }

  private mapRecordRow(row: Record<string, unknown>): MDGDataRecord {
    return {
      id: String(row.id),
      timestamp: new Date(String(row.timestamp)),
      kitId: String(row.kit_id),
      priority: row.priority as MDGDataRecord["priority"],
      classification: row.classification as MDGDataRecord["classification"],
      dataType: row.data_type as MDGDataRecord["dataType"],
      payload: JSON.parse(String(row.payload_json || "{}")) as Record<string, unknown>,
      synced: Number(row.synced) === 1,
      syncError: row.sync_error ? String(row.sync_error) : undefined,
    };
  }

  // Phase 9: Intelligence Tiers Methods
  initializeIntelligenceTables(): void {
    // Predictive Failure Analytics Tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS predictions (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        kit_id TEXT NOT NULL,
        failure_type TEXT NOT NULL,
        predicted_at TEXT NOT NULL,
        forecasted_time TEXT NOT NULL,
        confidence_score REAL NOT NULL,
        failure_probability REAL NOT NULL,
        sla_impact_hours REAL,
        contributing_factors TEXT NOT NULL,
        recommendation TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_predictions_kit ON predictions(kit_id);
      CREATE INDEX IF NOT EXISTS idx_predictions_time ON predictions(forecasted_time);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS anomalies (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        kit_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        actual_value REAL NOT NULL,
        expected_value REAL NOT NULL,
        deviation_percent REAL NOT NULL,
        severity TEXT NOT NULL,
        pattern_id TEXT,
        detected_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_anomalies_kit ON anomalies(kit_id);
      CREATE INDEX IF NOT EXISTS idx_anomalies_metric ON anomalies(metric_name);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS forecasts (
        id TEXT PRIMARY KEY,
        kit_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        forecast_period TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        forecasted_values TEXT NOT NULL,
        confidence_lower REAL NOT NULL,
        confidence_upper REAL NOT NULL,
        model_type TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_forecasts_kit ON forecasts(kit_id);
    `);

    // Coalition Health Correlation Tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kit_dependencies (
        id TEXT PRIMARY KEY,
        source_kit_id TEXT NOT NULL,
        target_kit_id TEXT NOT NULL,
        dependency_type TEXT NOT NULL,
        criticality TEXT NOT NULL,
        last_updated TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_deps_source ON kit_dependencies(source_kit_id);
      CREATE INDEX IF NOT EXISTS idx_deps_target ON kit_dependencies(target_kit_id);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cross_kit_events (
        id TEXT PRIMARY KEY,
        source_kit_id TEXT NOT NULL,
        target_kit_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        impact_score REAL NOT NULL,
        propagation_chain TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cross_events_time ON cross_kit_events(timestamp);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS coalition_score (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        overall_score REAL NOT NULL,
        health_by_kit TEXT NOT NULL,
        risk_level TEXT NOT NULL
      );
    `);

    // Network Optimization Engine Tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS network_paths (
        id TEXT PRIMARY KEY,
        source_kit_id TEXT NOT NULL,
        destination_kit_id TEXT NOT NULL,
        path_hops TEXT NOT NULL,
        current_bandwidth REAL NOT NULL,
        max_bandwidth REAL NOT NULL,
        latency_ms REAL NOT NULL,
        loss_percent REAL NOT NULL,
        last_measured TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_paths_source ON network_paths(source_kit_id);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS utilization_history (
        id TEXT PRIMARY KEY,
        path_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        bandwidth_used REAL NOT NULL,
        bandwidth_percent REAL NOT NULL,
        packet_loss_rate REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_util_path ON utilization_history(path_id);
      CREATE INDEX IF NOT EXISTS idx_util_time ON utilization_history(timestamp);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS optimization_suggestions (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        suggestion_type TEXT NOT NULL,
        affected_paths TEXT NOT NULL,
        current_efficiency REAL NOT NULL,
        projected_efficiency REAL NOT NULL,
        estimated_improvement_percent REAL NOT NULL,
        action_description TEXT NOT NULL
      );
    `);

    // Configuration Drift Intelligence Tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config_versions (
        id TEXT PRIMARY KEY,
        kit_id TEXT NOT NULL,
        config_hash TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        config_json TEXT NOT NULL,
        changed_fields TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_config_kit ON config_versions(kit_id);
      CREATE INDEX IF NOT EXISTS idx_config_time ON config_versions(timestamp);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS drift_events (
        id TEXT PRIMARY KEY,
        kit_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        drift_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        expected_config_hash TEXT NOT NULL,
        actual_config_hash TEXT NOT NULL,
        drift_detail TEXT NOT NULL,
        is_approved INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_drift_kit ON drift_events(kit_id);
      CREATE INDEX IF NOT EXISTS idx_drift_time ON drift_events(timestamp);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS approved_variations (
        id TEXT PRIMARY KEY,
        kit_id TEXT NOT NULL,
        config_field TEXT NOT NULL,
        approved_values TEXT NOT NULL,
        reason TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        expires_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_approved_kit ON approved_variations(kit_id);
    `);

    // Performance Intelligence Tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        kit_id TEXT NOT NULL,
        application_name TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL,
        percentile_95 REAL,
        percentile_99 REAL
      );
      CREATE INDEX IF NOT EXISTS idx_perf_kit ON performance_metrics(kit_id);
      CREATE INDEX IF NOT EXISTS idx_perf_app ON performance_metrics(application_name);
      CREATE INDEX IF NOT EXISTS idx_perf_time ON performance_metrics(timestamp);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS slo_tracking (
        id TEXT PRIMARY KEY,
        kit_id TEXT NOT NULL,
        service_name TEXT NOT NULL,
        slo_type TEXT NOT NULL,
        target_percent REAL NOT NULL,
        current_achievement_percent REAL NOT NULL,
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_slo_service ON slo_tracking(service_name);
      CREATE INDEX IF NOT EXISTS idx_slo_time ON slo_tracking(timestamp);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS error_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        kit_id TEXT NOT NULL,
        service_name TEXT NOT NULL,
        error_type TEXT NOT NULL,
        error_rate REAL NOT NULL,
        error_count INTEGER NOT NULL,
        affected_requests INTEGER NOT NULL,
        impact_score REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_errors_service ON error_events(service_name);
      CREATE INDEX IF NOT EXISTS idx_errors_time ON error_events(timestamp);
    `);
  }

  // Phase 2: Packet Capture Methods
  initializePacketTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS capture_sessions (
        id TEXT PRIMARY KEY,
        interface_name TEXT NOT NULL,
        config TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        total_packets INTEGER DEFAULT 0,
        total_bytes INTEGER DEFAULT 0,
        unique_flows INTEGER DEFAULT 0,
        active_flows INTEGER DEFAULT 0,
        terminated_flows INTEGER DEFAULT 0,
        bpf_filter TEXT
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS packet_flows (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        capture_interface TEXT NOT NULL,
        capture_started_at TEXT NOT NULL,
        protocol TEXT NOT NULL,
        source_ip TEXT NOT NULL,
        source_port INTEGER NOT NULL,
        destination_ip TEXT NOT NULL,
        destination_port INTEGER NOT NULL,
        l2_protocol TEXT NOT NULL,
        l3_protocol TEXT NOT NULL,
        l4_protocol TEXT NOT NULL,
        l7_protocol TEXT,
        packet_count INTEGER DEFAULT 0,
        byte_count INTEGER DEFAULT 0,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        has_http INTEGER DEFAULT 0,
        has_dns INTEGER DEFAULT 0,
        has_tls INTEGER DEFAULT 0,
        tls_sni TEXT,
        terminated INTEGER DEFAULT 0
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dns_queries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        query_name TEXT NOT NULL,
        query_type TEXT NOT NULL,
        source_ip TEXT NOT NULL,
        destination_ip TEXT NOT NULL,
        latency_ms INTEGER
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS http_transactions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        request_timestamp TEXT NOT NULL,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        host TEXT,
        status_code INTEGER,
        latency_ms INTEGER,
        source_ip TEXT NOT NULL,
        destination_ip TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_flows_session ON packet_flows(session_id);
      CREATE INDEX IF NOT EXISTS idx_dns_session ON dns_queries(session_id);
      CREATE INDEX IF NOT EXISTS idx_http_session ON http_transactions(session_id);
    `);
  }
}
