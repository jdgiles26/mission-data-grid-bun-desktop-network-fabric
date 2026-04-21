/**
 * Integration tests for Performance Intelligence
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PerformanceIntelligence } from "./performance-intelligence";

describe("Performance Intelligence", () => {
  let perf: PerformanceIntelligence;

  beforeEach(() => {
    const mockDb = {
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
      query: vi.fn().mockReturnValue([]),
    };
    perf = new PerformanceIntelligence(mockDb as any);
  });

  describe("Service Initialization", () => {
    it("should initialize successfully", () => {
      expect(perf).toBeDefined();
    });
  });

  describe("Core Methods", () => {
    it("should expose trackSLO", () => {
      expect(typeof perf.trackSLO).toBe("function");
    });

    it("should expose analyzeLatency", () => {
      expect(typeof perf.analyzeLatency).toBe("function");
    });

    it("should expose assessUXImpact", () => {
      expect(typeof perf.assessUXImpact).toBe("function");
    });

    it("should expose identifyBottlenecks", () => {
      expect(typeof perf.identifyBottlenecks).toBe("function");
    });

    it("should expose recordErrorEvent", () => {
      expect(typeof perf.recordErrorEvent).toBe("function");
    });

    it("should expose recordMetric", () => {
      expect(typeof perf.recordMetric).toBe("function");
    });
  });
});
