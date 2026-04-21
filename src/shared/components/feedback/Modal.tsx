import React, { useState } from "react";
import { Button } from "../inputs/Input";

interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: string;
}

export function Modal({ isOpen, title, onClose, children, footer, style, ...props }: ModalProps) {
  if (!isOpen) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)" }} onClick={onClose} />
      <div style={{ position: "relative", zIndex: 10, background: "#0d1520", border: "1px solid #1a2535", borderRadius: 8, width: "100%", maxWidth: 480, margin: "0 16px", ...style }} {...props}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #1a2535" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#c9d3e0", fontFamily: "monospace" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16 }}>{"\u2715"}</button>
        </div>
        <div style={{ padding: "14px 20px", color: "#c9d3e0", fontSize: 12, fontFamily: "monospace" }}>{children}</div>
        {footer && <div style={{ padding: "12px 20px", borderTop: "1px solid #1a2535", display: "flex", justifyContent: "flex-end", gap: 8 }}>{footer}</div>}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: string;
}

export function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, confirmText = "Confirm", cancelText = "Cancel", variant = "default" }: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} title={title} onClose={onCancel}
      footer={<><Button variant="ghost" onClick={onCancel}>{cancelText}</Button><Button variant={variant === "danger" ? "danger" : "primary"} onClick={() => { onConfirm(); onCancel(); }}>{confirmText}</Button></>}>
      <p style={{ fontSize: 12, color: "#94a3b8" }}>{message}</p>
    </Modal>
  );
}

interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  message: string;
  type?: string;
  duration?: number;
  onClose?: () => void;
}

const toastColors: Record<string, string> = { info: "#3b82f6", success: "#22c55e", warning: "#f59e0b", error: "#ef4444" };

export function Toast({ message, type = "info", duration = 3000, onClose, style, ...props }: ToastProps) {
  const [visible, setVisible] = useState(true);
  React.useEffect(() => {
    if (duration && visible) { const t = setTimeout(() => { setVisible(false); onClose?.(); }, duration); return () => clearTimeout(t); }
    return undefined;
  }, [duration, visible, onClose]);
  if (!visible) return null;
  return (
    <div style={{ position: "fixed", bottom: 16, right: 16, padding: "10px 20px", borderRadius: 6, background: toastColors[type] || "#3b82f6", color: "#fff", fontSize: 12, fontFamily: "monospace", zIndex: 100, ...style }} {...props}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span>{message}</span>
        <button onClick={() => { setVisible(false); onClose?.(); }} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer" }}>{"\u2715"}</button>
      </div>
    </div>
  );
}

interface TooltipProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "content"> {
  content: React.ReactNode;
  position?: string;
  children: React.ReactNode;
  delay?: number;
}

export function Tooltip({ content, children, delay = 200, ...props }: TooltipProps) {
  const [show, setShow] = useState(false);
  const ref = React.useRef<ReturnType<typeof setTimeout>>();
  return (
    <div style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => { ref.current = setTimeout(() => setShow(true), delay); }}
      onMouseLeave={() => { clearTimeout(ref.current); setShow(false); }}>
      {children}
      {show && <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 6, padding: "4px 8px", background: "#1a2535", color: "#c9d3e0", fontSize: 10, borderRadius: 4, whiteSpace: "nowrap", zIndex: 40, fontFamily: "monospace" }}>{content}</div>}
    </div>
  );
}

interface DrawerProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  position?: "left" | "right";
  width?: string;
}

export function Drawer({ isOpen, title, onClose, children, position = "right", width = "400px", style, ...props }: DrawerProps) {
  if (!isOpen) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)" }} onClick={onClose} />
      <div style={{ position: "absolute", top: 0, bottom: 0, [position]: 0, width, background: "#0d1520", borderLeft: position === "right" ? "1px solid #1a2535" : undefined, borderRight: position === "left" ? "1px solid #1a2535" : undefined, zIndex: 10, display: "flex", flexDirection: "column", ...style }} {...props}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid #1a2535" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#c9d3e0", fontFamily: "monospace" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 16 }}>{"\u2715"}</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "14px 20px", color: "#c9d3e0", fontSize: 12 }}>{children}</div>
      </div>
    </div>
  );
}
