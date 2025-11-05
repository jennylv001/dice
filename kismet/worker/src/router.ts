import { okJson, bad, corsPreflight } from "./utils.js";
import type { Env } from "./kv.js";
import { kvGet, kvPutTTL, kvIncr } from "./kv.js";
import { buildSchedule } from "../../shared/src/stimuli.js";
import { verifyProof } from "./verify.js";
import type { Proof, RPv1 } from "./types.js";
import { sha256, b64url } from "../../shared/src/crypto.js";
import { handleTurnRequest } from "./turn.js";

export async function handleApi(req: Request, env: Env) {
  const url = new URL(req.url);

  // CORS preflight
  if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    return corsPreflight();
  }

  if (url.pathname === "/api/rooms" && req.method === "POST") {
    const { hostName } = (await req.json()) as { hostName?: string };
    const roomId = generateRoomId();
    const id = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(id);
    const createRes = await stub.fetch(new Request(new URL("/do/create", req.url), {
      method: "POST",
      body: JSON.stringify({ roomId, hostName })
    }));
    if (!createRes.ok) {
      const body = await createRes.json().catch(() => ({ error: "create_failed" }));
      return okJson(body, { status: createRes.status });
    }
    const payload = await createRes.json() as { playerId: string; token: string; playerName: string; room: unknown };
    await addRoomIndex(env, { roomId, hostName: payload.playerName, createdAt: Date.now() });
    return okJson({ roomId, playerId: payload.playerId, token: payload.token, playerName: payload.playerName, room: payload.room });
  }

  if (url.pathname === "/api/rooms/open" && req.method === "GET") {
    const rooms = await getRoomIndex(env);
    return okJson({ rooms });
  }

  const joinMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
  if (joinMatch && req.method === "POST") {
    const roomId = joinMatch[1];
    const { name, role } = (await req.json()) as { name: string; role?: string };
    if (!name) return bad("missing_name");
    const id = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(id);
    const joinRes = await stub.fetch(new Request(new URL("/do/join", req.url), {
      method: "POST",
      body: JSON.stringify({ name, role })
    }));
    const body = await joinRes.json().catch(() => ({ error: "join_failed" }));
    if (!joinRes.ok) {
      return okJson(body, { status: joinRes.status });
    }
    await removeRoomIndex(env, roomId);
    const data = isPlainObject(body) ? body : { payload: body };
    return okJson({ roomId, ...data });
  }

  const stateMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
  if (stateMatch && req.method === "GET") {
    const roomId = stateMatch[1];
    const id = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(id);
    const stateRes = await stub.fetch(new Request(new URL("/do/state", req.url)));
  const data = await stateRes.json().catch(() => ({ error: "not_found" }));
  return okJson(data, { status: stateRes.status });
  }

  if (url.pathname === "/api/start-roll" && req.method === "POST") {
    const { roomId, userId, token } = (await req.json()) as { roomId: string; userId: string; token: string };
    if (!roomId || !userId || !token) return bad("missing_params");
    const authOk = await authPlayer(env, roomId, userId, token, req.url);
    if (!authOk) return bad("unauthorized", 403);
    const nonce_session = crypto.getRandomValues(new Uint8Array(16));
    const nonce_stim = crypto.getRandomValues(new Uint8Array(16));
    const nonces_b64u = { session: b64url(nonce_session), stim: b64url(nonce_stim) };
    const round_id = b64url(new Uint8Array(await sha256(nonce_session) as ArrayBuffer));
    await kvPutTTL(env.KISMET_KV, `nonces:${roomId}:${round_id}:${userId}`, nonces_b64u, 120);
    const schedule = buildSchedule(nonce_stim);
    return okJson({ nonces_b64u, schedule, round_id });
  }

  if (url.pathname === "/api/turn" && req.method === "POST") {
    const payload = await req.json().catch(() => null);
    const { roomId, userId, token } = (payload ?? {}) as { roomId?: string; userId?: string; token?: string };
    if (!roomId || !userId || !token) return bad("missing_params");
    const authOk = await authPlayer(env, roomId, userId, token, req.url);
    if (!authOk) return bad("unauthorized", 403);
    return handleTurnRequest(req, env, { roomId, userId });
  }

  if (url.pathname === "/api/submit-roll" && req.method === "POST") {
    const proof = (await req.json()) as Proof;
    const roomId = url.searchParams.get("roomId") || "";
    const userId = url.searchParams.get("userId") || "";
    const token = url.searchParams.get("token") || "";
    if (!roomId || !userId || !token) return bad("missing_params");
    const authOk = await authPlayer(env, roomId, userId, token, req.url);
    if (!authOk) return bad("unauthorized", 403);
    const round_id = await deriveRoundId(proof.nonces.session);
    const nonces = await kvGet<{ session: string; stim: string }>(env.KISMET_KV, `nonces:${roomId}:${round_id}:${userId}`);
    if (!nonces) return bad("nonces_missing_or_expired");

    const strict = (env.STRICT_MODE || "true").toLowerCase() === "true";
    const res = await verifyProof(proof, nonces, strict);
    if (!("ok" in res) || !res.ok) return okJson({ ok: false, reason: (res as any).reason }, { status: 400 });

    const digestBuffer = await sha256(new TextEncoder().encode(JSON.stringify(proof)));
    const rp: RPv1 = {
      match_id: roomId,
      round_id,
      roller_user_id: userId,
      opponent_user_id: "",
      timestamp_server: Date.now(),
      dice_values: proof.dice.map(d => d.value),
      proof_digest_b64u: b64url(new Uint8Array(digestBuffer as ArrayBuffer)),
      device_sig_b64u: proof.webauthn.signatureB64u,
      integrity_scores: res.score,
      ui_meta: { fx_seed_b64u: b64url(crypto.getRandomValues(new Uint8Array(8))) }
    };

    await kvIncr(env.KISMET_KV, `rank:${userId}:xp`, Math.round(10 + res.score.overall * 20));

    const id = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(id);
    const lastFrame = proof.audit.frames[proof.audit.frames.length - 1];
    await stub.fetch(new Request(new URL("/do/thumb", req.url), { method: "POST", body: JSON.stringify({ userId, thumb: lastFrame }) }));
    await stub.fetch(new Request(new URL("/do/submit", req.url), { method: "POST", body: JSON.stringify({ userId, rp }) }));

    return okJson({ ok: true });
  }

  if (url.pathname.startsWith("/api/room/") && req.headers.get("Upgrade") === "websocket") {
    const roomId = url.pathname.split("/").pop()!;
    const id = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(id);
    return stub.fetch(req);
  }

  // Authentication endpoints (guest mode - no actual storage, uses client tokens)
  if (url.pathname === "/api/auth/signup" && req.method === "POST") {
    const { email, password, name } = (await req.json()) as { email: string; password: string; name: string };
    if (!email || !password || !name) return bad("missing_fields");
    
    // Simple validation
    if (password.length < 8) return bad("password_too_short");
    
    // Generate user ID and token (in real impl, would hash password and store in KV)
    const userId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const token = await generateAuthToken(userId);
    
    // For free-tier: Store minimal user data in KV with TTL
    await kvPutTTL(env.KISMET_KV, `user:${userId}`, { email, name, created: Date.now() }, 60 * 60 * 24 * 365); // 1 year
    
    return okJson({ userId, name, email, token });
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    const { email, password } = (await req.json()) as { email: string; password: string };
    if (!email || !password) return bad("missing_fields");
    
    // For free-tier: In real impl, would verify password hash
    // For now, generate new session token (stateless)
    const userId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const token = await generateAuthToken(userId);
    
    // Look up user by email (simplified - real impl would use proper index)
    const userName = email.split("@")[0]; // Simple fallback
    
    return okJson({ userId, name: userName, email, token });
  }

  return new Response("not found", { status: 404 });
}

async function generateAuthToken(userId: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}-${Date.now()}-${Math.random()}`);
  const hash = await sha256(data);
  return b64url(new Uint8Array(hash));
}

async function deriveRoundId(nonceSessionB64u: string) {
  const digest = await sha256(b64uToBytes(nonceSessionB64u));
  return b64url(new Uint8Array(digest as ArrayBuffer));
}
function b64uToBytes(s: string) {
  let txt = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = txt.length % 4 ? 4 - (txt.length % 4) : 0;
  txt += "=".repeat(pad);
  const b = atob(txt);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function authPlayer(env: Env, roomId: string, playerId: string, token: string, requestUrl: string): Promise<boolean> {
  const id = env.ROOM_DO.idFromName(roomId);
  const stub = env.ROOM_DO.get(id);
  const res = await stub.fetch(new Request(new URL("/do/auth", requestUrl), {
    method: "POST",
    body: JSON.stringify({ playerId, token })
  }));
  if (!res.ok) return false;
  const payload = await res.json().catch(() => ({ ok: false }));
  const parsed = payload as { ok?: boolean } | null;
  return Boolean(parsed && parsed.ok);
}

type RoomIndexEntry = { roomId: string; hostName: string; createdAt: number };

async function getRoomIndex(env: Env): Promise<RoomIndexEntry[]> {
  const list = await kvGet<RoomIndexEntry[]>(env.KISMET_KV, "rooms:index");
  if (!list) return [];
  const cutoff = Date.now() - 1000 * 60 * 30;
  return list.filter(entry => entry.createdAt >= cutoff);
}

async function addRoomIndex(env: Env, entry: RoomIndexEntry) {
  const list = await getRoomIndex(env);
  const filtered = list.filter(e => e.roomId !== entry.roomId);
  filtered.unshift(entry);
  await env.KISMET_KV.put("rooms:index", JSON.stringify(filtered.slice(0, 50)));
}

async function removeRoomIndex(env: Env, roomId: string) {
  const list = await getRoomIndex(env);
  const filtered = list.filter(e => e.roomId !== roomId);
  await env.KISMET_KV.put("rooms:index", JSON.stringify(filtered));
}

function generateRoomId(): string {
  const alphabet = "bcdfghjklmnpqrstvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * alphabet.length);
    out += alphabet[idx];
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
