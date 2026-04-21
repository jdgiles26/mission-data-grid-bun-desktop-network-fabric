import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../../shared/globals.css";
import { rpcClient } from "../../shared/rpc-client";

// ── Electrobun IPC bridge ─────────────────────────────────────────────────
// Wire the custom rpcClient to Electrobun's encrypted WebSocket transport.
// Must be set up BEFORE React mounts so early RPC calls are queued correctly.
import Electrobun from "electrobun/view";

// defineRPC with an open-ended schema so any bun method can be called
const viewRPC = (Electrobun.Electroview as any).defineRPC({ handlers: { requests: {} } });
new (Electrobun.Electroview as any)({ rpc: viewRPC });

rpcClient.setMessageHandler(async (msg: any) => {
  const { method, params, id } = msg;
  try {
    const result = await (viewRPC.request as any)(method, params ?? {});
    rpcClient.handleMessage({ id, result });
  } catch (err: any) {
    rpcClient.handleMessage({ id, error: { message: err?.message ?? "RPC failed", code: -1 } });
  }
});

// ── React app mount ───────────────────────────────────────────────────────
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(React.createElement(App));
}
