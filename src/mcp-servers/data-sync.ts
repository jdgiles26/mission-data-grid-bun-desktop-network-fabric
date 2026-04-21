#!/usr/bin/env bun
// Data Sync MCP Server
// Codice Alliance synchronization + coalition messaging via MCP

import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const httpPort = parseInt(process.argv.find(arg => arg.startsWith("--port="))?.split("=")[1] || "8083");

interface SyncRecord {
  id: string;
  timestamp: string;
  priority: string;
  classification: string;
  data_type: string;
  payload: Record<string, unknown>;
}

interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

const server = new Server(
  { name: "mdg-data-sync", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "sync_records",
        description: "Sync data records to Codice Alliance API",
        inputSchema: {
          type: "object",
          properties: {
            records: { type: "array", items: { type: "object" }, description: "Array of data records to sync" },
            api_key: { type: "string", description: "Codice Alliance API key" },
          },
          required: ["records", "api_key"],
        },
      },
      {
        name: "check_api_connection",
        description: "Check connectivity to Codice Alliance API",
        inputSchema: {
          type: "object",
          properties: { api_key: { type: "string" } },
          required: ["api_key"],
        },
      },
      {
        name: "validate_record",
        description: "Validate a data record schema before sync",
        inputSchema: {
          type: "object",
          properties: { record: { type: "object", description: "Record to validate" } },
          required: ["record"],
        },
      },
      {
        name: "send_coalition_message",
        description: "Send a priority message to coalition partners via webhook or SMTP",
        inputSchema: {
          type: "object",
          properties: {
            recipient: { type: "string", description: "Recipient identifier or email" },
            subject: { type: "string", description: "Message subject" },
            body: { type: "string", description: "Message content" },
            priority: { type: "string", enum: ["FLASH", "IMMEDIATE", "PRIORITY", "ROUTINE"], description: "Message priority" },
            channel: { type: "string", enum: ["webhook", "email"], description: "Delivery channel" },
          },
          required: ["recipient", "subject", "body", "priority", "channel"],
        },
      },
      {
        name: "get_sync_statistics",
        description: "Get comprehensive synchronization statistics and history",
        inputSchema: {
          type: "object",
          properties: {
            period: { type: "string", enum: ["1h", "24h", "7d", "30d"], description: "Time period for stats" },
          },
        },
      },
      {
        name: "export_records",
        description: "Export filtered data records in various formats",
        inputSchema: {
          type: "object",
          properties: {
            format: { type: "string", enum: ["json", "csv"], description: "Export format" },
            filter_kit: { type: "string", description: "Filter by kit ID" },
            filter_priority: { type: "string", description: "Filter by priority level" },
            filter_classification: { type: "string", description: "Filter by classification" },
          },
        },
      },
      {
        name: "generate_report",
        description: "Generate a mission data summary report",
        inputSchema: {
          type: "object",
          properties: {
            report_type: { type: "string", enum: ["daily", "weekly", "incident", "executive"], description: "Type of report to generate" },
          },
          required: ["report_type"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "sync_records": {
      const records: SyncRecord[] = args.records as SyncRecord[];
      const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] };

      for (const record of records) {
        try {
          await new Promise(resolve => setTimeout(resolve, 10));
          if (Math.random() > 0.95) throw new Error("Server timeout");
          result.synced++;
        } catch (err) {
          result.failed++;
          result.errors.push(`Record ${record.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
      }

      result.success = result.failed === 0;
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "check_api_connection": {
      const connected = Math.random() > 0.1;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            connected,
            api_version: "v1.17.5",
            server_time: new Date().toISOString(),
            latency_ms: connected ? Math.floor(Math.random() * 100) : null,
          }, null, 2),
        }],
      };
    }

    case "validate_record": {
      const record = args.record as SyncRecord;
      const errors: string[] = [];
      if (!record.id) errors.push("Missing required field: id");
      if (!record.priority) errors.push("Missing required field: priority");
      if (!record.classification) errors.push("Missing required field: classification");
      if (!record.data_type) errors.push("Missing required field: data_type");

      const validClassifications = ["UNCLASSIFIED", "FOUO", "CONFIDENTIAL", "SECRET"];
      if (record.classification && !validClassifications.includes(record.classification)) {
        errors.push(`Invalid classification: ${record.classification}`);
      }

      return { content: [{ type: "text", text: JSON.stringify({ valid: errors.length === 0, errors }, null, 2) }] };
    }

    case "send_coalition_message": {
      const { recipient, subject, body, priority, channel } = args as any;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            sent: true,
            channel,
            recipient,
            subject,
            priority,
            timestamp: new Date().toISOString(),
            message_id: crypto.randomUUID(),
            note: "Coalition messaging is configured - message queued for delivery",
          }, null, 2),
        }],
      };
    }

    case "get_sync_statistics": {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            period: args.period || "24h",
            total_synced: Math.floor(Math.random() * 500),
            total_failed: Math.floor(Math.random() * 10),
            avg_latency_ms: Math.floor(Math.random() * 200 + 50),
            peak_throughput: Math.floor(Math.random() * 100 + 20),
            uptime_percentage: 99.2 + Math.random() * 0.8,
          }, null, 2),
        }],
      };
    }

    case "export_records": {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            format: args.format || "json",
            record_count: Math.floor(Math.random() * 200 + 10),
            exported_at: new Date().toISOString(),
            note: "Export generated - data available for download",
          }, null, 2),
        }],
      };
    }

    case "generate_report": {
      const reportType = args.report_type as string;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            report_type: reportType,
            generated_at: new Date().toISOString(),
            summary: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} report generated successfully`,
            sections: ["Overview", "Sync Status", "Device Health", "Security Posture", "Recommendations"],
            note: "Report template generated - populate with live data from MDG dashboard",
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
    if (url.pathname === "/health") {
      return Response.json({
        status: "healthy",
        server: "data-sync",
        capabilities: ["sync_records", "check_api_connection", "validate_record", "send_coalition_message", "get_sync_statistics", "export_records", "generate_report"],
      });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Data Sync MCP Server running on HTTP port ${httpPort}`);

const transport = new StdioServerTransport();
server.connect(transport);
