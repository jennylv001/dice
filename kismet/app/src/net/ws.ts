import type { WSFromClient, WSFromServer, PlayerRole } from "../../../shared/src/types.js";

const API_BASE = (import.meta as any).env?.VITE_API_BASE as string | undefined;

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const PING_INTERVAL = 5000;
const PONG_TIMEOUT = 10000;

export function connectRoomWS(
  params: {
    roomId: string;
    playerId: string;
    token: string;
    spectator: boolean;
    role: PlayerRole;
    onMessage: (m: WSFromServer) => void;
    onStatusChange?: (status: "connecting" | "connected" | "disconnected" | "reconnecting") => void;
  }
) {
  const { roomId, playerId, token, spectator, role, onMessage, onStatusChange } = params;
  
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let intentionallyClosed = false;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let lastPongTime = Date.now();
  
  // Derive WebSocket URL
  let hostUrl: URL;
  if (API_BASE) {
    hostUrl = new URL(API_BASE.startsWith("http") ? API_BASE : "https://" + API_BASE);
  } else {
    hostUrl = new URL(location.origin);
  }
  const wsProto = hostUrl.protocol === "https:" ? "wss" : "ws";
  const wsUrl = new URL(`${wsProto}://${hostUrl.host}/api/room/${roomId}`);
  wsUrl.searchParams.set("playerId", playerId);
  wsUrl.searchParams.set("token", token);

  function connect() {
    if (intentionallyClosed) return;
    
    onStatusChange?.("connecting");
    ws = new WebSocket(wsUrl.toString());

    ws.addEventListener("open", () => {
      reconnectAttempts = 0;
      onStatusChange?.("connected");
      
      const msg: WSFromClient = { t: "join", p: { roomId, userId: playerId, spectator, token, role } };
      ws!.send(JSON.stringify(msg));
      
      startHeartbeat();
    });

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.t === "pong") {
          lastPongTime = Date.now();
        } else {
          onMessage(msg);
        }
      } catch {}
    });

    ws.addEventListener("close", () => {
      stopHeartbeat();
      if (!intentionallyClosed) {
        onStatusChange?.("disconnected");
        scheduleReconnect();
      }
    });

    ws.addEventListener("error", () => {
      stopHeartbeat();
      if (!intentionallyClosed) {
        onStatusChange?.("disconnected");
      }
    });
  }

  function startHeartbeat() {
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          // Send ping as a JSON message (server will need to handle this)
          ws.send(JSON.stringify({ t: "ping" }));
          
          // Check if we haven't received pong in timeout period
          if (Date.now() - lastPongTime > PONG_TIMEOUT) {
            console.warn("Heartbeat timeout, reconnecting...");
            ws.close();
          }
        } catch (e) {
          console.error("Failed to send ping:", e);
        }
      }
    }, PING_INTERVAL);
  }

  function stopHeartbeat() {
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
  }

  function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      onStatusChange?.("disconnected");
      onMessage({ 
        t: "toast", 
        p: { kind: "error", text: "Connection lost. Please refresh the page." } 
      });
      return;
    }

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts),
      MAX_RECONNECT_DELAY
    );
    
    reconnectAttempts++;
    onStatusChange?.("reconnecting");
    
    console.log(`Reconnecting... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    
    reconnectTimer = setTimeout(() => {
      connect();
    }, delay);
  }

  // Initial connection
  connect();

  // Return extended interface
  return {
    send: (msg: WSFromClient) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    close: () => {
      intentionallyClosed = true;
      stopHeartbeat();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        ws.close();
      }
    },
    getReadyState: () => ws?.readyState || WebSocket.CLOSED
  };
}
