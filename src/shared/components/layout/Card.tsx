import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}
interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}
interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}
interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, style, ...props }, ref) => (
    <div ref={ref} style={{ background: "#0d1520", border: "1px solid #1a2535", borderRadius: 6, marginBottom: 16, ...style }} {...props}>{children}</div>
  )
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ children, style, ...props }, ref) => (
    <div ref={ref} style={{ padding: "10px 16px", borderBottom: "1px solid #1a2535", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: "#64748b", textTransform: "uppercase", fontFamily: "monospace", ...style }} {...props}>{children}</div>
  )
);
CardHeader.displayName = "CardHeader";

export const CardBody = React.forwardRef<HTMLDivElement, CardBodyProps>(
  ({ children, style, ...props }, ref) => (
    <div ref={ref} style={{ padding: "12px 16px", color: "#c9d3e0", fontFamily: "monospace", fontSize: 12, ...style }} {...props}>{children}</div>
  )
);
CardBody.displayName = "CardBody";

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ children, style, ...props }, ref) => (
    <div ref={ref} style={{ padding: "10px 16px", borderTop: "1px solid #1a2535", ...style }} {...props}>{children}</div>
  )
);
CardFooter.displayName = "CardFooter";
