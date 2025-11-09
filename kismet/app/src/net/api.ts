import type { ApiStartRollRes, Proof, RoomStatePayload, PlayerRole, UserProfile, GameMode } from "../../../shared/src/types.js";

declare global {
  interface Window {
    __KISMET_API_BASE__?: string;
  }
}

const RUNTIME_STORAGE_KEY = "kismet.apiBase";

type PersistAction = "set" | "clear" | "ignore";

// Allow overriding the API base (worker domain) at build time via Vite env.
// If VITE_API_BASE is unset we fall back to relative paths expecting a route on the same origin.
const RAW_BASE = (import.meta as any).env?.VITE_API_BASE as string | undefined;

let apiBase = "";

function sanitiseBase(value?: string | null): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  // Support absolute URLs passed directly (with protocol)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const direct = new URL(trimmed);
      direct.hash = "";
      return direct.toString().replace(/\/$/, "");
    } catch {
      return "";
    }
  }

  // Allow relative paths to be supplied (used for same-origin routing)
  if (trimmed.startsWith("/")) {
    return trimmed.replace(/\/$/, "");
  }

  // Treat bare hostnames as HTTPS origins (maintains previous behaviour)
  try {
    const guessed = new URL(`https://${trimmed}`);
    guessed.hash = "";
    return guessed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function applyBase(resolved: string, action: PersistAction) {
  apiBase = resolved;
  if (typeof window === "undefined") return;
  if (action === "ignore") return;
  try {
    if (action === "set" && resolved) {
      window.localStorage.setItem(RUNTIME_STORAGE_KEY, resolved);
    } else if (action === "clear") {
      window.localStorage.removeItem(RUNTIME_STORAGE_KEY);
    }
  } catch {
    // storage might be unavailable; ignore
  }
}

function resolveRuntimeBase(): string {
  if (typeof window === "undefined") return "";
  const fromGlobal = sanitiseBase((window as any).__KISMET_API_BASE__ as string | undefined);
  if (fromGlobal) return fromGlobal;
  try {
    const stored = sanitiseBase(window.localStorage.getItem(RUNTIME_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Ignore storage access issues (Safari private mode, etc.)
  }
  const meta = typeof document !== "undefined"
    ? document.querySelector('meta[name="kismet-api-base"]')
    : null;
  if (meta) {
    const content = sanitiseBase(meta.getAttribute("content"));
    if (content) return content;
  }
  return "";
}

function consumeQueryOverride(): { base: string; action: PersistAction } | { action: PersistAction; clear: true } | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const sources = [url.searchParams, new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : "")];
    let rawBase: string | null = null;
    let clearRequested = false;
    let persist: PersistAction = "set";

    for (const params of sources) {
      if (params.has("apiBasePersist")) {
        const flag = params.get("apiBasePersist");
        if (flag && /^(0|false)$/i.test(flag)) {
          persist = "ignore";
        }
      }
      if (params.has("apiBase")) {
        rawBase = params.get("apiBase");
      }
      if (params.has("apiBaseClear")) {
        clearRequested = true;
        if (persist === "set") persist = "clear";
      }
    }

    if (!rawBase && !clearRequested) return null;

    // Clean URL to avoid reapplying on navigation.
    for (const params of sources) {
      params.delete("apiBase");
      params.delete("apiBaseClear");
      params.delete("apiBasePersist");
    }

    const nextSearch = sources[0].toString();
    const nextHash = sources[1].toString();
    const newHref = `${url.origin}${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${nextHash ? `#${nextHash}` : ""}`;
    if (newHref !== window.location.href) {
      window.history.replaceState(window.history.state, document.title, newHref);
    }

    if (clearRequested) {
      const action = persist === "ignore" ? "clear" : persist;
      return { action, clear: true };
    }

    return { base: sanitiseBase(rawBase), action: rawBase && rawBase.trim() ? persist : persist === "clear" ? "clear" : persist };
  } catch {
    return null;
  }
}

const queryOverride = consumeQueryOverride();

if (queryOverride) {
  if ("clear" in queryOverride) {
    applyBase("", queryOverride.action);
  } else {
    applyBase(queryOverride.base, queryOverride.action === "set" && !queryOverride.base ? "clear" : queryOverride.action);
  }
}

if (!apiBase) {
  const envBase = sanitiseBase(RAW_BASE);
  if (envBase) {
    applyBase(envBase, "ignore");
  } else {
    const runtimeBase = resolveRuntimeBase();
    applyBase(runtimeBase, "ignore");
  }
}

function apiUrl(path: string) {
  return apiBase ? apiBase + path : path; // path already starts with /
}

export function buildApiUrl(path: string): string {
  return apiUrl(path);
}

export function setApiBaseOverride(next: string | null, persist = true) {
  const resolved = sanitiseBase(next);
  const action: PersistAction = persist ? (resolved ? "set" : "clear") : "ignore";
  applyBase(resolved, action);
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

export function getApiBase(): string { return apiBase; }

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
