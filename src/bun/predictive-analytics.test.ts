/**
 * Integration tests for Predictive Failure Analytics
 * Tests the service interface and algorithm existence
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PredictiveAnalytics } from "./predictive-analytics";
import type { TimeSeriesDataPoint } from "./predictive-analytics";

describe("Predictive Analytics", () => {
  let analytics: PredictiveAnalytics;

  beforeEach(() => {
    const mockDb = {
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
      query: vi.fn().mockReturnValue([]),
    };
    analytics = new PredictiveAnalytics(mockDb as any);
  });

  describe("Service Initialization", () => {
    it("should initialize successfully", () => {
      expect(analytics).toBeDefined();
    });
  });

  describe("Anomaly Detection API", () => {
    it("should expose detectAnomalies method", () => {
      expect(typeof analytics.detectAnomalies).toBe("function");
    });

    it("should return array from detectAnomalies", async () => {
      const dataPoints: TimeSeriesDataPoint[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: new Date(Date.now() - (10 - i) * 60000),
        value: 50,
      }));

      const result = await analytics.detectAnomalies("kit-1", "latency", dataPoints);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("Forecasting API", () => {
    it("should expose forecastMetric method", () => {
      expect(typeof analytics.forecastMetric).toBe("function");
    });

    it("should return forecast object", async () => {
      const dataPoints: TimeSeriesDataPoint[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: new Date(Date.now() - (20 - i) * 60000),
        value: 50,
      }));

      const result = await analytics.forecastMetric("kit-1", "memory", dataPoints, 6);
      expect(result).toBeDefined();
      expect(result.forecastedValues).toBeDefined();
      expect(result.modelType).toBeDefined();
    });
  });

  describe("Failure Risk Prediction API", () => {
    it("should expose predictFailureRisk method", () => {
      expect(typeof analytics.predictFailureRisk).toBe("function");
    });

    it("should return prediction object", async () => {
      const historicalData: TimeSeriesDataPoint[] = Array.from({ length: 20 }, (_, i) => ({
        timestamp: new Date(Date.now() - (20 - i) * 60000),
        value: 50,
      }));

      const result = await analytics.predictFailureRisk("kit-1", "cpu", 60, historicalData);
      expect(result).toBeDefined();
      expect(result.failureProbability).toBeDefined();
      expect(result.confidenceScore).toBeDefined();
      expect(Array.isArray(result.contributingFactors)).toBe(true);
    });
  });

  describe("Pattern Recognition API", () => {
    it("should expose getAnomalyPatterns method", () => {
      expect(typeof analytics.getAnomalyPatterns).toBe("function");
    });

    it("should return array from getAnomalyPatterns", async () => {
      const result = await analytics.getAnomalyPatterns("kit-1", 24);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
