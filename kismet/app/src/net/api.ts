import type { ApiStartRollRes, Proof, RoomStatePayload, PlayerRole, UserProfile, GameMode } from "../../../shared/src/types.js";

// Allow overriding the API base (worker domain) at build time via Vite env.
// If VITE_API_BASE is unset we fall back to relative paths expecting a route on the same origin.
const RAW_BASE = (import.meta as any).env?.VITE_API_BASE as string | undefined;
const API_BASE = RAW_BASE ? RAW_BASE.replace(/\/$/, "") : ""; // ensure no trailing slash

function apiUrl(path: string) {
  return API_BASE ? API_BASE + path : path; // path already starts with /
}

async function doJson<T>(path: string, init: RequestInit): Promise<T> {
  const r = await fetch(apiUrl(path), init);
  if (!r.ok) {
    let body: any = null;
    try { body = await r.json(); } catch {}
    const msg = body?.error || `request_failed_${r.status}`;
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

export async function apiStartRoll(roomId: string, userId: string, token: string): Promise<ApiStartRollRes> {
  return doJson<ApiStartRollRes>("/api/start-roll", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roomId, userId, token })
  });
}

export async function apiSubmitRoll(roomId: string, userId: string, token: string, proof: Proof): Promise<void> {
  const params = new URLSearchParams({ roomId, userId, token }).toString();
  await doJson("/api/submit-roll?" + params, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(proof)
  });
}

export function getApiBase(): string { return API_BASE; }

export type AuthResponse = { token: string; expiresAt: number; profile: UserProfile };

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  throwIfMissing(email, "email");
  throwIfMissing(password, "password");
  return doJson<AuthResponse>("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

export async function apiSignUp(payload: { email: string; password: string; name?: string; avatar?: string }): Promise<AuthResponse> {
  throwIfMissing(payload.email, "email");
  throwIfMissing(payload.password, "password");
  return doJson<AuthResponse>("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export type CreateRoomResponse = {
  roomId: string;
  playerId: string;
  token: string;
  playerName: string;
  room: RoomStatePayload;
};

export type CreateRoomPayload = { hostName?: string; token?: string; gameMode?: GameMode };

export async function apiCreateRoom(payload: CreateRoomPayload): Promise<CreateRoomResponse> {
  if (!payload.hostName && !payload.token) throw new Error("hostName_missing");
  return doJson<CreateRoomResponse>("/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostName: payload.hostName, token: payload.token, gameMode: payload.gameMode })
  });
}

export type JoinRoomResponse = {
  roomId: string;
  playerId: string;
  token: string;
  playerName?: string;
  room?: RoomStatePayload;
};

export type JoinRoomPayload = { roomId: string; name?: string; role?: PlayerRole; token?: string };

export async function apiJoinRoom(payload: JoinRoomPayload): Promise<JoinRoomResponse> {
  throwIfMissing(payload.roomId, "roomId");
  if (!payload.name && !payload.token) throw new Error("name_missing");
  return doJson<JoinRoomResponse>(`/api/rooms/${encodeURIComponent(payload.roomId)}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: payload.name, role: payload.role, token: payload.token })
  });
}

export async function apiGetRoom(roomId: string): Promise<{ room: RoomStatePayload }> {
  throwIfMissing(roomId, "roomId");
  return doJson<{ room: RoomStatePayload }>(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "GET" });
}

export type OpenRoomEntry = { roomId: string; hostName: string; createdAt: number };

export async function apiListOpenRooms(): Promise<OpenRoomEntry[]> {
  const res = await doJson<{ rooms: OpenRoomEntry[] }>("/api/rooms/open", { method: "GET" });
  return res.rooms;
}

export type TurnIceServers = { iceServers: { urls: string[]; username: string; credential: string }[] };
export async function apiGetTurnServers(roomId: string, userId: string, token: string): Promise<TurnIceServers> {
  throwIfMissing(roomId, "roomId");
  throwIfMissing(userId, "userId");
  throwIfMissing(token, "token");
  return doJson<TurnIceServers>("/api/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roomId, userId, token })
  });
}

function throwIfMissing(value: string | undefined, field: string): void {
  if (!value) throw new Error(`${field}_missing`);
}
