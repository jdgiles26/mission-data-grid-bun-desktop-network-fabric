#!/usr/bin/env bun
// Device Monitor MCP Server
// NetClaw-style network device monitoring + security scanning via MCP

import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const httpPort = parseInt(process.argv.find(arg => arg.startsWith("--port="))?.split("=")[1] || "8081");

interface NetworkDevice {
  id: string;
  hostname: string;
  ip: string;
  platform: string;
  role: string;
  status: string;
  metrics: {
    cpu: number;
    memory: number;
    uptime: number;
    interfacesUp: number;
    interfacesDown: number;
    bgpPeers: number;
    ospfNeighbors: number;
  };
  lastChecked: string;
}

const devices: NetworkDevice[] = [
  { id: "router-01", hostname: "hq-core-01", ip: "10.0.0.1", platform: "IOS-XE", role: "CORE", status: "HEALTHY", metrics: { cpu: 45, memory: 62, uptime: 86400 * 30, interfacesUp: 24, interfacesDown: 0, bgpPeers: 4, ospfNeighbors: 6 }, lastChecked: new Date().toISOString() },
  { id: "router-02", hostname: "m01-k01-edge", ip: "10.1.1.1", platform: "IOS-XR", role: "EDGE", status: "HEALTHY", metrics: { cpu: 32, memory: 45, uptime: 86400 * 7, interfacesUp: 12, interfacesDown: 0, bgpPeers: 2, ospfNeighbors: 3 }, lastChecked: new Date().toISOString() },
  { id: "firewall-01", hostname: "hq-fw-01", ip: "10.0.0.5", platform: "ASA", role: "FIREWALL", status: "WARNING", metrics: { cpu: 78, memory: 82, uptime: 86400 * 60, interfacesUp: 8, interfacesDown: 0, bgpPeers: 0, ospfNeighbors: 0 }, lastChecked: new Date().toISOString() },
  { id: "switch-01", hostname: "m01-k01-dist", ip: "10.1.1.10", platform: "NX-OS", role: "DISTRIBUTION", status: "HEALTHY", metrics: { cpu: 25, memory: 40, uptime: 86400 * 45, interfacesUp: 48, interfacesDown: 2, bgpPeers: 0, ospfNeighbors: 8 }, lastChecked: new Date().toISOString() },
];

const server = new Server(
  { name: "mdg-device-monitor", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      { name: "list_devices", description: "List all monitored network devices with metrics", inputSchema: { type: "object", properties: {} } },
      {
        name: "get_device_status", description: "Get detailed status of a specific device",
        inputSchema: { type: "object", properties: { device_id: { type: "string" } }, required: ["device_id"] },
      },
      {
        name: "check_device_health", description: "Run comprehensive health check on a device",
        inputSchema: { type: "object", properties: { device_id: { type: "string" } }, required: ["device_id"] },
      },
      {
        name: "run_security_audit", description: "Run a security audit on a specific device checking for vulnerabilities, open ports, and suspicious activity",
        inputSchema: { type: "object", properties: { device_id: { type: "string" } }, required: ["device_id"] },
      },
      {
        name: "get_interface_details", description: "Get detailed interface information for a device including traffic stats",
        inputSchema: { type: "object", properties: { device_id: { type: "string" } }, required: ["device_id"] },
      },
      {
        name: "get_routing_table", description: "Get BGP/OSPF routing table summary for a device",
        inputSchema: { type: "object", properties: { device_id: { type: "string" } }, required: ["device_id"] },
      },
      {
        name: "monitor_bandwidth", description: "Get real-time bandwidth utilization across all monitored interfaces",
        inputSchema: { type: "object", properties: { duration_seconds: { type: "number", description: "Monitoring duration" } } },
      },
      { name: "get_network_summary", description: "Get high-level network health summary across all devices", inputSchema: { type: "object", properties: {} } },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "list_devices":
      return { content: [{ type: "text", text: JSON.stringify(devices, null, 2) }] };

    case "get_device_status": {
      const device = devices.find(d => d.id === args.device_id);
      if (!device) return { content: [{ type: "text", text: `Device ${args.device_id} not found` }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(device, null, 2) }] };
    }

    case "check_device_health": {
      const target = devices.find(d => d.id === args.device_id);
      if (!target) return { content: [{ type: "text", text: `Device ${args.device_id} not found` }], isError: true };
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            device_id: target.id,
            cpu_status: target.metrics.cpu > 80 ? "WARNING" : "OK",
            memory_status: target.metrics.memory > 80 ? "WARNING" : "OK",
            interface_status: target.metrics.interfacesDown > 0 ? "DEGRADED" : "OK",
            uptime_days: Math.floor(target.metrics.uptime / 86400),
            overall: target.status,
            recommendations: target.metrics.cpu > 70 ? ["Consider load balancing or scaling"] : [],
          }, null, 2),
        }],
      };
    }

    case "run_security_audit": {
      const target = devices.find(d => d.id === args.device_id);
      if (!target) return { content: [{ type: "text", text: `Device ${args.device_id} not found` }], isError: true };
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            device_id: target.id,
            hostname: target.hostname,
            scan_timestamp: new Date().toISOString(),
            findings: [
              ...(target.metrics.cpu > 80 ? [{ severity: "MEDIUM", finding: "High CPU may indicate crypto-mining or DoS", recommendation: "Review running processes" }] : []),
              ...(target.metrics.memory > 85 ? [{ severity: "MEDIUM", finding: "High memory usage - potential memory leak", recommendation: "Monitor for memory leak patterns" }] : []),
              ...(target.role === "EDGE" && target.metrics.bgpPeers === 0 ? [{ severity: "HIGH", finding: "Edge device with no BGP peers - routing isolation risk", recommendation: "Verify BGP configuration" }] : []),
              { severity: "INFO", finding: "SSH service detected on port 22", recommendation: "Ensure key-based auth is enabled" },
            ],
            risk_score: Math.max(0, 100 - (target.metrics.cpu > 80 ? 15 : 0) - (target.metrics.memory > 85 ? 10 : 0)),
            compliant: target.metrics.cpu < 80 && target.metrics.memory < 85,
          }, null, 2),
        }],
      };
    }

    case "get_interface_details": {
      const target = devices.find(d => d.id === args.device_id);
      if (!target) return { content: [{ type: "text", text: `Device ${args.device_id} not found` }], isError: true };
      const interfaces = Array.from({ length: target.metrics.interfacesUp }, (_, i) => ({
        name: `eth${i}`,
        status: "up",
        speed: i === 0 ? "10Gbps" : "1Gbps",
        rx_bytes: Math.floor(Math.random() * 1e9),
        tx_bytes: Math.floor(Math.random() * 1e9),
        errors: 0,
        drops: Math.floor(Math.random() * 5),
      }));
      return { content: [{ type: "text", text: JSON.stringify({ device_id: target.id, interfaces }, null, 2) }] };
    }

    case "get_routing_table": {
      const target = devices.find(d => d.id === args.device_id);
      if (!target) return { content: [{ type: "text", text: `Device ${args.device_id} not found` }], isError: true };
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            device_id: target.id,
            bgp_peers: target.metrics.bgpPeers,
            ospf_neighbors: target.metrics.ospfNeighbors,
            total_routes: Math.floor(Math.random() * 500 + 50),
            bgp_routes: Math.floor(Math.random() * 200),
            ospf_routes: Math.floor(Math.random() * 100),
            static_routes: Math.floor(Math.random() * 20),
          }, null, 2),
        }],
      };
    }

    case "monitor_bandwidth": {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            timestamp: new Date().toISOString(),
            duration_seconds: args.duration_seconds || 5,
            total_rx_mbps: Math.floor(Math.random() * 5000),
            total_tx_mbps: Math.floor(Math.random() * 3000),
            peak_rx_mbps: Math.floor(Math.random() * 8000),
            peak_tx_mbps: Math.floor(Math.random() * 5000),
            utilization_percent: Math.floor(Math.random() * 40 + 10),
          }, null, 2),
        }],
      };
    }

    case "get_network_summary": {
      const healthy = devices.filter(d => d.status === "HEALTHY").length;
      const warning = devices.filter(d => d.status === "WARNING").length;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            total_devices: devices.length,
            healthy,
            warning,
            critical: devices.length - healthy - warning,
            avg_cpu: Math.round(devices.reduce((sum, d) => sum + d.metrics.cpu, 0) / devices.length),
            avg_memory: Math.round(devices.reduce((sum, d) => sum + d.metrics.memory, 0) / devices.length),
            total_interfaces_up: devices.reduce((sum, d) => sum + d.metrics.interfacesUp, 0),
            total_interfaces_down: devices.reduce((sum, d) => sum + d.metrics.interfacesDown, 0),
          }, null, 2),
        }],
      };
    }

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }
});

const httpServer = Bun.serve({
  port: httpPort,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/devices") return Response.json(devices);
    if (url.pathname.startsWith("/devices/")) {
      const deviceId = url.pathname.split("/")[2];
      const device = devices.find(d => d.id === deviceId);
      if (device) return Response.json(device);
      return new Response("Not found", { status: 404 });
    }
    if (url.pathname === "/health") return Response.json({ status: "healthy", server: "device-monitor" });
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Device Monitor MCP Server running on HTTP port ${httpPort}`);
const transport = new StdioServerTransport();
server.connect(transport);
