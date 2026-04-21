/**
 * Network Optimization Engine
 * 
 * Optimizes bandwidth allocation, link utilization, and routing suggestions.
 */

import type SQLiteDatabase from "bun:sqlite";
import { randomUUID } from "crypto";

export interface NetworkPath {
  id: string;
  sourceKitId: string;
  destinationKitId: string;
  pathHops: string[];
  currentBandwidth: number; // Mbps
  maxBandwidth: number; // Mbps
  latencyMs: number;
  lossPercent: number;
  lastMeasured: Date;
}

export interface UtilizationPoint {
  id: string;
  pathId: string;
  timestamp: Date;
  bandwidthUsed: number;
  bandwidthPercent: number;
  packetLossRate: number;
}

export interface OptimizationSuggestion {
  id: string;
  timestamp: Date;
  suggestionType: "REBALANCE" | "UPGRADE" | "REROUTE" | "QOS_ADJUST";
  affectedPaths: string[];
  currentEfficiency: number; // 0-100
  projectedEfficiency: number; // 0-100
  estimatedImprovementPercent: number;
  actionDescription: string;
}

export interface QueueSimulation {
  averageQueueLength: number;
  p95QueueLength: number;
  averageWaitTime: number; // ms
  droppedPackets: number;
  throughput: number; // Mbps
}

export class NetworkOptimizer {
  private db: SQLiteDatabase;
  private readonly EFFICIENCY_THRESHOLD = 85; // %
  private readonly OVERLOAD_THRESHOLD = 90; // %

  constructor(database: SQLiteDatabase) {
    this.db = database;
  }

  /**
   * Analyze and optimize bandwidth allocation across paths
   */
  async optimizeBandwidth(paths: NetworkPath[]): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // Analyze utilization
    const utilizationStats = await this.analyzeUtilization(paths);

    // Find overloaded paths
    for (const path of paths) {
      const stats = utilizationStats.get(path.id);
      if (!stats) continue;

      const utilizationPercent = (stats.avgBandwidthUsed / path.maxBandwidth) * 100;

      if (utilizationPercent > this.OVERLOAD_THRESHOLD) {
        // Suggest rebalancing or upgrade
        const avgOtherUtil =
          Array.from(utilizationStats.values())
            .filter((s) => s.pathId !== path.id)
            .reduce((sum, s) => sum + (s.avgBandwidthUsed / path.maxBandwidth) * 100, 0) /
          Math.max(1, paths.length - 1);

        if (avgOtherUtil < 70) {
          // Can rebalance
          suggestions.push({
            id: randomUUID(),
            timestamp: new Date(),
            suggestionType: "REBALANCE",
            affectedPaths: [path.id],
            currentEfficiency: utilizationPercent,
            projectedEfficiency: 75,
            estimatedImprovementPercent: 20,
            actionDescription: `Rebalance traffic from ${path.sourceKitId} to ${path.destinationKitId}. Other paths have available capacity.`,
          });
        } else {
          // Suggest upgrade
          suggestions.push({
            id: randomUUID(),
            timestamp: new Date(),
            suggestionType: "UPGRADE",
            affectedPaths: [path.id],
            currentEfficiency: utilizationPercent,
            projectedEfficiency: 60,
            estimatedImprovementPercent: 30,
            actionDescription: `Upgrade link ${path.sourceKitId} -> ${path.destinationKitId} from ${path.maxBandwidth}Mbps to ${Math.ceil(path.maxBandwidth * 1.5)}Mbps.`,
          });
        }
      }

      // QoS adjustments for latency issues
      if (path.latencyMs > 100 || path.lossPercent > 1) {
        suggestions.push({
          id: randomUUID(),
          timestamp: new Date(),
          suggestionType: "QOS_ADJUST",
          affectedPaths: [path.id],
          currentEfficiency: 100 - Math.min(50, path.latencyMs / 2 + path.lossPercent * 10),
          projectedEfficiency: 95,
          estimatedImprovementPercent: 15,
          actionDescription: `Apply QoS priority queuing. Current latency: ${path.latencyMs}ms, loss: ${path.lossPercent}%.`,
        });
      }
    }

    // Store suggestions
    for (const suggestion of suggestions) {
      this.storeSuggestion(suggestion);
    }

    return suggestions;
  }

  /**
   * Suggest optimal routing changes
   */
  async suggestRoutingChanges(paths: NetworkPath[]): Promise<Map<string, string[]>> {
    const routingSuggestions = new Map<string, string[]>();

    const utilizationStats = await this.analyzeUtilization(paths);

    for (const path of paths) {
      const stats = utilizationStats.get(path.id);
      if (!stats) continue;

      const utilizationPercent = (stats.avgBandwidthUsed / path.maxBandwidth) * 100;

      if (utilizationPercent > 80) {
        // Find alternative paths
        const alternatives = paths.filter(
          (p) =>
            p.sourceKitId === path.sourceKitId &&
            p.destinationKitId === path.destinationKitId &&
            p.id !== path.id,
        );

        if (alternatives.length > 0) {
          const bestAlternative = alternatives.reduce((best, current) => {
            const bestUtil =
              ((utilizationStats.get(best.id)?.avgBandwidthUsed || 0) / best.maxBandwidth) * 100;
            const currentUtil =
              ((utilizationStats.get(current.id)?.avgBandwidthUsed || 0) / current.maxBandwidth) *
              100;
            return currentUtil < bestUtil ? current : best;
          });

          routingSuggestions.set(path.id, [bestAlternative.id]);
        }
      }
    }

    return routingSuggestions;
  }

  /**
   * Simulate queue management scenarios
   */
  simulateQueue(
    arrivalRate: number, // packets/ms
    serviceRate: number, // packets/ms
    bufferSize: number,
    durationMs: number,
  ): QueueSimulation {
    let queueLength = 0;
    let totalQueueLength = 0;
    let p95QueueLength = 0;
    let droppedPackets = 0;
    let processedPackets = 0;
    const queueLengths: number[] = [];

    // M/M/1 queue simulation
    for (let t = 0; t < durationMs; t++) {
      // Poisson arrivals
      const arrivals = Math.random() < arrivalRate ? 1 : 0;
      queueLength += arrivals;

      // Process service
      if (queueLength > 0 && Math.random() < serviceRate) {
        queueLength--;
        processedPackets++;
      }

      // Buffer overflow
      if (queueLength > bufferSize) {
        droppedPackets += queueLength - bufferSize;
        queueLength = bufferSize;
      }

      totalQueueLength += queueLength;
      queueLengths.push(queueLength);
    }

    // Calculate percentiles
    queueLengths.sort((a, b) => a - b);
    const p95Index = Math.floor(queueLengths.length * 0.95);
    p95QueueLength = queueLengths[p95Index] || 0;

    const averageQueueLength = totalQueueLength / durationMs;
    const averageWaitTime = (averageQueueLength / serviceRate) * 1000; // Convert to ms
    const throughput = (processedPackets / durationMs) * 1000; // Convert to packets/s

    return {
      averageQueueLength,
      p95QueueLength,
      averageWaitTime,
      droppedPackets,
      throughput,
    };
  }

  /**
   * Analyze traffic patterns and predict future loads
   */
  async analyzeTrafficPattern(
    pathId: string,
    hoursBack: number = 24,
  ): Promise<{
    peakHour: number;
    averageLoad: number;
    predictedPeakLoad: number;
    volatility: number;
  }> {
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    try {
      const rows = this.db
        .prepare(
          `
          SELECT bandwidth_percent, datetime(timestamp, 'start of hour') as hour
          FROM utilization_history
          WHERE path_id = ? AND datetime(timestamp) >= datetime(?)
          ORDER BY timestamp
          LIMIT 10000
        `,
        )
        .all(pathId, cutoffTime.toISOString()) as Array<{
        bandwidth_percent: number;
        hour: string;
      }>;

      if (rows.length === 0) {
        return {
          peakHour: 0,
          averageLoad: 0,
          predictedPeakLoad: 0,
          volatility: 0,
        };
      }

      const percentages = rows.map((r) => r.bandwidth_percent);
      const avgLoad = percentages.reduce((a, b) => a + b) / percentages.length;
      const maxLoad = Math.max(...percentages);

      // Calculate volatility (coefficient of variation)
      const variance =
        percentages.reduce((sum, val) => sum + Math.pow(val - avgLoad, 2), 0) /
        percentages.length;
      const volatility = Math.sqrt(variance) / (avgLoad || 1);

      // Simple prediction: max + volatility adjustment
      const predictedPeak = Math.min(100, maxLoad + maxLoad * volatility * 0.5);

      return {
        peakHour: maxLoad,
        averageLoad: avgLoad,
        predictedPeakLoad: predictedPeak,
        volatility,
      };
    } catch (error) {
      console.error("Error analyzing traffic pattern:", error);
      return {
        peakHour: 0,
        averageLoad: 0,
        predictedPeakLoad: 0,
        volatility: 0,
      };
    }
  }

  /**
   * Calculate link utilization efficiency
   */
  private async analyzeUtilization(
    paths: NetworkPath[],
  ): Promise<
    Map<
      string,
      {
        pathId: string;
        avgBandwidthUsed: number;
        maxBandwidth: number;
      }
    >
  > {
    const stats = new Map<
      string,
      {
        pathId: string;
        avgBandwidthUsed: number;
        maxBandwidth: number;
      }
    >();

    const cutoffTime = new Date(Date.now() - 60 * 60 * 1000); // Last hour

    try {
      for (const path of paths) {
        const rows = this.db
          .prepare(
            `
            SELECT AVG(bandwidth_used) as avg_used
            FROM utilization_history
            WHERE path_id = ? AND datetime(timestamp) >= datetime(?)
            LIMIT 1000
          `,
          )
          .all(path.id, cutoffTime.toISOString()) as Array<{
          avg_used: number;
        }>;

        const avgUsed = rows[0]?.avg_used || 0;
        stats.set(path.id, {
          pathId: path.id,
          avgBandwidthUsed: avgUsed,
          maxBandwidth: path.maxBandwidth,
        });
      }
    } catch (error) {
      console.error("Error analyzing utilization:", error);
    }

    return stats;
  }

  /**
   * Store optimization suggestion
   */
  private storeSuggestion(suggestion: OptimizationSuggestion): void {
    try {
      this.db
        .prepare(
          `
          INSERT INTO optimization_suggestions (
            id, timestamp, suggestion_type, affected_paths, 
            current_efficiency, projected_efficiency, 
            estimated_improvement_percent, action_description
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          suggestion.id,
          suggestion.timestamp.toISOString(),
          suggestion.suggestionType,
          JSON.stringify(suggestion.affectedPaths),
          suggestion.currentEfficiency,
          suggestion.projectedEfficiency,
          suggestion.estimatedImprovementPercent,
          suggestion.actionDescription,
        );
    } catch (error) {
      console.error("Error storing suggestion:", error);
    }
  }
}

export function createNetworkOptimizer(database: SQLiteDatabase): NetworkOptimizer {
  return new NetworkOptimizer(database);
}
