import React, { useState } from "react";

const thStyle: React.CSSProperties = { textAlign: "left", padding: "6px 10px", color: "#4a6070", fontSize: 10, letterSpacing: 1, borderBottom: "1px solid #1a2535", textTransform: "uppercase", fontFamily: "monospace" };
const tdStyle: React.CSSProperties = { padding: "7px 10px", borderBottom: "1px solid #111b28", color: "#c9d3e0", fontSize: 11, fontFamily: "monospace" };

interface DataTableColumn<T = any> {
  key: string;
  header?: string;
  label?: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T extends Record<string, any> = Record<string, any>> {
  columns: DataTableColumn<T>[];
  rows?: T[];
  data?: T[];
  sortBy?: string;
  sortDesc?: boolean;
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  striped?: boolean;
  compact?: boolean;
  className?: string;
  [key: string]: any;
}

export function DataTable<T extends Record<string, any>>({ columns, rows, data, sortBy, sortDesc, onSort, onRowClick, ...props }: DataTableProps<T>) {
  const items = rows || data || [];
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{ ...thStyle, cursor: col.sortable ? "pointer" : undefined, width: col.width }} onClick={() => col.sortable && onSort?.(col.key)}>
                {col.header || col.label || col.key}
                {col.sortable && sortBy === col.key && <span style={{ marginLeft: 4 }}>{sortDesc ? "\u2193" : "\u2191"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ ...tdStyle, textAlign: "center", color: "#4a6070", padding: 20 }}>No data</td></tr>
          ) : items.map((row, idx) => (
            <tr key={idx} onClick={() => onRowClick?.(row)} style={{ cursor: onRowClick ? "pointer" : undefined }}>
              {columns.map(col => (
                <td key={col.key} style={tdStyle}>
                  {col.render ? col.render((row as any)[col.key], row) : (row as any)[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  tabs: Array<{ id: string; label: string; content: React.ReactNode }>;
  defaultTab?: string;
  onChange?: (tab: string) => void;
}

export function Tabs({ tabs, defaultTab, onChange, style, ...props }: TabsProps) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id);
  return (
    <div style={{ width: "100%", ...style }} {...props}>
      <div style={{ display: "flex", borderBottom: "1px solid #1a2535" }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => { setActive(tab.id); onChange?.(tab.id); }}
            style={{ padding: "8px 16px", fontSize: 11, fontFamily: "monospace", fontWeight: 600, background: "none", border: "none",
              borderBottom: active === tab.id ? "2px solid #3b82f6" : "2px solid transparent",
              color: active === tab.id ? "#3b82f6" : "#64748b", cursor: "pointer", letterSpacing: 0.5 }}>
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>{tabs.find(t => t.id === active)?.content}</div>
    </div>
  );
}

interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  items: Array<{ id: string; title: string; content: React.ReactNode }>;
  defaultOpen?: string[];
}

export function Accordion({ items, defaultOpen = [], style, ...props }: AccordionProps) {
  const [open, setOpen] = useState<Set<string>>(new Set(defaultOpen));
  const toggle = (id: string) => { const s = new Set(open); s.has(id) ? s.delete(id) : s.add(id); setOpen(s); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, ...style }} {...props}>
      {items.map(item => (
        <div key={item.id} style={{ border: "1px solid #1a2535", borderRadius: 6 }}>
          <button onClick={() => toggle(item.id)} style={{ width: "100%", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", color: "#c9d3e0", cursor: "pointer", fontSize: 12, fontFamily: "monospace" }}>
            <span>{item.title}</span>
            <span style={{ transform: open.has(item.id) ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>{"\u25BC"}</span>
          </button>
          {open.has(item.id) && <div style={{ padding: "10px 14px", borderTop: "1px solid #1a2535", color: "#c9d3e0", fontSize: 12 }}>{item.content}</div>}
        </div>
      ))}
    </div>
  );
}

interface BreadcrumbProps extends React.HTMLAttributes<HTMLDivElement> {
  items: Array<{ label: string; href?: string; onClick?: () => void }>;
}

export function Breadcrumbs({ items, style, ...props }: BreadcrumbProps) {
  return (
    <nav style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "monospace", ...style }} {...props}>
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: "#4a6070" }}>/</span>}
          <span style={{ color: item.href ? "#3b82f6" : "#64748b" }}>{item.label}</span>
        </React.Fragment>
      ))}
    </nav>
  );
}
