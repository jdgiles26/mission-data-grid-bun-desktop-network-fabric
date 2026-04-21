declare module "@modelcontextprotocol/sdk" {
  export * from "@modelcontextprotocol/sdk/dist/esm/index";
}

declare module "@modelcontextprotocol/sdk/server" {
  export { Server } from "@modelcontextprotocol/sdk/dist/esm/server/index";
}

declare module "@modelcontextprotocol/sdk/server/stdio" {
  export { StdioServerTransport } from "@modelcontextprotocol/sdk/dist/esm/server/stdio";
}
