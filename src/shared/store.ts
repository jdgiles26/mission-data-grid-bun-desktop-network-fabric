import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export interface AppState {
  // Theme & UI
  theme: "light" | "dark";
  sidebarOpen: boolean;
  activeModal: string | null;
  activeView: "dashboard" | "data-grid" | "topology" | "settings" | "packet-capture";

  // Network & Topology Data
  topology: {
    nodes: any[];
    links: any[];
    metrics: Record<string, any>;
  };

  // AutoNet State
  autonet: {
    kits: any[];
    devices: any[];
    metrics: Record<string, any>;
    config: any;
  };

  // Packet Capture Data
  packets: {
    flows: any[];
    dns: any[];
    http: any[];
    tls: any[];
  };

  // Health & Status
  health: {
    overall: "healthy" | "degraded" | "failed";
    components: Record<string, "ok" | "warning" | "error">;
    lastUpdate: number;
  };

  // App State
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    type: "info" | "warning" | "error" | "success";
    timestamp: number;
  }>;
  errors: Array<{
    id: string;
    message: string;
    stack?: string;
    timestamp: number;
  }>;
  loading: Record<string, boolean>;
  rpcConnected: boolean;

  // Actions
  setTheme: (theme: "light" | "dark") => void;
  toggleSidebar: () => void;
  setActiveView: (view: AppState["activeView"]) => void;
  setActiveModal: (modal: string | null) => void;

  setTopology: (data: AppState["topology"]) => void;
  setAutonetData: (data: Partial<AppState["autonet"]>) => void;
  setPacketsData: (data: Partial<AppState["packets"]>) => void;
  setHealth: (health: AppState["health"]) => void;

  addNotification: (notification: Omit<AppState["notifications"][0], "id" | "timestamp">) => string;
  removeNotification: (id: string) => void;
  addError: (error: Omit<AppState["errors"][0], "id" | "timestamp">) => void;
  clearErrors: () => void;

  setLoading: (key: string, loading: boolean) => void;
  setRpcConnected: (connected: boolean) => void;

  reset: () => void;
}

const initialState: Omit<AppState, keyof { [K in keyof AppState as AppState[K] extends (...args: any[]) => any ? K : never]: any }> = {
  theme: "dark",
  sidebarOpen: true,
  activeModal: null,
  activeView: "dashboard",
  topology: { nodes: [], links: [], metrics: {} },
  autonet: { kits: [], devices: [], metrics: {}, config: null },
  packets: { flows: [], dns: [], http: [], tls: [] },
  health: { overall: "healthy", components: {}, lastUpdate: 0 },
  notifications: [],
  errors: [],
  loading: {},
  rpcConnected: false,
};

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        setTheme: (theme) => set({ theme }),
        toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
        setActiveView: (view) => set({ activeView: view }),
        setActiveModal: (modal) => set({ activeModal: modal }),

        setTopology: (data) => set({ topology: data }),
        setAutonetData: (data) => set((state) => ({ autonet: { ...state.autonet, ...data } })),
        setPacketsData: (data) => set((state) => ({ packets: { ...state.packets, ...data } })),
        setHealth: (health) => set({ health }),

        addNotification: (notification) => {
          const id = `notif-${Date.now()}`;
          set((state) => ({
            notifications: [
              ...state.notifications,
              {
                id,
                timestamp: Date.now(),
                ...notification,
              },
            ].slice(-50), // Keep last 50
          }));
          return id;
        },

        removeNotification: (id) => {
          set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
          }));
        },

        addError: (error) => {
          set((state) => ({
            errors: [
              ...state.errors,
              {
                id: `err-${Date.now()}`,
                timestamp: Date.now(),
                ...error,
              },
            ].slice(-20), // Keep last 20
          }));
        },

        clearErrors: () => set({ errors: [] }),

        setLoading: (key, loading) => {
          set((state) => ({
            loading: { ...state.loading, [key]: loading },
          }));
        },

        setRpcConnected: (connected) => set({ rpcConnected: connected }),

        reset: () => set(initialState),
      }),
      {
        name: "mdg-store",
        partialize: (state) => ({
          theme: state.theme,
          activeView: state.activeView,
        }),
      }
    )
  )
);
