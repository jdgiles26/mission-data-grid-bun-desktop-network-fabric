/**
 * Configuration Drift Intelligence Engine
 * 
 * Detects configuration drift, predicts change impacts, and suggests optimizations.
 */

import type SQLiteDatabase from "bun:sqlite";
import { randomUUID } from "crypto";
import { createHash } from "crypto";

export interface ConfigVersion {
  id: string;
  kitId: string;
  configHash: string;
  versionNumber: number;
  timestamp: Date;
  config: Record<string, unknown>;
  changedFields?: string[];
}

export interface DriftEvent {
  id: string;
  kitId: string;
  timestamp: Date;
  driftType: "UNAUTHORIZED" | "APPROVED_VARIATION" | "ROLLBACK" | "UPDATE";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  expectedConfigHash: string;
  actualConfigHash: string;
  driftDetail: string;
  isApproved: boolean;
}

export interface ApprovedVariation {
  id: string;
  kitId: string;
  configField: string;
  approvedValues: string[];
  reason: string;
  approvedAt: Date;
  expiresAt?: Date;
}

export interface ChangeImpactPrediction {
  changeDescription: string;
  affectedServices: string[];
  estimatedDowntime: number; // minutes
  rollbackComplexity: "LOW" | "MEDIUM" | "HIGH";
  riskScore: number; // 0-100
  recommendedActions: string[];
}

export class DriftIntelligence {
  private db: SQLiteDatabase;
  private approvedVariationsCache: Map<string, ApprovedVariation[]> = new Map();
  private cacheTTL = 10 * 60 * 1000; // 10 minutes
  private lastCacheUpdate = 0;

  constructor(database: SQLiteDatabase) {
    this.db = database;
  }

  /**
   * Detect configuration drift
   */
  async detectConfigDrift(
    kitId: string,
    currentConfig: Record<string, unknown>,
  ): Promise<DriftEvent | null> {
    try {
      // Get latest approved configuration
      const latestVersion = this.db
        .prepare(
          `
          SELECT id, config_hash, config_json, version_number
          FROM config_versions
          WHERE kit_id = ?
          ORDER BY version_number DESC
          LIMIT 1
        `,
        )
        .get(kitId) as
        | {
            id: string;
            config_hash: string;
            config_json: string;
            version_number: number;
          }
        | undefined;

      if (!latestVersion) {
        // First time seeing this kit - store it
        this.storeConfigVersion(kitId, currentConfig, 1);
        return null;
      }

      const currentHash = this.hashConfig(currentConfig);
      const expectedHash = latestVersion.config_hash;

      if (currentHash === expectedHash) {
        return null; // No drift
      }

      // Drift detected - analyze it
      const expectedConfig = JSON.parse(latestVersion.config_json) as Record<string, unknown>;
      const changedFields = this.getChangedFields(expectedConfig, currentConfig);
      const approvedVars = await this.getApprovedVariations(kitId);

      // Check if drift is within approved variations
      let isApproved = false;
      let driftType: DriftEvent["driftType"] = "UNAUTHORIZED";

      for (const field of changedFields) {
        const approved = approvedVars.find((av) => av.configField === field);
        if (approved) {
          const currentValue = String(this.getNestedValue(currentConfig, field));
          if (approved.approvedValues.includes(currentValue)) {
            isApproved = true;
            driftType = "APPROVED_VARIATION";
          }
        }
      }

      const severity = this.calculateDriftSeverity(changedFields, isApproved);

      const event: DriftEvent = {
        id: randomUUID(),
        kitId,
        timestamp: new Date(),
        driftType,
        severity,
        expectedConfigHash: expectedHash,
        actualConfigHash: currentHash,
        driftDetail: `Changed fields: ${changedFields.join(", ")}`,
        isApproved,
      };

      this.storeDriftEvent(event);
      return event;
    } catch (error) {
      console.error("Error detecting config drift:", error);
      return null;
    }
  }

  /**
   * Predict impact of configuration changes
   */
  async predictChangeImpact(
    kitId: string,
    proposedConfig: Record<string, unknown>,
    currentConfig: Record<string, unknown>,
  ): Promise<ChangeImpactPrediction> {
    const changedFields = this.getChangedFields(currentConfig, proposedConfig);
    const affectedServices: Set<string> = new Set();
    let estimatedDowntime = 0;
    let riskScore = 0;

    const recommendations: string[] = [];

    // Analyze each change
    for (const field of changedFields) {
      // Database-related changes often require downtime
      if (field.includes("database")) {
        affectedServices.add("database");
        estimatedDowntime = Math.max(estimatedDowntime, 15);
        riskScore += 25;
        recommendations.push("Backup database before applying this change");
      }

      // Network changes have high risk
      if (field.includes("network") || field.includes("port") || field.includes("interface")) {
        affectedServices.add("network");
        estimatedDowntime = Math.max(estimatedDowntime, 10);
        riskScore += 30;
        recommendations.push("Consider applying network changes during maintenance window");
      }

      // Authentication/Security changes
      if (
        field.includes("auth") ||
        field.includes("security") ||
        field.includes("certificate") ||
        field.includes("key")
      ) {
        affectedServices.add("security");
        estimatedDowntime = Math.max(estimatedDowntime, 5);
        riskScore += 40;
        recommendations.push("Verify all dependent services have valid credentials");
        recommendations.push("Plan rollback procedure before applying");
      }

      // Logging/Monitoring changes (usually safe)
      if (field.includes("log") || field.includes("monitor")) {
        riskScore += 5;
        recommendations.push("Monitor system after applying change");
      }
    }

    // Calculate rollback complexity
    let rollbackComplexity: ChangeImpactPrediction["rollbackComplexity"] = "LOW";
    if (changedFields.length > 5) {
      rollbackComplexity = "HIGH";
    } else if (changedFields.length > 2) {
      rollbackComplexity = "MEDIUM";
    }

    if (riskScore > 50) {
      rollbackComplexity = "HIGH";
    }

    if (recommendations.length === 0) {
      recommendations.push("This change appears to be low-risk. Apply normally.");
    }

    return {
      changeDescription: `Modifying ${changedFields.length} configuration fields`,
      affectedServices: Array.from(affectedServices),
      estimatedDowntime,
      rollbackComplexity,
      riskScore: Math.min(100, riskScore),
      recommendedActions: recommendations,
    };
  }

  /**
   * Suggest configuration optimizations
   */
  async suggestOptimizations(
    kitId: string,
    currentConfig: Record<string, unknown>,
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Check for common optimization opportunities
    const configStr = JSON.stringify(currentConfig).toLowerCase();

    // Memory optimization
    if (configStr.includes("memory") && !configStr.includes("cache")) {
      suggestions.push(
        "Consider enabling caching to reduce memory pressure and improve performance",
      );
    }

    // Network optimization
    if (configStr.includes("timeout") && configStr.match(/timeout["\s:]*[0-9]{4,}/)) {
      suggestions.push("Network timeouts appear very high. Consider reducing for faster failure detection");
    }

    // Logging optimization
    if (configStr.includes("loglevel") && configStr.includes("debug")) {
      suggestions.push(
        "Debug logging is enabled. Consider reducing to INFO level in production for better performance",
      );
    }

    // Connection pooling
    if (configStr.includes("database") && !configStr.includes("pool")) {
      suggestions.push("Consider enabling database connection pooling to improve throughput");
    }

    // Compression
    if (configStr.includes("traffic") && !configStr.includes("compress")) {
      suggestions.push("Enable traffic compression to reduce bandwidth usage");
    }

    return suggestions;
  }

  /**
   * Approve variations for specific configuration fields
   */
  async approveVariation(variation: ApprovedVariation): Promise<void> {
    try {
      this.db
        .prepare(
          `
          INSERT INTO approved_variations (
            id, kit_id, config_field, approved_values, reason, approved_at, expires_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          variation.id || randomUUID(),
          variation.kitId,
          variation.configField,
          JSON.stringify(variation.approvedValues),
          variation.reason,
          variation.approvedAt.toISOString(),
          variation.expiresAt?.toISOString() || null,
        );

      // Invalidate cache
      this.approvedVariationsCache.delete(variation.kitId);
    } catch (error) {
      console.error("Error approving variation:", error);
    }
  }

  /**
   * Get timeline of configuration changes
   */
  async getConfigTimeline(
    kitId: string,
    hoursBack: number = 168,
  ): Promise<Array<{
    timestamp: Date;
    versionNumber: number;
    changedFields: string[];
    drift?: DriftEvent;
  }>> {
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    try {
      const versions = this.db
        .prepare(
          `
          SELECT version_number, changed_fields, timestamp
          FROM config_versions
          WHERE kit_id = ? AND datetime(timestamp) >= datetime(?)
          ORDER BY version_number
        `,
        )
        .all(kitId, cutoffTime.toISOString()) as Array<{
        version_number: number;
        changed_fields: string | null;
        timestamp: string;
      }>;

      const timeline = versions.map((v) => ({
        timestamp: new Date(v.timestamp),
        versionNumber: v.version_number,
        changedFields: v.changed_fields ? JSON.parse(v.changed_fields) : [],
      }));

      return timeline;
    } catch (error) {
      console.error("Error retrieving config timeline:", error);
      return [];
    }
  }

  /**
   * Store configuration version
   */
  private storeConfigVersion(
    kitId: string,
    config: Record<string, unknown>,
    versionNumber: number,
    changedFields?: string[],
  ): void {
    try {
      const hash = this.hashConfig(config);

      this.db
        .prepare(
          `
          INSERT INTO config_versions (
            id, kit_id, config_hash, version_number, timestamp, config_json, changed_fields
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          randomUUID(),
          kitId,
          hash,
          versionNumber,
          new Date().toISOString(),
          JSON.stringify(config),
          changedFields ? JSON.stringify(changedFields) : null,
        );
    } catch (error) {
      console.error("Error storing config version:", error);
    }
  }

  /**
   * Store drift event
   */
  private storeDriftEvent(event: DriftEvent): void {
    try {
      this.db
        .prepare(
          `
          INSERT INTO drift_events (
            id, kit_id, timestamp, drift_type, severity, 
            expected_config_hash, actual_config_hash, drift_detail, is_approved
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          event.id,
          event.kitId,
          event.timestamp.toISOString(),
          event.driftType,
          event.severity,
          event.expectedConfigHash,
          event.actualConfigHash,
          event.driftDetail,
          event.isApproved ? 1 : 0,
        );
    } catch (error) {
      console.error("Error storing drift event:", error);
    }
  }

  /**
   * Get approved variations for a kit
   */
  private async getApprovedVariations(kitId: string): Promise<ApprovedVariation[]> {
    // Check cache
    if (
      this.approvedVariationsCache.has(kitId) &&
      Date.now() - this.lastCacheUpdate < this.cacheTTL
    ) {
      return this.approvedVariationsCache.get(kitId) || [];
    }

    try {
      const rows = this.db
        .prepare(
          `
          SELECT id, kit_id, config_field, approved_values, reason, approved_at, expires_at
          FROM approved_variations
          WHERE kit_id = ? AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
        `,
        )
        .all(kitId) as Array<{
        id: string;
        kit_id: string;
        config_field: string;
        approved_values: string;
        reason: string;
        approved_at: string;
        expires_at: string | null;
      }>;

      const variations = rows.map((row) => ({
        id: row.id,
        kitId: row.kit_id,
        configField: row.config_field,
        approvedValues: JSON.parse(row.approved_values),
        reason: row.reason,
        approvedAt: new Date(row.approved_at),
        expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      }));

      this.approvedVariationsCache.set(kitId, variations);
      this.lastCacheUpdate = Date.now();

      return variations;
    } catch (error) {
      console.error("Error retrieving approved variations:", error);
      return [];
    }
  }

  /**
   * Helper: Hash configuration
   */
  private hashConfig(config: Record<string, unknown>): string {
    const json = JSON.stringify(config, Object.keys(config).sort());
    return createHash("sha256").update(json).digest("hex");
  }

  /**
   * Helper: Get changed fields between two configs
   */
  private getChangedFields(
    oldConfig: Record<string, unknown>,
    newConfig: Record<string, unknown>,
  ): string[] {
    const changed: string[] = [];
    const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);

    for (const key of allKeys) {
      const oldValue = JSON.stringify(oldConfig[key]);
      const newValue = JSON.stringify(newConfig[key]);

      if (oldValue !== newValue) {
        changed.push(key);
      }
    }

    return changed;
  }

  /**
   * Helper: Get nested value from config
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce((current, prop) => {
      if (current && typeof current === "object" && prop in current) {
        return (current as Record<string, unknown>)[prop];
      }
      return undefined;
    }, obj as unknown);
  }

  /**
   * Helper: Calculate drift severity
   */
  private calculateDriftSeverity(fields: string[], isApproved: boolean): DriftEvent["severity"] {
    if (isApproved) return "LOW";

    const hasCriticalFields = fields.some(
      (f) =>
        f.includes("security") ||
        f.includes("auth") ||
        f.includes("database") ||
        f.includes("network"),
    );

    if (hasCriticalFields && fields.length > 3) return "CRITICAL";
    if (hasCriticalFields) return "HIGH";
    if (fields.length > 5) return "MEDIUM";
    return "LOW";
  }
}

export function createDriftIntelligence(database: SQLiteDatabase): DriftIntelligence {
  return new DriftIntelligence(database);
}
