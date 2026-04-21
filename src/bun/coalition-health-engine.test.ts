/**
 * Integration tests for Coalition Health Engine
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CoalitionHealthEngine } from "./coalition-health-engine";

describe("Coalition Health Engine", () => {
  let engine: CoalitionHealthEngine;

  beforeEach(() => {
    const mockDb = {
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue({
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      }),
      query: vi.fn().mockReturnValue([]),
    };
    engine = new CoalitionHealthEngine(mockDb as any);
  });

  describe("Service Initialization", () => {
    it("should initialize successfully", () => {
      expect(engine).toBeDefined();
    });
  });

  describe("Core Methods", () => {
    it("should expose getKitDependencies", () => {
      expect(typeof engine.getKitDependencies).toBe("function");
    });

    it("should expose analyzeFailurePropagation", () => {
      expect(typeof engine.analyzeFailurePropagation).toBe("function");
    });
  });
});
