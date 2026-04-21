/**
 * Integration tests for Drift Intelligence
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { DriftIntelligence } from "./drift-intelligence";

describe("Drift Intelligence", () => {
  let drift: DriftIntelligence;

  beforeEach(() => {
    const mockDb = {
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
      query: vi.fn().mockReturnValue([]),
    };
    drift = new DriftIntelligence(mockDb as any);
  });

  describe("Service Initialization", () => {
    it("should initialize successfully", () => {
      expect(drift).toBeDefined();
    });
  });

  describe("Core Methods", () => {
    it("should expose detectConfigDrift", () => {
      expect(typeof drift.detectConfigDrift).toBe("function");
    });

    it("should expose predictChangeImpact", () => {
      expect(typeof drift.predictChangeImpact).toBe("function");
    });

    it("should expose suggestOptimizations", () => {
      expect(typeof drift.suggestOptimizations).toBe("function");
    });
  });
});
