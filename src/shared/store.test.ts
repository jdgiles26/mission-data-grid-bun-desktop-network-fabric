import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./store";

describe("App Store", () => {
  beforeEach(() => {
    useAppStore.getState().reset();
  });

  it("should initialize with correct default values", () => {
    const state = useAppStore.getState();
    expect(state.theme).toBe("dark");
    expect(state.sidebarOpen).toBe(true);
    expect(state.activeView).toBe("dashboard");
    expect(state.rpcConnected).toBe(false);
  });

  it("should toggle sidebar", () => {
    const { toggleSidebar, sidebarOpen: initial } = useAppStore.getState();
    toggleSidebar();
    expect(useAppStore.getState().sidebarOpen).toBe(!initial);
  });

  it("should set theme", () => {
    useAppStore.getState().setTheme("light");
    expect(useAppStore.getState().theme).toBe("light");
    useAppStore.getState().setTheme("dark");
    expect(useAppStore.getState().theme).toBe("dark");
  });

  it("should add and remove notifications", () => {
    const id = useAppStore.getState().addNotification({
      title: "Test",
      message: "Test message",
      type: "info",
    });
    expect(useAppStore.getState().notifications).toHaveLength(1);

    useAppStore.getState().removeNotification(id);
    expect(useAppStore.getState().notifications).toHaveLength(0);
  });

  it("should add errors and clear them", () => {
    useAppStore.getState().addError({
      message: "Test error",
    });
    expect(useAppStore.getState().errors).toHaveLength(1);

    useAppStore.getState().clearErrors();
    expect(useAppStore.getState().errors).toHaveLength(0);
  });

  it("should set loading state", () => {
    useAppStore.getState().setLoading("test-key", true);
    expect(useAppStore.getState().loading["test-key"]).toBe(true);

    useAppStore.getState().setLoading("test-key", false);
    expect(useAppStore.getState().loading["test-key"]).toBe(false);
  });

  it("should set RPC connected state", () => {
    useAppStore.getState().setRpcConnected(true);
    expect(useAppStore.getState().rpcConnected).toBe(true);

    useAppStore.getState().setRpcConnected(false);
    expect(useAppStore.getState().rpcConnected).toBe(false);
  });
});
