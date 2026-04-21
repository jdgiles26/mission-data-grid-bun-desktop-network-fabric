import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Mission Data Grid",
    identifier: "com.codicealliance.mission-data-grid",
    version: "3.0.0",
    urlSchemes: ["mdg"],
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    useAsar: false,
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    views: {
      dashboard: {
        entrypoint: "src/views/dashboard/index.ts",
      },
      // Legacy views - minimal redirects to dashboard
      settings: {
        entrypoint: "src/views/settings/index.ts",
      },
      "data-grid": {
        entrypoint: "src/views/data-grid/index.ts",
      },
      topology: {
        entrypoint: "src/views/topology/index.ts",
      },
      "packet-capture": {
        entrypoint: "src/views/packet-capture/index.ts",
      },
    },
    copy: {
      "src/views/dashboard/index.html": "views/dashboard/index.html",
      "src/views/dashboard/styles.css": "views/dashboard/styles.css",
      "src/views/settings/index.html": "views/settings/index.html",
      "src/views/settings/styles.css": "views/settings/styles.css",
      "src/views/data-grid/index.html": "views/data-grid/index.html",
      "src/views/data-grid/styles.css": "views/data-grid/styles.css",
      "src/views/topology/index.html": "views/topology/index.html",
      "src/views/topology/styles.css": "views/topology/styles.css",
      "src/views/packet-capture/index.html": "views/packet-capture/index.html",
      "src/views/packet-capture/styles.css": "views/packet-capture/styles.css",
      "assets/icon.svg": "assets/icon.svg",
    },
    mac: {
      codesign: false,
      notarize: false,
      bundleCEF: false,
    },
  },
} satisfies ElectrobunConfig;
