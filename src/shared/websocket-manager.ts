/**
 * WebSocket Manager - Real-time data streaming for mission-critical operations
 * Handles auto-reconnect, channel subscriptions, heartbeat, and message queuing
 */

type MessageHandler = (data: any) => void;
type ConnectionHandler = (connected: boolean) => void;

interface QueuedMessage {
  type: string;
  payload: any;
  timestamp: number;
}

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private subscriptions: Map<string, Set<MessageHandler>> = new Map();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private messageQueue: QueuedMessage[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timer | null = null;
  private connected = false;

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  /**
   * Establish WebSocket connection with error handling
   */
  private connect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.notifyConnectionHandlers(true);
        this.processMessageQueue();
        this.startHeartbeat();
        console.log('[WebSocket] Connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { channel, data } = message;

          if (channel && this.subscriptions.has(channel)) {
            const handlers = this.subscriptions.get(channel)!;
            handlers.forEach(handler => handler(data));
          }
        } catch (error) {
          console.error('[WebSocket] Message parse error:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.stopHeartbeat();
        this.notifyConnectionHandlers(false);
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('[WebSocket] Connection failed:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Keep-alive heartbeat mechanism
   */
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.connected && this.ws) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // 30 second interval
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Subscribe to a channel with callback handler
   */
  public subscribe(channel: string, handler: MessageHandler) {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(handler);

    if (this.connected && this.ws) {
      this.ws.send(JSON.stringify({ type: 'subscribe', channel }));
    }

    return () => this.unsubscribe(channel, handler);
  }

  /**
   * Unsubscribe from a channel
   */
  public unsubscribe(channel: string, handler: MessageHandler) {
    if (this.subscriptions.has(channel)) {
      this.subscriptions.get(channel)!.delete(handler);
      if (this.subscriptions.get(channel)!.size === 0) {
        this.subscriptions.delete(channel);
        if (this.connected && this.ws) {
          this.ws.send(JSON.stringify({ type: 'unsubscribe', channel }));
        }
      }
    }
  }

  /**
   * Send a message to the backend
   */
  public send(type: string, payload: any) {
    const message: QueuedMessage = { type, payload, timestamp: Date.now() };
    
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.messageQueue.push(message);
    }
  }

  /**
   * Process queued messages when connection restores
   */
  private processMessageQueue() {
    while (this.messageQueue.length > 0 && this.connected && this.ws) {
      const message = this.messageQueue.shift()!;
      if (Date.now() - message.timestamp < 60000) { // 1 minute expiry
        this.ws.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Register connection status handler
   */
  public onConnectionChange(handler: ConnectionHandler) {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  /**
   * Notify all connection handlers
   */
  private notifyConnectionHandlers(connected: boolean) {
    this.connectionHandlers.forEach(handler => handler(connected));
  }

  /**
   * Get current connection status
   */
  public isConnected(): boolean {
    return this.connected;
  }

  /**
   * Graceful shutdown
   */
  public disconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

// Singleton instance
let wsInstance: WebSocketManager | null = null;

export function getWebSocketManager(): WebSocketManager {
  if (!wsInstance) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    wsInstance = new WebSocketManager(url);
  }
  return wsInstance;
}
