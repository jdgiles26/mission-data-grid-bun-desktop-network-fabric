import React, { useEffect, useState } from "react";
import { useAppStore } from "./store";
import { ErrorBoundary } from "./error-boundary";

interface AppShellProps {
  children: React.ReactNode;
  navigationItems: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
  }>;
  onNavigate: (viewId: string) => void;
  activeView: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  navigationItems,
  onNavigate,
  activeView,
}) => {
  const { theme, setTheme, toggleSidebar, sidebarOpen } = useAppStore();
  const { notifications, errors } = useAppStore((state) => ({
    notifications: state.notifications,
    errors: state.errors,
  }));
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  useEffect(() => {
    // Apply theme to document
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    // Command palette shortcut: Cmd+K or Ctrl+K
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette(!showCommandPalette);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCommandPalette]);

  return (
    <ErrorBoundary>
      <div
        className={`w-screen h-screen flex flex-col bg-background text-foreground ${
          theme === "dark" ? "dark" : ""
        }`}
      >
        {/* Header */}
        <header className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shadow-sm">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSidebar}
              className="p-2 hover:bg-muted rounded-md transition-colors"
              aria-label="Toggle sidebar"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-bold">Mission Data Grid</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 hover:bg-muted rounded-md transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <aside
            className={`${
              sidebarOpen ? "w-64" : "w-16"
            } border-r border-border bg-card transition-all duration-200 overflow-y-auto`}
          >
            <nav className="flex flex-col gap-1 p-2">
              {navigationItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                    activeView === item.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                  title={item.label}
                >
                  <span className="w-5 h-5 flex-shrink-0">{item.icon}</span>
                  {sidebarOpen && <span className="text-sm">{item.label}</span>}
                </button>
              ))}
            </nav>
          </aside>

          {/* Content Area */}
          <main className="flex-1 overflow-auto bg-background">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
        </div>

        {/* Status Bar */}
        <footer className="h-8 border-t border-border bg-card px-4 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              <span>Connected</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {errors.length > 0 && (
              <span className="text-red-500">
                {errors.length} error{errors.length !== 1 ? "s" : ""}
              </span>
            )}
            {notifications.length > 0 && (
              <span className="text-yellow-500">
                {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </footer>

        {/* Modal Portal */}
        <div id="modal-root" />

        {/* Command Palette (placeholder) */}
        {showCommandPalette && (
          <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-20 z-50">
            <div className="w-96 bg-card rounded-lg shadow-lg">
              <input
                type="text"
                placeholder="Type a command... (Esc to close)"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowCommandPalette(false);
                }}
                className="w-full px-4 py-2 border-b border-border bg-background text-foreground rounded-t-lg focus:outline-none"
              />
              <div className="p-2 max-h-64 overflow-y-auto text-sm text-muted-foreground">
                No commands available
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};
