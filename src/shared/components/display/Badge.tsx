import React from "react";

const variantColors: Record<string, { bg: string; color: string; border: string }> = {
  primary: { bg: "#3b82f622", color: "#3b82f6", border: "#3b82f644" },
  secondary: { bg: "#64748b22", color: "#64748b", border: "#64748b44" },
  success: { bg: "#22c55e22", color: "#22c55e", border: "#22c55e44" },
  warning: { bg: "#f59e0b22", color: "#f59e0b", border: "#f59e0b44" },
  error: { bg: "#ef444422", color: "#ef4444", border: "#ef444444" },
  info: { bg: "#3b82f622", color: "#3b82f6", border: "#3b82f644" },
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode;
  variant?: string;
  size?: string;
  label?: string;
  className?: string;
  [key: string]: any;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ children, variant = "primary", label, style, ...props }, ref) => {
    const v = variantColors[variant] || variantColors.primary!;
    return (
      <span ref={ref} style={{
        display: "inline-block", padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 600,
        background: v.bg, color: v.color, border: `1px solid ${v.border}`, letterSpacing: 0.5, fontFamily: "monospace",
        ...style,
      }} {...props}>{children || label}</span>
    );
  }
);
Badge.displayName = "Badge";

interface StatusIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  status: "online" | "offline" | "warning" | "idle";
  label?: string;
  size?: string;
  className?: string;
}

const statusColorMap: Record<string, string> = { online: "#22c55e", offline: "#ef4444", warning: "#f59e0b", idle: "#64748b" };

export const StatusIndicator = React.forwardRef<HTMLDivElement, StatusIndicatorProps>(
  ({ status, label, style, ...props }, ref) => (
    <div ref={ref} style={{ display: "flex", alignItems: "center", gap: 6, ...style }} {...props}>
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: statusColorMap[status] || "#64748b", boxShadow: `0 0 6px ${statusColorMap[status] || "#64748b"}` }} />
      {label && <span style={{ fontSize: 11, color: "#c9d3e0", fontFamily: "monospace" }}>{label}</span>}
    </div>
  )
);
StatusIndicator.displayName = "StatusIndicator";

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: string;
  className?: string;
}

export const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ style, ...props }, ref) => (
    <div ref={ref} style={{ display: "inline-block", color: "#64748b", fontSize: 12, letterSpacing: 2, ...style }} {...props}>LOADING...</div>
  )
);
Spinner.displayName = "Spinner";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  initials?: string;
  name?: string;
  size?: string;
  className?: string;
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ name, initials, style, ...props }, ref) => {
    const text = initials || (name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "?");
    return (
      <div ref={ref} style={{ width: 32, height: 32, borderRadius: "50%", background: "#3b82f6", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, ...style }} {...props}>{text}</div>
    );
  }
);
Avatar.displayName = "Avatar";

interface IconProps extends React.SVGAttributes<SVGSVGElement> {
  size?: string;
  children: React.ReactNode;
  className?: string;
}

export const Icon = React.forwardRef<SVGSVGElement, IconProps>(
  ({ children, ...props }, ref) => (
    <svg ref={ref} width={20} height={20} {...props}>{children}</svg>
  )
);
Icon.displayName = "Icon";
