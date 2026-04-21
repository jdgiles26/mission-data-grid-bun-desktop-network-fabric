/**
 * Coalition Health Correlation Engine
 * 
 * Analyzes cross-kit dependencies, failure propagation patterns, and federation health.
 */

import type SQLiteDatabase from "bun:sqlite";
import { randomUUID } from "crypto";

export interface KitDependency {
  id: string;
  sourceKitId: string;
  targetKitId: string;
  dependencyType: "API" | "DATABASE" | "MESSAGING" | "SHARED_RESOURCE" | "NETWORK";
  criticality: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  lastUpdated: Date;
}

export interface FailurePropagation {
  sourceKitId: string;
  affectedKits: string[];
  propagationChain: Array<{ kit: string; delay: number; impactScore: number }>;
  totalImpactScore: number;
  estimatedRecoveryTime: number; // minutes
}

export interface CoalitionScore {
  id: string;
  timestamp: Date;
  overallScore: number; // 0-100
  healthByKit: Record<string, number>;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  criticalDependencies: string[];
}

export class CoalitionHealthEngine {
  private db: SQLiteDatabase;
  private dependencyCache: Map<string, KitDependency[]> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes
  private lastCacheUpdate = 0;

  constructor(database: SQLiteDatabase) {
    this.db = database;
  }

  /**
   * Register a dependency between two kits
   */
  async registerDependency(dependency: KitDependency): Promise<void> {
    try {
      this.db
        .prepare(
          `
          INSERT OR REPLACE INTO kit_dependencies (
            id, source_kit_id, target_kit_id, dependency_type, criticality, last_updated
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          dependency.id || randomUUID(),
          dependency.sourceKitId,
          dependency.targetKitId,
          dependency.dependencyType,
          dependency.criticality,
          dependency.lastUpdated.toISOString(),
        );

      // Invalidate cache
      this.dependencyCache.clear();
    } catch (error) {
      console.error("Error registering dependency:", error);
    }
  }

  /**
   * Get all dependencies for a kit
   */
  async getKitDependencies(kitId: string): Promise<KitDependency[]> {
    // Check cache
    if (this.dependencyCache.has(kitId) && Date.now() - this.lastCacheUpdate < this.cacheTTL) {
      return this.dependencyCache.get(kitId) || [];
    }

    try {
      const rows = this.db
        .prepare(
          `
          SELECT id, source_kit_id, target_kit_id, dependency_type, criticality, last_updated
          FROM kit_dependencies
          WHERE source_kit_id = ? OR target_kit_id = ?
          ORDER BY criticality DESC
        `,
        )
        .all(kitId, kitId) as Array<{
        id: string;
        source_kit_id: string;
        target_kit_id: string;
        dependency_type: string;
        criticality: string;
        last_updated: string;
      }>;

      const dependencies = rows.map((row) => ({
        id: row.id,
        sourceKitId: row.source_kit_id,
        targetKitId: row.target_kit_id,
        dependencyType: row.dependency_type as KitDependency["dependencyType"],
        criticality: row.criticality as KitDependency["criticality"],
        lastUpdated: new Date(row.last_updated),
      }));

      this.dependencyCache.set(kitId, dependencies);
      this.lastCacheUpdate = Date.now();

      return dependencies;
    } catch (error) {
      console.error("Error retrieving dependencies:", error);
      return [];
    }
  }

  /**
   * Analyze failure propagation from a source kit
   */
  async analyzeFailurePropagation(sourceKitId: string): Promise<FailurePropagation> {
    const visited = new Set<string>();
    const propagationChain: Array<{ kit: string; delay: number; impactScore: number }> = [];
    const affectedKits = new Set<string>();

    let totalImpactScore = 0;

    // BFS to find all affected kits
    const queue: Array<{ kitId: string; depth: number; impactScore: number }> = [
      { kitId: sourceKitId, depth: 0, impactScore: 100 },
    ];

    while (queue.length > 0) {
      const { kitId, depth, impactScore } = queue.shift()!;

      if (visited.has(kitId) || depth > 4) continue; // Max 4 hops
      visited.add(kitId);

      if (kitId !== sourceKitId) {
        affectedKits.add(kitId);
        propagationChain.push({
          kit: kitId,
          delay: depth * 2, // ~2 minutes per hop
          impactScore,
        });
        totalImpactScore += impactScore;
      }

      // Find dependent kits
      const deps = await this.getKitDependencies(kitId);
      for (const dep of deps) {
        const nextKit = dep.sourceKitId === kitId ? dep.targetKitId : dep.sourceKitId;

        if (!visited.has(nextKit)) {
          const criticalityMultiplier =
            dep.criticality === "CRITICAL"
              ? 1.0
              : dep.criticality === "HIGH"
                ? 0.7
                : dep.criticality === "MEDIUM"
                  ? 0.4
                  : 0.2;

          const nextImpact = impactScore * criticalityMultiplier;
          queue.push({ kitId: nextKit, depth: depth + 1, impactScore: nextImpact });
        }
      }
    }

    // Calculate recovery time (exponential with depth)
    const avgDepth = propagationChain.length > 0 
      ? propagationChain.reduce((sum, p) => sum + p.delay, 0) / propagationChain.length 
      : 0;
    const estimatedRecoveryTime = Math.ceil(avgDepth + 30); // base 30 min + propagation

    return {
      sourceKitId,
      affectedKits: Array.from(affectedKits),
      propagationChain,
      totalImpactScore,
      estimatedRecoveryTime,
    };
  }

  /**
   * Calculate overall coalition health score
   */
  async getCoalitionScore(kitIds: string[]): Promise<CoalitionScore> {
    const healthByKit: Record<string, number> = {};
    let totalHealth = 0;
    const criticalDependencies: string[] = [];

    // Calculate health for each kit
    for (const kitId of kitIds) {
      const deps = await this.getKitDependencies(kitId);

      // Health = inverse of critical dependency count
      const criticalDeps = deps.filter((d) => d.criticality === "CRITICAL").length;
      const health = Math.max(0, 100 - criticalDeps * 20);
      healthByKit[kitId] = health;
      totalHealth += health;

      // Track critical dependencies
      for (const dep of deps) {
        if (dep.criticality === "CRITICAL") {
          criticalDependencies.push(`${dep.sourceKitId} -> ${dep.targetKitId}`);
        }
      }
    }

    const overallScore = Math.round(totalHealth / kitIds.length);
    const riskLevel =
      overallScore >= 80
        ? "LOW"
        : overallScore >= 60
          ? "MEDIUM"
          : overallScore >= 40
            ? "HIGH"
            : "CRITICAL";

    const score: CoalitionScore = {
      id: randomUUID(),
      timestamp: new Date(),
      overallScore,
      healthByKit,
      riskLevel,
      criticalDependencies,
    };

    this.storeCoalitionScore(score);
    return score;
  }

  /**
   * Detect shared resource contention
   */
  async detectResourceContention(kitIds: string[]): Promise<Map<string, number>> {
    const contentionMap = new Map<string, number>();

    // Analyze shared dependencies
    const allDependencies = await Promise.all(kitIds.map((id) => this.getKitDependencies(id)));

    const depCounts = new Map<string, number>();
    for (const deps of allDependencies) {
      for (const dep of deps) {
        const key = `${dep.targetKitId}`;
        depCounts.set(key, (depCounts.get(key) || 0) + 1);
      }
    }

    // High contention = multiple kits depending on same resource
    for (const [resource, count] of depCounts) {
      if (count > 2) {
        contentionMap.set(resource, count);
      }
    }

    return contentionMap;
  }

  /**
   * Simulate cascade failure and predict recovery time
   */
  async simulateCascadeFailure(initialFailedKit: string, allKits: string[]): Promise<{
    failureSequence: Array<{ kit: string; failureTime: number }>;
    maxDowntime: number;
    recoveryPath: string[];
  }> {
    const failureSequence: Array<{ kit: string; failureTime: number }> = [];
    const failed = new Set<string>([initialFailedKit]);
    const recovered: string[] = [];

    failureSequence.push({ kit: initialFailedKit, failureTime: 0 });

    let time = 0;
    let round = 0;

    while (failed.size < allKits.length && round < 10) {
      round++;
      time += 5; // 5 minutes per round

      // Check which kits become affected
      for (const kit of allKits) {
        if (!failed.has(kit)) {
          const deps = await this.getKitDependencies(kit);
          const hasCriticalFailedDep = deps.some(
            (d) => (d.targetKitId === kit && failed.has(d.sourceKitId)) ||
                   (d.sourceKitId === kit && failed.has(d.targetKitId)) &&
                   d.criticality === "CRITICAL",
          );

          if (hasCriticalFailedDep) {
            failed.add(kit);
            failureSequence.push({ kit, failureTime: time });
          }
        }
      }
    }

    // Recovery path: restart in reverse dependency order
    const recoveryPath = failureSequence.reverse().map((f) => f.kit);

    return {
      failureSequence,
      maxDowntime: time,
      recoveryPath,
    };
  }

  /**
   * Store coalition score to database
   */
  private storeCoalitionScore(score: CoalitionScore): void {
    try {
      this.db
        .prepare(
          `
          INSERT INTO coalition_score (id, timestamp, overall_score, health_by_kit, risk_level)
          VALUES (?, ?, ?, ?, ?)
        `,
        )
        .run(
          score.id,
          score.timestamp.toISOString(),
          score.overallScore,
          JSON.stringify(score.healthByKit),
          score.riskLevel,
        );
    } catch (error) {
      console.error("Error storing coalition score:", error);
    }
  }
}

export function createCoalitionHealthEngine(database: SQLiteDatabase): CoalitionHealthEngine {
  return new CoalitionHealthEngine(database);
}
