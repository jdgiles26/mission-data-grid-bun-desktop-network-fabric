#!/usr/bin/env bun
// Mesh Status MCP Server
// AutoNet-style mesh connectivity monitoring + path analysis

import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const httpPort = parseInt(process.argv.find(arg => arg.startsWith("--port="))?.split("=")[1] || "8082");

type MeshState = "FULL" | "PARTIAL_WAN" | "HQ_CONTROLLER_LOSS" | "KIT_TO_KIT_LOSS" | "FULL_ISOLATION";

interface MeshStatus {
  state: MeshState;
  connected: boolean;
  peers: number;
  hq_reachable: boolean;
  local_controller_active: boolean;
  kit_to_kit_links: number;
}

let currentStatus: MeshStatus = {
  state: "FULL",
  connected: true,
  peers: 3,
  hq_reachable: true,
  local_controller_active: true,
  kit_to_kit_links: 2,
};

const server = new Server(
  { name: "mdg-mesh-status", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      { name: "get_mesh_status", description: "Get current mesh connectivity status including state, peers, and controller health", inputSchema: { type: "object", properties: {} } },
      {
        name: "check_kit_connectivity", description: "Check connectivity and latency to a specific mission kit",
        inputSchema: { type: "object", properties: { kit_id: { type: "string", description: "Kit identifier (e.g., m01-k01)" } }, required: ["kit_id"] },
      },
      {
        name: "trace_path", description: "Trace network path to a destination showing each hop with latency",
        inputSchema: { type: "object", properties: { destination: { type: "string", description: "IP or hostname" } }, required: ["destination"] },
      },
      {
        name: "get_tunnel_status", description: "Get WireGuard tunnel status for all inter-kit connections",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_bgp_summary", description: "Get BGP peering summary across the mesh including AS paths and route counts",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "analyze_mesh_health", description: "Run comprehensive mesh health analysis with recommendations",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_latency_matrix", description: "Get latency measurements between all kit pairs",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "get_mesh_status": {
      if (Math.random() > 0.9) {
        const states: MeshState[] = ["FULL", "PARTIAL_WAN", "HQ_CONTROLLER_LOSS", "FULL_ISOLATION"];
        currentStatus.state = states[Math.floor(Math.random() * states.length)];
        currentStatus.connected = currentStatus.state !== "FULL_ISOLATION";
      }
      return { content: [{ type: "text", text: JSON.stringify(currentStatus, null, 2) }] };
    }

    case "check_kit_connectivity": {
      const kitReachable = Math.random() > 0.2;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            kit_id: args.kit_id,
            reachable: kitReachable,
            latency_ms: kitReachable ? Math.floor(Math.random() * 50 + 10) : null,
            packet_loss_percent: kitReachable ? Math.floor(Math.random() * 3) : 100,
            last_seen: new Date().toISOString(),
            tunnel_status: kitReachable ? "ESTABLISHED" : "DOWN",
          }, null, 2),
        }],
      };
    }

    case "trace_path": {
      const hops = [
        { hop: 1, host: "local-router", ip: "10.1.1.1", latency: 1, status: "OK" },
        { hop: 2, host: "m01-k01-edge", ip: "10.1.1.1", latency: 2, status: "OK" },
        { hop: 3, host: "wg-tunnel-01", ip: "10.255.1.1", latency: 15, status: "OK" },
        { hop: 4, host: "hq-gateway", ip: "10.255.0.1", latency: 45, status: "OK" },
        { hop: 5, host: args.destination, ip: "10.0.0.100", latency: 48, status: "OK" },
      ];
      return { content: [{ type: "text", text: JSON.stringify({ destination: args.destination, hops, total_latency_ms: 48, path_mtu: 1420 }, null, 2) }] };
    }

    case "get_tunnel_status": {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            tunnels: [
              { name: "wg-hq", endpoint: "10.255.0.1:51820", status: "ESTABLISHED", tx_bytes: 1024000, rx_bytes: 2048000, last_handshake: new Date(Date.now() - 30000).toISOString() },
              { name: "wg-k02", endpoint: "10.255.1.2:51820", status: "ESTABLISHED", tx_bytes: 512000, rx_bytes: 768000, last_handshake: new Date(Date.now() - 60000).toISOString() },
              { name: "wg-k03", endpoint: "STAGED", status: "PENDING", tx_bytes: 0, rx_bytes: 0, last_handshake: null },
            ],
            total_active: 2,
            total_pending: 1,
          }, null, 2),
        }],
      };
    }

    case "get_bgp_summary": {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            local_as: 4200001001,
            router_id: "10.1.1.1",
            peers: [
              { neighbor: "10.255.0.1", remote_as: 4259840000, state: "ESTABLISHED", prefixes_received: 45, uptime: "3d 12h" },
              { neighbor: "10.255.1.2", remote_as: 4200001002, state: "ESTABLISHED", prefixes_received: 12, uptime: "1d 6h" },
            ],
            total_routes: 57,
            best_routes: 52,
          }, null, 2),
        }],
      };
    }

    case "analyze_mesh_health": {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            overall_health: currentStatus.state === "FULL" ? "EXCELLENT" : currentStatus.state === "PARTIAL_WAN" ? "DEGRADED" : "CRITICAL",
            mesh_state: currentStatus.state,
            analysis: {
              connectivity: currentStatus.connected ? "All paths operational" : "Network isolation detected",
              tunnel_health: "WireGuard tunnels active with acceptable handshake intervals",
              routing_health: "BGP sessions established, no route flapping detected",
              latency_health: "Inter-kit latency within acceptable thresholds",
            },
            recommendations: [
              ...(currentStatus.state !== "FULL" ? ["Investigate WAN connectivity to restore full mesh"] : []),
              "Schedule periodic tunnel key rotation",
              "Monitor BGP route counts for anomalies",
              "Verify Ziti controller replication is healthy",
            ],
            score: currentStatus.state === "FULL" ? 95 : currentStatus.state === "PARTIAL_WAN" ? 70 : 30,
          }, null, 2),
        }],
      };
    }

    case "get_latency_matrix": {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            matrix: [
              { from: "k01", to: "hq", latency_ms: 45, jitter_ms: 3, packet_loss: 0 },
              { from: "k01", to: "k02", latency_ms: 28, jitter_ms: 2, packet_loss: 0 },
              { from: "k02", to: "hq", latency_ms: 52, jitter_ms: 5, packet_loss: 0.1 },
            ],
            measured_at: new Date().toISOString(),
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
    if (url.pathname === "/status") {
      return Response.json({ connected: currentStatus.connected, peers: currentStatus.peers, state: currentStatus.state });
    }
    if (url.pathname === "/health") return Response.json({ status: "healthy", server: "mesh-status" });
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Mesh Status MCP Server running on HTTP port ${httpPort}`);
const transport = new StdioServerTransport();
server.connect(transport);
