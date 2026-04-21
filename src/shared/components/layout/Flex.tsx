import React from "react";

const gapMap: Record<string, number> = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  columns?: number;
  gap?: number | string;
  className?: string;
}

export const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  ({ children, columns = 1, gap = "md", style, ...props }, ref) => {
    const g = typeof gap === "number" ? gap : (gapMap[gap] ?? 12);
    return (
      <div ref={ref} style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: g, padding: 16, ...style }} {...props}>{children}</div>
    );
  }
);
Grid.displayName = "Grid";

interface FlexProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  direction?: "row" | "col";
  align?: string;
  justify?: string;
  gap?: number | string;
  wrap?: boolean;
  className?: string;
}

export const Flex = React.forwardRef<HTMLDivElement, FlexProps>(
  ({ children, direction = "row", align, justify, gap = "md", wrap, style, ...props }, ref) => {
    const g = typeof gap === "number" ? gap : (gapMap[gap] ?? 12);
    return (
      <div ref={ref} style={{
        display: "flex",
        flexDirection: direction === "col" ? "column" : "row",
        alignItems: align || "flex-start",
        justifyContent: justify === "between" ? "space-between" : justify || "flex-start",
        gap: g,
        flexWrap: wrap ? "wrap" : undefined,
        ...style,
      }} {...props}>{children}</div>
    );
  }
);
Flex.displayName = "Flex";

interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  direction?: "vertical" | "horizontal";
  spacing?: string;
  align?: string;
  className?: string;
}

export const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  ({ children, direction = "vertical", spacing = "md", style, ...props }, ref) => {
    const g = gapMap[spacing] ?? 12;
    return (
      <div ref={ref} style={{ display: "flex", flexDirection: direction === "vertical" ? "column" : "row", gap: g, ...style }} {...props}>{children}</div>
    );
  }
);
Stack.displayName = "Stack";

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  size?: string;
  className?: string;
}

export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ children, style, ...props }, ref) => (
    <div ref={ref} style={{ width: "100%", maxWidth: 1200, margin: "0 auto", padding: "0 16px", ...style }} {...props}>{children}</div>
  )
);
Container.displayName = "Container";
