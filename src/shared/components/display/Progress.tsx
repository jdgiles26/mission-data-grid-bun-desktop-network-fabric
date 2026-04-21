import React from "react";

const variantColorMap: Record<string, string> = { primary: "#3b82f6", success: "#22c55e", warning: "#f59e0b", error: "#ef4444" };

interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  variant?: string;
  showLabel?: boolean;
  className?: string;
}

export const ProgressBar = React.forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ value, max = 100, variant = "primary", showLabel, style, ...props }, ref) => {
    const pct = Math.min(100, (value / max) * 100);
    const color = variantColorMap[variant] || "#3b82f6";
    return (
      <div ref={ref} style={{ width: "100%", ...style }} {...props}>
        <div style={{ width: "100%", background: "#0a1220", borderRadius: 4, height: 8, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.3s" }} />
        </div>
        {showLabel && <span style={{ fontSize: 10, color: "#64748b", marginTop: 2, display: "block" }}>{Math.round(pct)}%</span>}
      </div>
    );
  }
);
ProgressBar.displayName = "ProgressBar";

interface MetricProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "stable";
  trendValue?: string | number;
  size?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const Metric = React.forwardRef<HTMLDivElement, MetricProps>(
  ({ label, value, unit, trend, trendValue, style, ...props }, ref) => {
    const trendColor = trend === "up" ? "#ef4444" : trend === "down" ? "#22c55e" : "#64748b";
    return (
      <div ref={ref} style={{ background: "#0a1220", border: "1px solid #1a2535", borderRadius: 6, padding: "12px 14px", ...style }} {...props}>
        <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 4, textTransform: "uppercase", fontFamily: "monospace" }}>{label}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#c9d3e0", fontFamily: "monospace" }}>{value}</span>
          {unit && <span style={{ fontSize: 11, color: "#64748b" }}>{unit}</span>}
        </div>
        {trend && trendValue && (
          <div style={{ fontSize: 10, color: trendColor, marginTop: 4 }}>
            {trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "\u2192"} {trendValue}
          </div>
        )}
      </div>
    );
  }
);
Metric.displayName = "Metric";

const alertColors: Record<string, { bg: string; border: string; color: string }> = {
  info: { bg: "#3b82f611", border: "#3b82f633", color: "#93c5fd" },
  success: { bg: "#22c55e11", border: "#22c55e33", color: "#86efac" },
  warning: { bg: "#f59e0b11", border: "#f59e0b33", color: "#fcd34d" },
  error: { bg: "#ef444411", border: "#ef444433", color: "#fca5a5" },
  critical: { bg: "#ef444411", border: "#ef444433", color: "#fca5a5" },
};

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  title?: string;
  message?: string;
  variant?: string;
  type?: string;
  onClose?: () => void;
  className?: string;
  [key: string]: any;
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ children, title, message, variant, type, onClose, style, ...props }, ref) => {
    const v = variant || type || "info";
    const c = alertColors[v] || alertColors.info!;
    return (
      <div ref={ref} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, padding: "10px 14px", color: c.color, fontSize: 12, fontFamily: "monospace", marginBottom: 8, ...style }} {...props}>
        {title && <div style={{ fontWeight: 700, marginBottom: message ? 4 : 0 }}>{title}</div>}
        {message && <div style={{ opacity: 0.9, fontSize: 11 }}>{message}</div>}
        {children}
      </div>
    );
  }
);
Alert.displayName = "Alert";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  count?: number;
  height?: string;
  width?: string;
  className?: string;
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ count = 1, height = "20px", width = "100%", style, ...props }, ref) => (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} ref={i === 0 ? ref : undefined} style={{ background: "#1a2535", borderRadius: 4, marginBottom: 8, height, width, ...style }} {...(i === 0 ? props : {})} />
      ))}
    </>
  )
);
Skeleton.displayName = "Skeleton";
