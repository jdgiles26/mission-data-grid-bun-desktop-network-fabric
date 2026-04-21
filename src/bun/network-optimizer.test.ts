/**
 * Integration tests for Network Optimizer
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NetworkOptimizer } from "./network-optimizer";

describe("Network Optimizer", () => {
  let optimizer: NetworkOptimizer;

  beforeEach(() => {
    const mockDb = {
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
      query: vi.fn().mockReturnValue([]),
    };
    optimizer = new NetworkOptimizer(mockDb as any);
  });

  describe("Service Initialization", () => {
    it("should initialize successfully", () => {
      expect(optimizer).toBeDefined();
    });
  });

  describe("Core Methods", () => {
    it("should expose optimizeBandwidth", () => {
      expect(typeof optimizer.optimizeBandwidth).toBe("function");
    });

    it("should expose suggestRoutingChanges", () => {
      expect(typeof optimizer.suggestRoutingChanges).toBe("function");
    });

    it("should expose simulateQueue", () => {
      expect(typeof optimizer.simulateQueue).toBe("function");
    });
  });
});
