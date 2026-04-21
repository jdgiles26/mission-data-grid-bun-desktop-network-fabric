import React from "react";
import { createRoot } from "react-dom/client";
import { PacketCapture } from "./PacketCapture";
import "../../shared/globals.css";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(React.createElement(PacketCapture));
}
