import React, { useEffect, useRef } from "react";

export interface ChartDataPoint {
  label: string;
  value: number;
  [key: string]: any;
}

interface LineChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: ChartDataPoint[];
  height?: number;
  yAxisLabel?: string;
  xAxisLabel?: string;
  showGrid?: boolean;
  showLegend?: boolean;
}

export const LineChart = React.forwardRef<HTMLDivElement, LineChartProps>(
  ({ data, height = 200, showGrid = true, style, ...props }, ref) => {
    const svgRef = useRef<SVGSVGElement>(null);
    useEffect(() => {
      if (!svgRef.current || data.length === 0) return;
      const w = svgRef.current.parentElement?.clientWidth || 600;
      const m = { t: 10, r: 10, b: 30, l: 40 };
      const cw = w - m.l - m.r, ch = height - m.t - m.b;
      const svg = svgRef.current;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const max = Math.max(...data.map(d => d.value));
      const min = Math.min(...data.map(d => d.value));
      const yS = (v: number) => ch - ((v - min) / (max - min || 1)) * ch;
      const xS = (i: number) => (i / (data.length - 1 || 1)) * cw;
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("transform", `translate(${m.l},${m.t})`);
      if (showGrid) for (let i = 0; i <= 4; i++) { const y = (ch / 4) * i; const l = document.createElementNS("http://www.w3.org/2000/svg", "line"); l.setAttribute("x1", "0"); l.setAttribute("y1", String(y)); l.setAttribute("x2", String(cw)); l.setAttribute("y2", String(y)); l.setAttribute("stroke", "#1a2535"); g.appendChild(l); }
      const pathD = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xS(i)},${yS(d.value)}`).join(" ");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD); path.setAttribute("fill", "none"); path.setAttribute("stroke", "#3b82f6"); path.setAttribute("stroke-width", "2");
      g.appendChild(path);
      data.forEach((d, i) => { const c = document.createElementNS("http://www.w3.org/2000/svg", "circle"); c.setAttribute("cx", String(xS(i))); c.setAttribute("cy", String(yS(d.value))); c.setAttribute("r", "3"); c.setAttribute("fill", "#3b82f6"); g.appendChild(c); });
      svg.appendChild(g);
    }, [data, height, showGrid]);
    return (<div ref={ref} style={{ width: "100%", ...style }} {...props}><svg ref={svgRef} width="100%" height={height} style={{ display: "block" }} /></div>);
  }
);
LineChart.displayName = "LineChart";

interface BarChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: ChartDataPoint[];
  height?: number;
  width?: number;
  yAxisLabel?: string;
  xAxisLabel?: string;
  showGrid?: boolean;
  colorScheme?: string;
}

export const BarChart = React.forwardRef<HTMLDivElement, BarChartProps>(
  ({ data, height = 200, style, ...props }, ref) => {
    const svgRef = useRef<SVGSVGElement>(null);
    useEffect(() => {
      if (!svgRef.current || data.length === 0) return;
      const w = svgRef.current.parentElement?.clientWidth || 600;
      const m = { t: 10, r: 10, b: 30, l: 40 };
      const cw = w - m.l - m.r, ch = height - m.t - m.b;
      const svg = svgRef.current;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const max = Math.max(...data.map(d => d.value));
      const bw = cw / data.length * 0.7;
      const gap = cw / data.length * 0.15;
      const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("transform", `translate(${m.l},${m.t})`);
      data.forEach((d, i) => { const bh = (d.value / max) * ch; const x = i * (bw + gap * 2) + gap; const r = document.createElementNS("http://www.w3.org/2000/svg", "rect"); r.setAttribute("x", String(x)); r.setAttribute("y", String(ch - bh)); r.setAttribute("width", String(bw)); r.setAttribute("height", String(bh)); r.setAttribute("fill", colors[i % colors.length]!); r.setAttribute("rx", "3"); g.appendChild(r); });
      svg.appendChild(g);
    }, [data, height]);
    return (<div ref={ref} style={{ width: "100%", ...style }} {...props}><svg ref={svgRef} width="100%" height={height} style={{ display: "block" }} /></div>);
  }
);
BarChart.displayName = "BarChart";

interface PieChartProps extends React.HTMLAttributes<HTMLDivElement> {
  data: ChartDataPoint[];
  size?: number;
  showLegend?: boolean;
  showLabels?: boolean;
}

export const PieChart = React.forwardRef<HTMLDivElement, PieChartProps>(
  ({ data, size = 180, showLegend = true, style, ...props }, ref) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
    useEffect(() => {
      if (!svgRef.current || data.length === 0) return;
      const svg = svgRef.current;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const cx = size / 2, cy = size / 2, r = size / 2 - 10;
      const total = data.reduce((s, d) => s + d.value, 0);
      let start = -Math.PI / 2;
      data.forEach((d, i) => {
        const angle = (d.value / total) * Math.PI * 2;
        const end = start + angle;
        const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
        const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("d", `M ${cx},${cy} L ${x1},${y1} A ${r},${r} 0 ${angle > Math.PI ? 1 : 0},1 ${x2},${y2} Z`);
        p.setAttribute("fill", colors[i % colors.length]!);
        p.setAttribute("stroke", "#0d1520"); p.setAttribute("stroke-width", "2");
        svg.appendChild(p);
        start = end;
      });
    }, [data, size]);
    return (
      <div ref={ref} style={{ display: "flex", alignItems: "center", gap: 16, ...style }} {...props}>
        <svg ref={svgRef} width={size} height={size} style={{ display: "block" }} />
        {showLegend && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data.map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: "monospace" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: colors[i % colors.length], flexShrink: 0 }} />
                <span style={{ color: "#94a3b8" }}>{d.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);
PieChart.displayName = "PieChart";
