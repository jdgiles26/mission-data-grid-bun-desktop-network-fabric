/**
 * Performance Intelligence Engine
 * 
 * Tracks SLO/SLI metrics, analyzes latency, and identifies performance bottlenecks.
 */

import type SQLiteDatabase from "bun:sqlite";
import { randomUUID } from "crypto";

export interface PerformanceMetric {
  id: string;
  timestamp: Date;
  kitId: string;
  applicationName: string;
  metricType: "LATENCY" | "THROUGHPUT" | "ERROR_RATE" | "CPU" | "MEMORY" | "DISK";
  value: number;
  unit: string;
  percentile95?: number;
  percentile99?: number;
}

export interface SLOTracking {
  id: string;
  kitId: string;
  serviceName: string;
  sloType: "AVAILABILITY" | "LATENCY" | "ERROR_RATE" | "THROUGHPUT";
  targetPercent: number;
  currentAchievementPercent: number;
  periodStart: Date;
  periodEnd: Date;
  timestamp: Date;
}

export interface ErrorEvent {
  id: string;
  timestamp: Date;
  kitId: string;
  serviceName: string;
  errorType: string;
  errorRate: number;
  errorCount: number;
  affectedRequests: number;
  impactScore: number; // 0-100
}

export interface UXImpactAssessment {
  serviceName: string;
  overallImpact: number; // 0-100
  affectedUsers: number;
  estimatedUserDegradation: number; // %
  criticalServiceFailures: string[];
  recommendations: string[];
}

export interface BottleneckAnalysis {
  bottleneck: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  currentMetric: number;
  targetMetric: number;
  degradationPercent: number;
  affectedServices: string[];
  rootCauses: string[];
}

export class PerformanceIntelligence {
  private db: SQLiteDatabase;
  private readonly SLO_WINDOW_HOURS = 24; // Calculate SLO over last 24h
  private readonly P95_THRESHOLD_MS = 200; // Latency p95 target
  private readonly P99_THRESHOLD_MS = 500; // Latency p99 target
  private readonly ERROR_RATE_TARGET = 0.1; // < 0.1%

  constructor(database: SQLiteDatabase) {
    this.db = database;
  }

  /**
   * Track SLO achievement for a service
   */
  async trackSLO(
    kitId: string,
    serviceName: string,
    metrics: PerformanceMetric[],
  ): Promise<SLOTracking[]> {
    const sloResults: SLOTracking[] = [];
    const now = new Date();
    const periodStart = new Date(now.getTime() - this.SLO_WINDOW_HOURS * 60 * 60 * 1000);

    // Calculate Availability SLO
    const errorCount = metrics
      .filter((m) => m.metricType === "ERROR_RATE")
      .reduce((sum, m) => sum + m.value, 0);
    const totalRequests = Math.max(1, errorCount / (this.ERROR_RATE_TARGET / 100));
    const availabilityPercent = Math.max(0, 100 - (errorCount / totalRequests) * 100);

    sloResults.push({
      id: randomUUID(),
      kitId,
      serviceName,
      sloType: "AVAILABILITY",
      targetPercent: 99.9,
      currentAchievementPercent: Math.round(availabilityPercent * 10) / 10,
      periodStart,
      periodEnd: now,
      timestamp: now,
    });

    // Calculate Latency SLO
    const latencyMetrics = metrics.filter((m) => m.metricType === "LATENCY");
    if (latencyMetrics.length > 0) {
      const p95 = this.calculatePercentile(
        latencyMetrics.map((m) => m.value),
        95,
      );
      const latencyTargetPercent = (p95 <= this.P95_THRESHOLD_MS ? 100 : 50) - (p95 / 1000) * 20;

      sloResults.push({
        id: randomUUID(),
        kitId,
        serviceName,
        sloType: "LATENCY",
        targetPercent: 95,
        currentAchievementPercent: Math.max(0, latencyTargetPercent),
        periodStart,
        periodEnd: now,
        timestamp: now,
      });
    }

    // Store SLO results
    for (const slo of sloResults) {
      this.storeSLOTracking(slo);
    }

    return sloResults;
  }

  /**
   * Analyze latency distribution and identify issues
   */
  async analyzeLatency(
    kitId: string,
    applicationName: string,
    hoursBack: number = 24,
  ): Promise<{
    p50: number;
    p95: number;
    p99: number;
    mean: number;
    stdev: number;
    outliers: number;
    healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL";
  }> {
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    try {
      const rows = this.db
        .prepare(
          `
          SELECT value
          FROM performance_metrics
          WHERE kit_id = ? AND application_name = ? AND metric_type = 'LATENCY'
          AND datetime(timestamp) >= datetime(?)
          ORDER BY value
          LIMIT 10000
        `,
        )
        .all(kitId, applicationName, cutoffTime.toISOString()) as Array<{
        value: number;
      }>;

      if (rows.length === 0) {
        return {
          p50: 0,
          p95: 0,
          p99: 0,
          mean: 0,
          stdev: 0,
          outliers: 0,
          healthStatus: "HEALTHY",
        };
      }

      const values = rows.map((r) => r.value);
      const sorted = [...values].sort((a, b) => a - b);

      // Calculate percentiles
      const p50 = this.calculatePercentile(sorted, 50);
      const p95 = this.calculatePercentile(sorted, 95);
      const p99 = this.calculatePercentile(sorted, 99);

      // Calculate mean and stdev
      const mean = values.reduce((a, b) => a + b) / values.length;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
      const stdev = Math.sqrt(variance);

      // Count outliers (> 3 standard deviations)
      const outliers = values.filter((v) => Math.abs(v - mean) > 3 * stdev).length;

      // Determine health status
      let healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" = "HEALTHY";
      if (p99 > this.P99_THRESHOLD_MS) healthStatus = "CRITICAL";
      else if (p95 > this.P95_THRESHOLD_MS) healthStatus = "DEGRADED";

      return {
        p50,
        p95,
        p99,
        mean,
        stdev,
        outliers,
        healthStatus,
      };
    } catch (error) {
      console.error("Error analyzing latency:", error);
      return {
        p50: 0,
        p95: 0,
        p99: 0,
        mean: 0,
        stdev: 0,
        outliers: 0,
        healthStatus: "HEALTHY",
      };
    }
  }

  /**
   * Assess user experience impact based on error rates
   */
  async assessUXImpact(kitId: string, timeWindowHours: number = 1): Promise<UXImpactAssessment> {
    const cutoffTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);

    try {
      const errorEvents = this.db
        .prepare(
          `
          SELECT service_name, error_rate, error_count, affected_requests, impact_score
          FROM error_events
          WHERE kit_id = ? AND datetime(timestamp) >= datetime(?)
          ORDER BY impact_score DESC
          LIMIT 100
        `,
        )
        .all(kitId, cutoffTime.toISOString()) as Array<{
        service_name: string;
        error_rate: number;
        error_count: number;
        affected_requests: number;
        impact_score: number;
      }>;

      if (errorEvents.length === 0) {
        return {
          serviceName: "System",
          overallImpact: 0,
          affectedUsers: 0,
          estimatedUserDegradation: 0,
          criticalServiceFailures: [],
          recommendations: ["System operating normally"],
        };
      }

      // Calculate aggregate metrics
      const totalAffectedRequests = errorEvents.reduce((sum, e) => sum + e.affected_requests, 0);
      const overallImpact = errorEvents.reduce((sum, e) => sum + e.impact_score, 0) / errorEvents.length;
      const criticalFailures = errorEvents
        .filter((e) => e.impact_score > 70)
        .map((e) => e.service_name);

      // Estimate affected users (assuming 100 requests per user)
      const affectedUsers = Math.ceil(totalAffectedRequests / 100);
      const estimatedDegradation = Math.min(100, (affectedUsers / 1000) * 100); // 1000 total users assumed

      const recommendations: string[] = [];
      if (overallImpact > 70) {
        recommendations.push("URGENT: Investigate critical service failures");
        recommendations.push("Consider graceful degradation or feature flags");
      }
      if (overallImpact > 40) {
        recommendations.push("Monitor closely and prepare rollback if degradation continues");
      }

      return {
        serviceName: "System",
        overallImpact,
        affectedUsers,
        estimatedUserDegradation: estimatedDegradation,
        criticalServiceFailures: criticalFailures,
        recommendations,
      };
    } catch (error) {
      console.error("Error assessing UX impact:", error);
      return {
        serviceName: "System",
        overallImpact: 0,
        affectedUsers: 0,
        estimatedUserDegradation: 0,
        criticalServiceFailures: [],
        recommendations: [],
      };
    }
  }

  /**
   * Identify performance bottlenecks
   */
  async identifyBottlenecks(kitId: string): Promise<BottleneckAnalysis[]> {
    const bottlenecks: BottleneckAnalysis[] = [];

    try {
      // Check latency
      const latencyMetrics = this.db
        .prepare(
          `
          SELECT application_name, AVG(value) as avg_latency, 
                 COUNT(*) as count
          FROM performance_metrics
          WHERE kit_id = ? AND metric_type = 'LATENCY'
          AND datetime(timestamp) >= datetime('now', '-1 hour')
          GROUP BY application_name
          HAVING avg_latency > ?
          ORDER BY avg_latency DESC
        `,
        )
        .all(kitId, this.P95_THRESHOLD_MS) as Array<{
        application_name: string;
        avg_latency: number;
        count: number;
      }>;

      for (const metric of latencyMetrics) {
        const degradation = ((metric.avg_latency - this.P95_THRESHOLD_MS) / this.P95_THRESHOLD_MS) * 100;

        bottlenecks.push({
          bottleneck: `High latency in ${metric.application_name}`,
          severity: degradation > 100 ? "CRITICAL" : "HIGH",
          currentMetric: Math.round(metric.avg_latency),
          targetMetric: this.P95_THRESHOLD_MS,
          degradationPercent: Math.round(degradation),
          affectedServices: [metric.application_name],
          rootCauses: [
            "Query optimization needed",
            "Insufficient resources (CPU/memory)",
            "Network congestion",
          ],
        });
      }

      // Check error rates
      const errorMetrics = this.db
        .prepare(
          `
          SELECT service_name, AVG(error_rate) as avg_error_rate
          FROM error_events
          WHERE kit_id = ?
          AND datetime(timestamp) >= datetime('now', '-1 hour')
          GROUP BY service_name
          HAVING avg_error_rate > ?
          ORDER BY avg_error_rate DESC
          LIMIT 5
        `,
        )
        .all(kitId, this.ERROR_RATE_TARGET) as Array<{
        service_name: string;
        avg_error_rate: number;
      }>;

      for (const metric of errorMetrics) {
        bottlenecks.push({
          bottleneck: `High error rate in ${metric.service_name}`,
          severity: metric.avg_error_rate > 1 ? "CRITICAL" : "HIGH",
          currentMetric: Math.round(metric.avg_error_rate * 100) / 100,
          targetMetric: this.ERROR_RATE_TARGET,
          degradationPercent: Math.round((metric.avg_error_rate / this.ERROR_RATE_TARGET) * 100),
          affectedServices: [metric.service_name],
          rootCauses: ["Recent deployment", "External service failure", "Resource exhaustion"],
        });
      }
    } catch (error) {
      console.error("Error identifying bottlenecks:", error);
    }

    return bottlenecks;
  }

  /**
   * Track error events
   */
  async recordErrorEvent(event: ErrorEvent): Promise<void> {
    try {
      this.db
        .prepare(
          `
          INSERT INTO error_events (
            id, timestamp, kit_id, service_name, error_type, 
            error_rate, error_count, affected_requests, impact_score
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          event.id || randomUUID(),
          event.timestamp.toISOString(),
          event.kitId,
          event.serviceName,
          event.errorType,
          event.errorRate,
          event.errorCount,
          event.affectedRequests,
          event.impactScore,
        );
    } catch (error) {
      console.error("Error recording error event:", error);
    }
  }

  /**
   * Store performance metric
   */
  async recordMetric(metric: PerformanceMetric): Promise<void> {
    try {
      this.db
        .prepare(
          `
          INSERT INTO performance_metrics (
            id, timestamp, kit_id, application_name, metric_type, 
            value, unit, percentile_95, percentile_99
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          metric.id || randomUUID(),
          metric.timestamp.toISOString(),
          metric.kitId,
          metric.applicationName,
          metric.metricType,
          metric.value,
          metric.unit,
          metric.percentile95 || null,
          metric.percentile99 || null,
        );
    } catch (error) {
      console.error("Error recording metric:", error);
    }
  }

  /**
   * Helper: Calculate percentile from sorted array
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)] || 0;
  }

  /**
   * Store SLO tracking result
   */
  private storeSLOTracking(slo: SLOTracking): void {
    try {
      this.db
        .prepare(
          `
          INSERT INTO slo_tracking (
            id, kit_id, service_name, slo_type, target_percent, 
            current_achievement_percent, period_start, period_end, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          slo.id,
          slo.kitId,
          slo.serviceName,
          slo.sloType,
          slo.targetPercent,
          slo.currentAchievementPercent,
          slo.periodStart.toISOString(),
          slo.periodEnd.toISOString(),
          slo.timestamp.toISOString(),
        );
    } catch (error) {
      console.error("Error storing SLO tracking:", error);
    }
  }
}

export function createPerformanceIntelligence(database: SQLiteDatabase): PerformanceIntelligence {
  return new PerformanceIntelligence(database);
}
