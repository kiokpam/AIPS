/**
 * Centralized WebSocket Manager
 * 
 * Manages WebSocket connections across the application to prevent
 * connection recreation on every page navigation.
 */

type MessageHandler = (data: any) => void;
type ErrorHandler = (error: Event) => void;
type CloseHandler = () => void;

interface WebSocketConfig {
  url: string;
  onMessage?: MessageHandler;
  onError?: ErrorHandler;
  onClose?: CloseHandler;
  reconnect?: boolean;
  reconnectDelay?: number;
}

class WebSocketManager {
  private connections: Map<string, WebSocket> = new Map();
  private handlers: Map<string, {
    onMessage?: MessageHandler;
    onError?: ErrorHandler;
    onClose?: CloseHandler;
  }> = new Map();
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private reconnectConfig: Map<string, { enabled: boolean; delay: number }> = new Map();

  /**
   * Get or create a WebSocket connection
   */
  getConnection(config: WebSocketConfig): WebSocket | null {
    const { url, onMessage, onError, onClose, reconnect = false, reconnectDelay = 3000 } = config;

    // Return existing connection if available and open
    const existing = this.connections.get(url);
    if (existing && existing.readyState === WebSocket.OPEN) {
      // Update handlers if provided
      if (onMessage || onError || onClose) {
        this.handlers.set(url, { onMessage, onError, onClose });
      }
      return existing;
    }

    // Close existing connection if it exists but is not open
    if (existing) {
      existing.close();
      this.connections.delete(url);
    }

    try {
      const ws = new WebSocket(url);

      // Store handlers
      this.handlers.set(url, { onMessage, onError, onClose });
      this.reconnectConfig.set(url, { enabled: reconnect, delay: reconnectDelay });

      // Set up event handlers
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const handlers = this.handlers.get(url);
          if (handlers?.onMessage) {
            handlers.onMessage(data);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        const handlers = this.handlers.get(url);
        if (handlers?.onError) {
          handlers.onError(error);
        } else {
          console.error('WebSocket error:', error);
        }
      };

      ws.onclose = () => {
        const handlers = this.handlers.get(url);
        if (handlers?.onClose) {
          handlers.onClose();
        }

        // Handle reconnection if enabled
        const reconnectCfg = this.reconnectConfig.get(url);
        if (reconnectCfg?.enabled) {
          // Clear any existing reconnect timer
          const existingTimer = this.reconnectTimers.get(url);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          // Schedule reconnection
          const timer = setTimeout(() => {
            this.reconnectTimers.delete(url);
            // Reconnect by creating new connection
            this.getConnection(config);
          }, reconnectCfg.delay);
          this.reconnectTimers.set(url, timer);
        } else {
          // Clean up if not reconnecting
          this.connections.delete(url);
          this.handlers.delete(url);
        }
      };

      ws.onopen = () => {
        // Clear any reconnect timer on successful connection
        const timer = this.reconnectTimers.get(url);
        if (timer) {
          clearTimeout(timer);
          this.reconnectTimers.delete(url);
        }
      };

      this.connections.set(url, ws);
      return ws;
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      return null;
    }
  }

  /**
   * Update handlers for an existing connection
   */
  updateHandlers(url: string, handlers: {
    onMessage?: MessageHandler;
    onError?: ErrorHandler;
    onClose?: CloseHandler;
  }) {
    const existing = this.handlers.get(url);
    if (existing) {
      this.handlers.set(url, { ...existing, ...handlers });
    }
  }

  /**
   * Close a specific connection
   */
  closeConnection(url: string) {
    const timer = this.reconnectTimers.get(url);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(url);
    }

    const ws = this.connections.get(url);
    if (ws) {
      ws.close();
      this.connections.delete(url);
      this.handlers.delete(url);
      this.reconnectConfig.delete(url);
    }
  }

  /**
   * Remove handlers for a connection and optionally close it.
   * If no handlers remain, the connection is closed and cleaned up.
   */
  removeListener(url: string, onMessage?: MessageHandler) {
    const handlers = this.handlers.get(url);

    // If a specific handler is provided, only remove it when it matches
    if (handlers && onMessage && handlers.onMessage === onMessage) {
      this.handlers.delete(url);
    } else if (!onMessage) {
      // If no specific handler given, remove all handlers
      this.handlers.delete(url);
    }

    // If no handlers remain for this URL, close and clean up the connection
    if (!this.handlers.has(url)) {
      const timer = this.reconnectTimers.get(url);
      if (timer) {
        clearTimeout(timer);
        this.reconnectTimers.delete(url);
      }

      const ws = this.connections.get(url);
      if (ws) {
        ws.close();
        this.connections.delete(url);
      }

      this.reconnectConfig.delete(url);
    }
  }

  /**
   * Close all connections
   */
  closeAll() {
    this.connections.forEach((ws, url) => {
      ws.close();
    });
    this.connections.clear();
    this.handlers.clear();
    this.reconnectConfig.clear();
    this.reconnectTimers.forEach(timer => clearTimeout(timer));
    this.reconnectTimers.clear();
  }

  /**
   * Check if a connection exists and is open
   */
  isConnected(url: string): boolean {
    const ws = this.connections.get(url);
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();

// Clean up on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    wsManager.closeAll();
  });
}

