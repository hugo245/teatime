import { AppState } from 'react-native';
import { create } from 'zustand';
import { socketUrl } from './config';

export type ServerMessage = { type: string; [key: string]: unknown };
type Handler = (message: ServerMessage) => void;
type CloseHandler = (reason: 'unauthorized' | 'banned' | 'replaced' | 'deleted') => void;

type ConnectionState = {
  status: 'offline' | 'connecting' | 'online';
  online: number;
};

export const useConnection = create<ConnectionState>(() => ({ status: 'offline', online: 0 }));

const handlers = new Set<Handler>();
let closeHandler: CloseHandler | null = null;
let socket: WebSocket | null = null;
let token: string | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove(): void } | null = null;

function setStatus(status: ConnectionState['status']) {
  if (useConnection.getState().status !== status) useConnection.setState({ status });
}

function clearTimers() {
  if (retryTimer) clearTimeout(retryTimer);
  if (pingTimer) clearInterval(pingTimer);
  retryTimer = null;
  pingTimer = null;
}

function scheduleReconnect() {
  if (!token || retryTimer) return;
  const delay = Math.min(15000, 1000 * 2 ** Math.min(retry, 4));
  retry += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, delay);
}

function connect() {
  if (!token) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  clearTimers();
  setStatus('connecting');
  let ws: WebSocket;
  try {
    ws = new WebSocket(socketUrl());
  } catch {
    setStatus('offline');
    scheduleReconnect();
    return;
  }
  socket = ws;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'auth', token }));
  };

  ws.onmessage = (event) => {
    let message: ServerMessage;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (message.type === 'hello') {
      retry = 0;
      setStatus('online');
      useConnection.setState({ online: Number(message.online) || 0 });
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => send({ type: 'ping' }), 25000);
    } else if (message.type === 'online') {
      useConnection.setState({ online: Number(message.count) || 0 });
    }
    handlers.forEach((handler) => handler(message));
  };

  ws.onclose = (event) => {
    if (socket !== ws) return;
    socket = null;
    clearTimers();
    setStatus('offline');
    if (event.code === 4001) {
      closeHandler?.(event.reason === 'deleted' ? 'deleted' : 'unauthorized');
      return;
    }
    if (event.code === 4003) {
      closeHandler?.('banned');
      return;
    }
    if (event.code === 4000) {
      closeHandler?.('replaced');
      return;
    }
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws.close();
  };
}

export const realtime = {
  start(newToken: string) {
    token = newToken;
    retry = 0;
    connect();
    if (!appStateSub) {
      appStateSub = AppState.addEventListener('change', (state) => {
        if (state === 'active' && token) {
          if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
          }
          retry = 0;
          connect();
        }
      });
    }
  },
  stop() {
    token = null;
    clearTimers();
    appStateSub?.remove();
    appStateSub = null;
    const ws = socket;
    socket = null;
    ws?.close();
    setStatus('offline');
  },
  reconnectNow() {
    if (!token) return;
    retry = 0;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    connect();
  },
  send,
  subscribe(handler: Handler) {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  },
  onClose(handler: CloseHandler | null) {
    closeHandler = handler;
  },
  isOnline() {
    return useConnection.getState().status === 'online';
  },
};

function send(message: Record<string, unknown>): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN || useConnection.getState().status !== 'online') return false;
  socket.send(JSON.stringify(message));
  return true;
}
