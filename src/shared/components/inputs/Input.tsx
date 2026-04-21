import React, { useState } from "react";

const baseInput: React.CSSProperties = {
  width: "100%", padding: "6px 10px", background: "#0a1220", border: "1px solid #1a2535",
  borderRadius: 4, color: "#c9d3e0", fontSize: 12, fontFamily: "monospace", outline: "none",
};

interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix" | "suffix"> {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, error, hint, prefix: _p, suffix: _s, style, ...props }, ref) => (
    <div style={{ width: "100%" }}>
      {label && <label style={{ display: "block", fontSize: 10, color: "#64748b", marginBottom: 4, fontFamily: "monospace", letterSpacing: 1, textTransform: "uppercase" }}>{label}</label>}
      <input ref={ref} style={{ ...baseInput, borderColor: error ? "#ef4444" : "#1a2535", ...style }} {...props} />
      {error && <span style={{ fontSize: 10, color: "#ef4444", marginTop: 2, display: "block" }}>{error}</span>}
      {hint && <span style={{ fontSize: 10, color: "#64748b", marginTop: 2, display: "block" }}>{hint}</span>}
    </div>
  )
);
TextInput.displayName = "TextInput";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Array<{ value: string | number; label: string }>;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, style, ...props }, ref) => (
    <div style={{ width: "100%" }}>
      {label && <label style={{ display: "block", fontSize: 10, color: "#64748b", marginBottom: 4, fontFamily: "monospace" }}>{label}</label>}
      <select ref={ref} style={{ ...baseInput, ...style }} {...props}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <span style={{ fontSize: 10, color: "#ef4444", marginTop: 2, display: "block" }}>{error}</span>}
    </div>
  )
);
Select.displayName = "Select";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, ...props }, ref) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <input ref={ref} type="checkbox" style={{ marginTop: 2 }} {...props} />
      {label && <div><span style={{ fontSize: 12, color: "#c9d3e0" }}>{label}</span>{description && <p style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{description}</p>}</div>}
    </div>
  )
);
Checkbox.displayName = "Checkbox";

interface RadioGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: Array<{ value: string; label: string; description?: string }>;
  selected?: string;
  onChange?: (value: string) => void;
  name: string;
}

export const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ options, selected, onChange, name, style, ...props }, ref) => (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 8, ...style }} {...props}>
      {options.map(o => (
        <div key={o.value} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <input type="radio" name={name} value={o.value} checked={selected === o.value} onChange={e => onChange?.(e.target.value)} />
          <div><span style={{ fontSize: 12, color: "#c9d3e0" }}>{o.label}</span></div>
        </div>
      ))}
    </div>
  )
);
RadioGroup.displayName = "RadioGroup";

interface ToggleProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
}

export const Toggle = React.forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, checked: controlledChecked, onChange, ...props }, ref) => {
    const [isChecked, setIsChecked] = useState(controlledChecked === true);
    const c = controlledChecked !== undefined ? controlledChecked : isChecked;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div onClick={() => { setIsChecked(!c); onChange?.({ target: { checked: !c } } as any); }}
          style={{ width: 36, height: 20, borderRadius: 10, background: c ? "#22c55e" : "#1a2535", cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#c9d3e0", position: "absolute", top: 2, left: c ? 18 : 2, transition: "left 0.2s" }} />
          <input ref={ref} type="checkbox" checked={c} onChange={() => {}} style={{ display: "none" }} {...props} />
        </div>
        {label && <span style={{ fontSize: 12, color: "#c9d3e0", fontFamily: "monospace" }}>{label}</span>}
      </div>
    );
  }
);
Toggle.displayName = "Toggle";

const btnVariants: Record<string, React.CSSProperties> = {
  primary: { background: "#3b82f6", color: "#fff" },
  secondary: { background: "#1a2535", color: "#c9d3e0", border: "1px solid #1a2535" },
  danger: { background: "#ef4444", color: "#fff" },
  ghost: { background: "transparent", color: "#c9d3e0", border: "1px solid #1a2535" },
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: string;
  size?: string;
  loading?: boolean;
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", loading, disabled, children, style, ...props }, ref) => (
    <button ref={ref} disabled={disabled || loading} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 4, fontWeight: 600,
      padding: "6px 14px", fontSize: 11, fontFamily: "monospace", cursor: disabled || loading ? "not-allowed" : "pointer",
      opacity: disabled || loading ? 0.5 : 1, border: "none", letterSpacing: 0.5, transition: "opacity 0.15s",
      ...(btnVariants[variant] || btnVariants.primary), ...style,
    }} {...props}>
      {loading && <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />}
      {children}
    </button>
  )
);
Button.displayName = "Button";

interface FormGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

export const FormGroup = React.forwardRef<HTMLDivElement, FormGroupProps>(
  ({ label, error, required, children, style, ...props }, ref) => (
    <div ref={ref} style={{ width: "100%", marginBottom: 12, ...style }} {...props}>
      {label && <label style={{ display: "block", fontSize: 10, color: "#64748b", marginBottom: 4, fontFamily: "monospace" }}>{label}{required && <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>}</label>}
      {children}
      {error && <span style={{ fontSize: 10, color: "#ef4444", marginTop: 2, display: "block" }}>{error}</span>}
    </div>
  )
);
FormGroup.displayName = "FormGroup";
