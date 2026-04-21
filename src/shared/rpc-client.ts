import { z } from "zod";

export interface RPCRequest {
  method: string;
  params: any;
  id: string;
  timeout?: number;
}

export interface RPCResponse {
  id: string;
  result?: any;
  error?: {
    message: string;
    code: number;
    details?: any;
  };
}

export class RPCError extends Error {
  constructor(
    public code: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = "RPCError";
  }
}

export class RPCTimeout extends Error {
  constructor(method: string, timeout: number) {
    super(`RPC method '${method}' timed out after ${timeout}ms`);
    this.name = "RPCTimeout";
  }
}

interface RPCClientOptions {
  maxRetries?: number;
  retryDelay?: number;
  defaultTimeout?: number;
}

export class RPCClient {
  private messageId = 0;
  private pendingRequests = new Map<string, any>();
  private retryCount = new Map<string, number>();
  private options: Required<RPCClientOptions>;
  private connected = false;
  private messageHandler: ((msg: any) => void) | null = null;

  constructor(options: RPCClientOptions = {}) {
    this.options = {
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      defaultTimeout: options.defaultTimeout ?? 30000,
    };
  }

  setMessageHandler(handler: (msg: any) => void) {
    this.messageHandler = handler;
  }

  handleMessage(msg: any) {
    if (!msg.id) return;

    const pending = this.pendingRequests.get(msg.id);
    if (!pending) return;

    if (msg.error) {
      pending.reject(new RPCError(msg.error.code || -1, msg.error.message, msg.error.details));
    } else {
      pending.resolve(msg.result);
    }

    this.pendingRequests.delete(msg.id);
    this.retryCount.delete(msg.id);
  }

  private async sendRequest(method: string, params: any, requestId: string, timeout: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new RPCTimeout(method, timeout));
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve: (result: any) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      try {
        if (this.messageHandler) {
          this.messageHandler({ method, params, id: requestId });
        }
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async call<T = any>(
    method: string,
    params: any = {},
    options: { timeout?: number; noRetry?: boolean } = {}
  ): Promise<T> {
    const requestId = `req-${++this.messageId}-${Date.now()}`;
    const timeout = options.timeout ?? this.options.defaultTimeout;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        if (attempt > 0 && !options.noRetry) {
          const delay = this.options.retryDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        return await this.sendRequest(method, params, requestId, timeout);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on timeout or validation errors
        if (lastError instanceof RPCTimeout || lastError.message.includes("validation")) {
          throw lastError;
        }

        if (attempt === this.options.maxRetries) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error("RPC call failed");
  }

  validateResponse<T>(schema: z.ZodSchema<T>, data: any): T {
    try {
      return schema.parse(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Response validation failed: ${error.errors.map((e) => e.message).join(", ")}`);
      }
      throw error;
    }
  }

  setConnected(connected: boolean) {
    this.connected = connected;
    if (!connected) {
      for (const pending of this.pendingRequests.values()) {
        pending.reject(new Error("RPC connection lost"));
      }
      this.pendingRequests.clear();
    }
  }

  isConnected() {
    return this.connected;
  }
}

export const rpcClient = new RPCClient({
  maxRetries: 3,
  retryDelay: 500,
  defaultTimeout: 30000,
});
