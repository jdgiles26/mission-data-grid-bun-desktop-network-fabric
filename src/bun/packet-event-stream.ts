// Real-time Packet Event Streaming
// Provides live event streaming from packet capture to UI

import type { PacketCaptureService, CaptureEvent } from "./packet-capture-service";

export type EventStreamHandler = (event: CaptureEvent) => void;

export interface EventStreamConfig {
  bufferSize: number;
  batchIntervalMs: number;
  maxClients: number;
}

export class PacketEventStream {
  private handlers: Set<EventStreamHandler> = new Set();
  private eventBuffer: CaptureEvent[] = [];
  private flushInterval: Timer | null = null;
  private config: EventStreamConfig;
  private unsubscribeFn: (() => void) | null = null;

  constructor(
    private captureService: PacketCaptureService,
    config: Partial<EventStreamConfig> = {}
  ) {
    this.config = {
      bufferSize: 100,
      batchIntervalMs: 100,
      maxClients: 10,
      ...config,
    };
  }

  start(): void {
    if (this.unsubscribeFn) return;

    // Subscribe to all event types from capture service
    this.unsubscribeFn = this.captureService.subscribe("stats", (event) => {
      this.handleEvent(event);
    });

    this.captureService.subscribe("packet", (event) => {
      this.handleEvent(event);
    });

    this.captureService.subscribe("dns_query", (event) => {
      this.handleEvent(event);
    });

    this.captureService.subscribe("http_request", (event) => {
      this.handleEvent(event);
    });

    this.captureService.subscribe("tls_handshake", (event) => {
      this.handleEvent(event);
    });

    this.captureService.subscribe("anomaly", (event) => {
      this.handleEvent(event);
    });

    this.captureService.subscribe("flow_start", (event) => {
      this.handleEvent(event);
    });

    this.captureService.subscribe("flow_end", (event) => {
      this.handleEvent(event);
    });

    // Start flush interval
    this.flushInterval = setInterval(() => {
      this.flushBuffer();
    }, this.config.batchIntervalMs);
  }

  stop(): void {
    if (this.unsubscribeFn) {
      this.unsubscribeFn();
      this.unsubscribeFn = null;
    }

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    this.flushBuffer();
  }

  subscribe(handler: EventStreamHandler): () => void {
    if (this.handlers.size >= this.config.maxClients) {
      throw new Error("Max event stream clients reached");
    }

    this.handlers.add(handler);

    return () => {
      this.handlers.delete(handler);
    };
  }

  getBufferedEvents(count = 100): CaptureEvent[] {
    return this.eventBuffer.slice(-count);
  }

  clearBuffer(): void {
    this.eventBuffer = [];
  }

  private handleEvent(event: CaptureEvent): void {
    this.eventBuffer.push(event);

    if (this.eventBuffer.length >= this.config.bufferSize) {
      this.flushBuffer();
    }
  }

  private flushBuffer(): void {
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    for (const handler of this.handlers) {
      try {
        for (const event of events) {
          handler(event);
        }
      } catch (error) {
        console.error("Event stream handler error:", error);
      }
    }
  }
}

export function createPacketEventStream(
  captureService: PacketCaptureService,
  config?: Partial<EventStreamConfig>
): PacketEventStream {
  return new PacketEventStream(captureService, config);
}
