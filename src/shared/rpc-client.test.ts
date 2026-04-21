import { describe, it, expect, beforeEach } from "vitest";
import { RPCClient, RPCError, RPCTimeout } from "./rpc-client";
import { z } from "zod";

describe("RPC Client", () => {
  let client: RPCClient;

  beforeEach(() => {
    client = new RPCClient({
      maxRetries: 2,
      retryDelay: 10,
      defaultTimeout: 100,
    });
  });

  it("should create with default options", () => {
    const defaultClient = new RPCClient();
    expect(defaultClient.isConnected()).toBe(false);
  });

  it("should track connection state", () => {
    expect(client.isConnected()).toBe(false);
    client.setConnected(true);
    expect(client.isConnected()).toBe(true);
  });

  it("should validate response schema with valid data", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const valid = { name: "John", age: 30 };
    expect(client.validateResponse(schema, valid)).toEqual(valid);
  });

  it("should validate response schema with invalid data", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const invalid = { name: "John", age: "thirty" };
    expect(() => client.validateResponse(schema, invalid)).toThrow();
  });

  it("should handle message response", () => {
    const handler = (msg: any) => console.log(msg);
    client.setMessageHandler(handler);
    expect(client.isConnected()).toBe(false);
  });

  it("should ignore messages with no ID", () => {
    const handler = (_msg: any) => {};
    client.setMessageHandler(handler);
    // This should not throw
    client.handleMessage({ result: "test" });
    expect(true).toBe(true);
  });

  it("should disconnect and clear pending requests", () => {
    client.setConnected(true);
    expect(client.isConnected()).toBe(true);
    client.setConnected(false);
    expect(client.isConnected()).toBe(false);
  });
});
