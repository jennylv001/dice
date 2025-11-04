import type { WSFromClient, WSFromServer, PlayerRole } from "../../../shared/src/types.js";

const API_BASE = (import.meta as any).env?.VITE_API_BASE as string | undefined;

export function connectRoomWS(
  params: {
    roomId: string;
    playerId: string;
    token: string;
    spectator: boolean;
    role: PlayerRole;
    onMessage: (m: WSFromServer) => void;
  }
) {
  const { roomId, playerId, token, spectator, role, onMessage } = params;
  // If an API base override is set (different host), derive WS endpoint from it.
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
  const ws = new WebSocket(wsUrl.toString());
  ws.addEventListener("open", () => {
    const msg: WSFromClient = { t: "join", p: { roomId, userId: playerId, spectator, token, role } };
    ws.send(JSON.stringify(msg));
  });
  ws.addEventListener("message", (ev) => { try { onMessage(JSON.parse(ev.data as string)); } catch {} });
  return ws;
}
