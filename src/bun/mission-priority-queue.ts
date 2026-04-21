// Mission Priority Queue
// Priority-aware data handling aligned with military priority system
// FLASH > IMMEDIATE > PRIORITY > ROUTINE with preemption, bandwidth allocation, and starvation detection

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

export type PriorityLevel = "FLASH" | "IMMEDIATE" | "PRIORITY" | "ROUTINE";

export interface QueueItem {
  id: string;
  priority: PriorityLevel;
  sourceKitId: string;
  destinationKitId: string;
  dataType: string;
  sizeBytes: number;
  enqueuedAt: Date;
  expiresAt: Date | null;
  description: string;
  retryCount: number;
  maxRetries: number;
}

export interface QueueStatus {
  totalItems: number;
  byPriority: Record<PriorityLevel, number>;
  oldestItemAge: Record<PriorityLevel, number>; // seconds
  estimatedClearTimeSeconds: Record<PriorityLevel, number>;
  queueDepthBytes: Record<PriorityLevel, number>;
  overflowRisk: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  droppedItems24h: number;
  processedItems24h: number;
  throughputBytesPerSecond: number;
}

export interface BandwidthAllocation {
  totalBandwidthMbps: number;
  allocations: Record<PriorityLevel, {
    allocatedMbps: number;
    percentOfTotal: number;
    currentUsageMbps: number;
    utilizationPercent: number;
  }>;
  reservedForFlashMbps: number;
  burstCapablePriorities: PriorityLevel[];
}

export interface PriorityDistribution {
  totalItems: number;
  totalBytes: number;
  distribution: Record<PriorityLevel, {
    count: number;
    countPercent: number;
    bytes: number;
    bytesPercent: number;
    avgSizeBytes: number;
    avgWaitTimeSeconds: number;
  }>;
  trend: "flash-heavy" | "balanced" | "routine-heavy";
  alertLevel: "NORMAL" | "ELEVATED" | "HIGH";
}

export interface LatencyEstimate {
  priority: PriorityLevel;
  estimatedLatencyMs: number;
  queueWaitMs: number;
  transmissionMs: number;
  processingMs: number;
  confidencePercent: number;
}

export interface StarvationReport {
  isStarving: boolean;
  starvedPriorities: Array<{
    priority: PriorityLevel;
    waitingItems: number;
    oldestItemAgeSeconds: number;
    expectedMaxWaitSeconds: number;
    starvationSeverity: "MILD" | "MODERATE" | "SEVERE";
  }>;
  preemptionEvents24h: number;
  recommendations: string[];
}

export interface QoSRecommendation {
  id: string;
  category: "bandwidth" | "priority" | "queue" | "policy";
  severity: "INFO" | "WARNING" | "ACTION_REQUIRED";
  title: string;
  description: string;
  currentValue: string;
  recommendedValue: string;
  impact: string;
}

export class MissionPriorityQueue {
  private rootPath: string;
  private queues: Record<PriorityLevel, QueueItem[]> = {
    FLASH: [],
    IMMEDIATE: [],
    PRIORITY: [],
    ROUTINE: [],
  };
  private processedCount = 0;
  private droppedCount = 0;
  private totalBandwidthMbps = 100;
  private preemptionEvents = 0;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
    this.initializeSimulatedTraffic();
  }

  private loadKits(): Array<{ kitId: string; kitName: string }> {
    const kits: Array<{ kitId: string; kitName: string }> = [];
    const hostVarsDir = join(this.rootPath, "inventory/host_vars");
    if (!existsSync(hostVarsDir)) return kits;

    const hosts = readdirSync(hostVarsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const host of hosts) {
      const varsPath = join(hostVarsDir, host, "vars.yml");
      if (!existsSync(varsPath)) continue;
      try {
        const vars = parse(readFileSync(varsPath, "utf8")) as Record<string, unknown>;
        const mission = Number(vars["kit_mission"] || 1);
        const kitId = Number(vars["kit_id"] || 1);
        const kitName = String(vars["kit_name"] || host);
        kits.push({
          kitId: `m${String(mission).padStart(2, "0")}-k${String(kitId).padStart(2, "0")}`,
          kitName,
        });
      } catch { /* skip */ }
    }

    // Provide default kits if inventory is empty
    if (kits.length === 0) {
      kits.push(
        { kitId: "m01-k01", kitName: "alpha" },
        { kitId: "m01-k02", kitName: "bravo" },
        { kitId: "m01-k03", kitName: "charlie" },
        { kitId: "m01-hq", kitName: "hq-backbone" },
      );
    }

    return kits;
  }

  private initializeSimulatedTraffic(): void {
    const kits = this.loadKits();
    if (kits.length === 0) return;

    const dataTypes = [
      "CoT-position-report",
      "sensor-telemetry",
      "video-stream-chunk",
      "voice-relay",
      "config-sync",
      "log-batch",
      "health-check",
      "situation-report",
      "intel-update",
      "map-tile-request",
    ];

    const priorities: PriorityLevel[] = ["FLASH", "IMMEDIATE", "PRIORITY", "ROUTINE"];
    const weights = [0.05, 0.15, 0.30, 0.50]; // Distribution: 5% FLASH, 15% IMMEDIATE, etc.

    // Generate simulated queue items
    const totalItems = 40 + Math.floor(this.seededRandom("init", 0) * 60);

    for (let i = 0; i < totalItems; i++) {
      const r = this.seededRandom("item", i);
      let cumulative = 0;
      let priority: PriorityLevel = "ROUTINE";
      for (let p = 0; p < priorities.length; p++) {
        cumulative += weights[p]!;
        if (r < cumulative) {
          priority = priorities[p]!;
          break;
        }
      }

      const sourceIdx = this.seededInt("src" + i, 0, kits.length - 1);
      let destIdx = this.seededInt("dst" + i, 0, kits.length - 1);
      if (destIdx === sourceIdx) destIdx = (destIdx + 1) % kits.length;

      const ageSeconds = this.seededInt("age" + i, 1, priority === "FLASH" ? 30 : priority === "IMMEDIATE" ? 120 : priority === "PRIORITY" ? 600 : 3600);

      const item: QueueItem = {
        id: `q-${String(i).padStart(4, "0")}`,
        priority,
        sourceKitId: kits[sourceIdx]!.kitId,
        destinationKitId: kits[destIdx]!.kitId,
        dataType: dataTypes[this.seededInt("dt" + i, 0, dataTypes.length - 1)]!,
        sizeBytes: this.getTypicalSize(priority),
        enqueuedAt: new Date(Date.now() - ageSeconds * 1000),
        expiresAt: priority === "FLASH"
          ? new Date(Date.now() + 60 * 1000)
          : priority === "IMMEDIATE"
            ? new Date(Date.now() + 300 * 1000)
            : null,
        description: `${priority} traffic from ${kits[sourceIdx]!.kitId} to ${kits[destIdx]!.kitId}`,
        retryCount: 0,
        maxRetries: priority === "FLASH" ? 5 : 3,
      };

      this.queues[priority].push(item);
    }

    // Simulate some historical processing
    this.processedCount = 200 + this.seededInt("proc", 0, 500);
    this.droppedCount = this.seededInt("drop", 0, 12);
    this.preemptionEvents = this.seededInt("preempt", 2, 20);
  }

  private getTypicalSize(priority: PriorityLevel): number {
    const sizes: Record<PriorityLevel, [number, number]> = {
      FLASH: [128, 4096],          // Small, urgent messages
      IMMEDIATE: [1024, 65536],     // Medium tactical data
      PRIORITY: [4096, 524288],     // Larger data packages
      ROUTINE: [1024, 2097152],     // Can be large file transfers
    };
    const [min, max] = sizes[priority];
    return min + Math.floor(Math.random() * (max - min));
  }

  // --- Public API ---

  enqueue(item: Omit<QueueItem, "id" | "enqueuedAt" | "retryCount">): QueueItem {
    const fullItem: QueueItem = {
      ...item,
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      enqueuedAt: new Date(),
      retryCount: 0,
    };

    // FLASH preempts: move to front
    if (item.priority === "FLASH") {
      this.queues.FLASH.unshift(fullItem);
      this.preemptionEvents++;
    } else {
      this.queues[item.priority].push(fullItem);
    }

    return fullItem;
  }

  dequeue(): QueueItem | null {
    // Process in priority order: FLASH first
    const priorities: PriorityLevel[] = ["FLASH", "IMMEDIATE", "PRIORITY", "ROUTINE"];

    for (const priority of priorities) {
      if (this.queues[priority].length > 0) {
        const item = this.queues[priority].shift()!;
        this.processedCount++;

        // Check if expired
        if (item.expiresAt && item.expiresAt.getTime() < Date.now()) {
          this.droppedCount++;
          // Try next item
          continue;
        }

        return item;
      }
    }

    return null;
  }

  getQueueStatus(): QueueStatus {
    const priorities: PriorityLevel[] = ["FLASH", "IMMEDIATE", "PRIORITY", "ROUTINE"];
    const byPriority = {} as Record<PriorityLevel, number>;
    const oldestItemAge = {} as Record<PriorityLevel, number>;
    const estimatedClearTime = {} as Record<PriorityLevel, number>;
    const queueDepthBytes = {} as Record<PriorityLevel, number>;
    let totalItems = 0;

    for (const p of priorities) {
      const queue = this.queues[p];
      byPriority[p] = queue.length;
      totalItems += queue.length;

      if (queue.length > 0) {
        const oldest = queue.reduce((min, item) =>
          item.enqueuedAt.getTime() < min.enqueuedAt.getTime() ? item : min,
          queue[0]!,
        );
        oldestItemAge[p] = Math.floor((Date.now() - oldest!.enqueuedAt.getTime()) / 1000);
      } else {
        oldestItemAge[p] = 0;
      }

      queueDepthBytes[p] = queue.reduce((sum, item) => sum + item.sizeBytes, 0);

      // Estimate clear time based on bandwidth allocation
      const allocatedMbps = this.getAllocationForPriority(p);
      const bytesPerSecond = (allocatedMbps * 1024 * 1024) / 8;
      estimatedClearTime[p] = bytesPerSecond > 0
        ? Math.ceil(queueDepthBytes[p] / bytesPerSecond)
        : 9999;
    }

    const totalBytes = Object.values(queueDepthBytes).reduce((a, b) => a + b, 0);
    const maxCapacityBytes = this.totalBandwidthMbps * 1024 * 1024 * 60; // 1 min buffer
    const utilization = totalBytes / maxCapacityBytes;

    let overflowRisk: QueueStatus["overflowRisk"] = "NONE";
    if (utilization > 0.9) overflowRisk = "CRITICAL";
    else if (utilization > 0.7) overflowRisk = "HIGH";
    else if (utilization > 0.5) overflowRisk = "MEDIUM";
    else if (utilization > 0.3) overflowRisk = "LOW";

    return {
      totalItems,
      byPriority,
      oldestItemAge,
      estimatedClearTimeSeconds: estimatedClearTime,
      queueDepthBytes,
      overflowRisk,
      droppedItems24h: this.droppedCount,
      processedItems24h: this.processedCount,
      throughputBytesPerSecond: Math.round((this.processedCount * 8192) / (24 * 3600)),
    };
  }

  getBandwidthAllocation(): BandwidthAllocation {
    const total = this.totalBandwidthMbps;

    // Military QoS: FLASH gets guaranteed minimum, ROUTINE gets remainder
    const flashAlloc = total * 0.30;
    const immediateAlloc = total * 0.30;
    const priorityAlloc = total * 0.25;
    const routineAlloc = total * 0.15;

    const makeAllocation = (priority: PriorityLevel, allocated: number) => {
      const queueBytes = this.queues[priority].reduce((sum, item) => sum + item.sizeBytes, 0);
      const currentUsage = Math.min(allocated, (queueBytes / (1024 * 1024)) * 8 / 60); // rough estimate
      return {
        allocatedMbps: Math.round(allocated * 10) / 10,
        percentOfTotal: Math.round((allocated / total) * 100),
        currentUsageMbps: Math.round(currentUsage * 10) / 10,
        utilizationPercent: Math.round((currentUsage / allocated) * 100),
      };
    };

    return {
      totalBandwidthMbps: total,
      allocations: {
        FLASH: makeAllocation("FLASH", flashAlloc),
        IMMEDIATE: makeAllocation("IMMEDIATE", immediateAlloc),
        PRIORITY: makeAllocation("PRIORITY", priorityAlloc),
        ROUTINE: makeAllocation("ROUTINE", routineAlloc),
      },
      reservedForFlashMbps: flashAlloc,
      burstCapablePriorities: ["FLASH", "IMMEDIATE"],
    };
  }

  getPriorityDistribution(): PriorityDistribution {
    const priorities: PriorityLevel[] = ["FLASH", "IMMEDIATE", "PRIORITY", "ROUTINE"];
    let totalItems = 0;
    let totalBytes = 0;

    const distribution = {} as PriorityDistribution["distribution"];

    for (const p of priorities) {
      const queue = this.queues[p];
      const bytes = queue.reduce((sum, item) => sum + item.sizeBytes, 0);
      totalItems += queue.length;
      totalBytes += bytes;

      const avgWait = queue.length > 0
        ? queue.reduce((sum, item) => sum + (Date.now() - item.enqueuedAt.getTime()) / 1000, 0) / queue.length
        : 0;

      distribution[p] = {
        count: queue.length,
        countPercent: 0, // calculated below
        bytes,
        bytesPercent: 0, // calculated below
        avgSizeBytes: queue.length > 0 ? Math.round(bytes / queue.length) : 0,
        avgWaitTimeSeconds: Math.round(avgWait),
      };
    }

    // Calculate percentages
    for (const p of priorities) {
      distribution[p].countPercent = totalItems > 0
        ? Math.round((distribution[p].count / totalItems) * 100)
        : 0;
      distribution[p].bytesPercent = totalBytes > 0
        ? Math.round((distribution[p].bytes / totalBytes) * 100)
        : 0;
    }

    // Determine trend
    const flashPercent = distribution.FLASH.countPercent;
    const routinePercent = distribution.ROUTINE.countPercent;
    let trend: PriorityDistribution["trend"] = "balanced";
    if (flashPercent > 20) trend = "flash-heavy";
    else if (routinePercent > 65) trend = "routine-heavy";

    let alertLevel: PriorityDistribution["alertLevel"] = "NORMAL";
    if (flashPercent > 30) alertLevel = "HIGH";
    else if (flashPercent > 15) alertLevel = "ELEVATED";

    return {
      totalItems,
      totalBytes,
      distribution,
      trend,
      alertLevel,
    };
  }

  getLatencyEstimates(): LatencyEstimate[] {
    const priorities: PriorityLevel[] = ["FLASH", "IMMEDIATE", "PRIORITY", "ROUTINE"];

    return priorities.map((priority) => {
      const queue = this.queues[priority];
      const queueBytes = queue.reduce((sum, item) => sum + item.sizeBytes, 0);
      const allocMbps = this.getAllocationForPriority(priority);
      const bytesPerMs = (allocMbps * 1024 * 1024) / 8 / 1000;

      // Higher priority items ahead in queue
      let higherPriorityBytes = 0;
      const idx = priorities.indexOf(priority);
      for (let i = 0; i < idx; i++) {
        higherPriorityBytes += this.queues[priorities[i]!].reduce((sum: number, item: QueueItem) => sum + item.sizeBytes, 0);
      }

      const queueWaitMs = bytesPerMs > 0
        ? Math.round((queueBytes + higherPriorityBytes) / bytesPerMs)
        : 9999;

      // Base transmission time for average item
      const avgSize = queue.length > 0
        ? queueBytes / queue.length
        : this.getTypicalSize(priority);
      const transmissionMs = bytesPerMs > 0 ? Math.round(avgSize / bytesPerMs) : 100;

      // Processing overhead
      const processingMs = priority === "FLASH" ? 5 : priority === "IMMEDIATE" ? 10 : 25;

      const totalLatency = queueWaitMs + transmissionMs + processingMs;

      return {
        priority,
        estimatedLatencyMs: totalLatency,
        queueWaitMs,
        transmissionMs,
        processingMs,
        confidencePercent: Math.max(50, 95 - queue.length * 2),
      };
    });
  }

  detectStarvation(): StarvationReport {
    const starvedPriorities: StarvationReport["starvedPriorities"] = [];
    const priorities: PriorityLevel[] = ["FLASH", "IMMEDIATE", "PRIORITY", "ROUTINE"];

    // Expected max wait times per priority (seconds)
    const expectedMaxWait: Record<PriorityLevel, number> = {
      FLASH: 5,
      IMMEDIATE: 30,
      PRIORITY: 300,
      ROUTINE: 1800,
    };

    for (const p of priorities) {
      const queue = this.queues[p];
      if (queue.length === 0) continue;

      const oldest = queue.reduce((min, item) =>
        item.enqueuedAt.getTime() < min.enqueuedAt.getTime() ? item : min,
        queue[0]!,
      );
      const oldestAge = Math.floor((Date.now() - oldest!.enqueuedAt.getTime()) / 1000);
      const maxExpected = expectedMaxWait[p];

      if (oldestAge > maxExpected) {
        let severity: "MILD" | "MODERATE" | "SEVERE" = "MILD";
        if (oldestAge > maxExpected * 3) severity = "SEVERE";
        else if (oldestAge > maxExpected * 1.5) severity = "MODERATE";

        starvedPriorities.push({
          priority: p,
          waitingItems: queue.length,
          oldestItemAgeSeconds: oldestAge,
          expectedMaxWaitSeconds: maxExpected,
          starvationSeverity: severity,
        });
      }
    }

    const isStarving = starvedPriorities.length > 0;
    const recommendations: string[] = [];

    if (starvedPriorities.some((s) => s.priority === "FLASH")) {
      recommendations.push("CRITICAL: FLASH traffic is being starved - check for queue processing errors");
    }
    if (starvedPriorities.some((s) => s.priority === "ROUTINE" && s.starvationSeverity === "SEVERE")) {
      recommendations.push("Increase ROUTINE bandwidth allocation or reduce higher-priority traffic volume");
    }
    if (this.preemptionEvents > 15) {
      recommendations.push("High preemption rate detected - consider dedicated FLASH transport channel");
    }
    if (isStarving) {
      recommendations.push("Review QoS policies and consider weighted fair queuing adjustments");
    }

    return {
      isStarving,
      starvedPriorities,
      preemptionEvents24h: this.preemptionEvents,
      recommendations,
    };
  }

  getQoSRecommendations(): QoSRecommendation[] {
    const recommendations: QoSRecommendation[] = [];
    const status = this.getQueueStatus();
    const distribution = this.getPriorityDistribution();
    const starvation = this.detectStarvation();

    // Check FLASH queue depth
    if (status.byPriority.FLASH > 5) {
      recommendations.push({
        id: "qos-flash-backlog",
        category: "priority",
        severity: "ACTION_REQUIRED",
        title: "FLASH Traffic Backlog",
        description: `${status.byPriority.FLASH} FLASH items queued. FLASH traffic should clear within 5 seconds.`,
        currentValue: `${status.byPriority.FLASH} items queued`,
        recommendedValue: "0-2 items max",
        impact: "Mission-critical communications delayed",
      });
    }

    // Check bandwidth utilization
    const bandwidth = this.getBandwidthAllocation();
    if (bandwidth.allocations.ROUTINE.utilizationPercent > 80) {
      recommendations.push({
        id: "qos-routine-congestion",
        category: "bandwidth",
        severity: "WARNING",
        title: "ROUTINE Bandwidth Near Capacity",
        description: "ROUTINE traffic is consuming most of its allocated bandwidth. Higher priority traffic may preempt.",
        currentValue: `${bandwidth.allocations.ROUTINE.utilizationPercent}% utilized`,
        recommendedValue: "Below 70% utilization",
        impact: "ROUTINE traffic delays, potential drops during FLASH bursts",
      });
    }

    // Check for overall overflow risk
    if (status.overflowRisk === "HIGH" || status.overflowRisk === "CRITICAL") {
      recommendations.push({
        id: "qos-overflow-risk",
        category: "queue",
        severity: "ACTION_REQUIRED",
        title: "Queue Overflow Risk",
        description: `Queue utilization is ${status.overflowRisk}. Traffic may be dropped if backlog continues to grow.`,
        currentValue: `${status.totalItems} items, overflow risk: ${status.overflowRisk}`,
        recommendedValue: "Below MEDIUM overflow risk",
        impact: "Data loss for lower-priority traffic",
      });
    }

    // Check for starvation
    if (starvation.isStarving) {
      recommendations.push({
        id: "qos-starvation",
        category: "policy",
        severity: "WARNING",
        title: "Priority Starvation Detected",
        description: `${starvation.starvedPriorities.length} priority level(s) experiencing starvation. ${starvation.recommendations[0] || ""}`,
        currentValue: starvation.starvedPriorities.map((s) => `${s.priority}: ${s.oldestItemAgeSeconds}s`).join(", "),
        recommendedValue: "All priorities within expected wait times",
        impact: "Lower-priority operational data not being delivered",
      });
    }

    // Check drop rate
    if (status.droppedItems24h > 20) {
      recommendations.push({
        id: "qos-drop-rate",
        category: "queue",
        severity: "WARNING",
        title: "Elevated Drop Rate",
        description: `${status.droppedItems24h} items dropped in 24h. Check for expired FLASH/IMMEDIATE items and transport capacity.`,
        currentValue: `${status.droppedItems24h} drops/24h`,
        recommendedValue: "Below 5 drops/24h",
        impact: "Data not reaching destination, potential mission impact",
      });
    }

    // Check distribution balance
    if (distribution.alertLevel === "HIGH") {
      recommendations.push({
        id: "qos-flash-heavy",
        category: "priority",
        severity: "WARNING",
        title: "Abnormally High FLASH Traffic",
        description: "FLASH traffic exceeds 30% of queue. This may indicate a crisis or priority misclassification.",
        currentValue: `FLASH: ${distribution.distribution.FLASH.countPercent}% of traffic`,
        recommendedValue: "FLASH should be < 10% under normal operations",
        impact: "All other priorities being preempted; possible priority inflation",
      });
    }

    // Always include an informational recommendation
    if (recommendations.length === 0) {
      recommendations.push({
        id: "qos-nominal",
        category: "policy",
        severity: "INFO",
        title: "QoS Operating Normally",
        description: "All priority queues within expected parameters. No action required.",
        currentValue: `${status.totalItems} items, ${status.processedItems24h} processed/24h`,
        recommendedValue: "N/A",
        impact: "None - nominal operations",
      });
    }

    return recommendations;
  }

  private getAllocationForPriority(priority: PriorityLevel): number {
    const allocPercent: Record<PriorityLevel, number> = {
      FLASH: 0.30,
      IMMEDIATE: 0.30,
      PRIORITY: 0.25,
      ROUTINE: 0.15,
    };
    return this.totalBandwidthMbps * allocPercent[priority];
  }

  private seededRandom(seed: string, offset: number): number {
    let hash = 0;
    const str = seed + String(offset);
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(Math.sin(hash) * 10000) % 1;
  }

  private seededInt(seed: string, min: number, max: number): number {
    return min + Math.floor(this.seededRandom(seed, 0) * (max - min + 1));
  }
}
