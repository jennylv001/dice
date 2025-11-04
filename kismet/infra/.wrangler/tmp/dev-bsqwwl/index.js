// .wrangler/tmp/bundle-1IdPuj/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// ../shared/src/crypto.ts
async function sha256(data) {
  const buf = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
  return crypto.subtle.digest("SHA-256", buf);
}
function b64url(bytes) {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// ../worker/src/utils.ts
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};
function okJson(obj, init = {}) {
  const baseHeaders = { "content-type": "application/json", ...CORS_HEADERS };
  const mergedHeaders = { ...init.headers || {}, ...baseHeaders };
  return new Response(JSON.stringify(obj), { ...init, headers: mergedHeaders });
}
function bad(reason, code = 400) {
  return okJson({ error: reason }, { status: code });
}
function corsPreflight() {
  return new Response("", { status: 204, headers: CORS_HEADERS });
}

// ../worker/src/kv.ts
async function kvPutTTL(kv, key, value, ttlSec = 600) {
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSec });
}
async function kvGet(kv, key) {
  const v = await kv.get(key);
  return v ? JSON.parse(v) : null;
}
async function kvIncr(kv, key, by = 1) {
  const cur = Number(await kv.get(key) || "0");
  await kv.put(key, String(cur + by));
}

// ../shared/src/stimuli.ts
function xorshift128(seed) {
  let x = seed[0] << 24 | seed[1] << 16 | seed[2] << 8 | seed[3];
  let y = seed[4] << 24 | seed[5] << 16 | seed[6] << 8 | seed[7];
  let z = seed[8] << 24 | seed[9] << 16 | seed[10] << 8 | seed[11];
  let w = seed[12] << 24 | seed[13] << 16 | seed[14] << 8 | seed[15];
  return () => {
    const t = x ^ x << 11;
    x = y;
    y = z;
    z = w;
    w = (w ^ w >>> 19 ^ (t ^ t >>> 8)) >>> 0;
    return (w & 4294967295) / 4294967296;
  };
}
function buildSchedule(nonceStim, durMs = 2e3) {
  const rand = xorshift128(nonceStim);
  const frames = Math.round(durMs / 1e3 * 60);
  const luma = [];
  const a1 = 0.015 + rand() * 0.01, a2 = 0.01 + rand() * 0.01, a3 = 5e-3 + rand() * 5e-3;
  const p1 = rand() * Math.PI * 2, p2 = rand() * Math.PI * 2, p3 = rand() * Math.PI * 2;
  for (let i = 0; i < frames; i++) {
    const t = i / 60;
    const v = 1 + a1 * Math.sin(2 * Math.PI * 1.3 * t + p1) + a2 * Math.sin(2 * Math.PI * 2.1 * t + p2) + a3 * Math.sin(2 * Math.PI * 0.7 * t + p3);
    luma.push(Math.max(0.97, Math.min(1.03, v)));
  }
  const barcode = Array(frames).fill(0);
  for (let k = 0; k < 6; k++)
    barcode[Math.min(frames - 1, Math.floor(rand() * (frames - 6)) + k)] = 1;
  const haptics = [rand(), rand(), rand()].map((r) => Math.floor(300 + r * 1200));
  const freqs = [17300, 18300, 19300];
  const nC = 2 + Math.floor(rand() * 2);
  const chirps = Array.from({ length: nC }, () => ({ tMs: Math.floor(250 + rand() * 1400), freq: freqs[Math.floor(rand() * freqs.length)] }));
  return { durMs, luma, barcode, haptics, chirps };
}

// ../shared/src/constants.ts
var LIVENESS_THRESHOLDS = {
  rLumaMin: 0.82,
  barcodeMaxErr: 0.25,
  hapticImuMsMax: 10,
  chirpSnrMinDb: 6,
  vioImuDevMax: 0.35,
  minTumble: 2,
  settleStableMs: 200
};

// ../worker/src/verify.ts
async function verifyProof(proof, nonces_b64u, strictMode) {
  if (proof.version !== 1)
    return { ok: false, reason: "version_mismatch" };
  if (proof.nonces.session !== nonces_b64u.session || proof.nonces.stim !== nonces_b64u.stim)
    return { ok: false, reason: "nonce_mismatch" };
  const L = LIVENESS_THRESHOLDS, lv = proof.liveness, ch = proof.channels;
  const passed = {
    luma: lv.r_luma >= L.rLumaMin,
    barcode: lv.barcode_err <= L.barcodeMaxErr,
    haptic: ch.haptics && ch.imu ? lv.haptic_imu_ms <= L.hapticImuMsMax : true,
    chirp: ch.audio ? lv.chirp_snr >= L.chirpSnrMinDb : true,
    vio: ch.video && ch.imu ? lv.vio_imu_dev <= L.vioImuDevMax : true
  };
  if (!(passed.luma && passed.barcode))
    return { ok: false, reason: "visual_liveness" };
  if (strictMode) {
    const count = [passed.haptic, passed.chirp, passed.vio].filter(Boolean).length;
    if (count < 2)
      return { ok: false, reason: "insufficient_channels" };
  }
  for (const d of proof.dice)
    if (d.tumble_count < L.minTumble)
      return { ok: false, reason: "tumble_low" };
  const schedule = buildSchedule(b64uToBytes(nonces_b64u.stim));
  if (proof.audit?.frames?.length) {
    let hit = 0;
    for (const f of proof.audit.frames) {
      const idx = Math.round(f.t_ms / schedule.durMs * (schedule.barcode.length - 1));
      if (schedule.barcode[idx])
        hit++;
    }
    if (hit < 2)
      return { ok: false, reason: "barcode_audit_fail" };
  }
  const digestSource = JSON.stringify(slim(proof));
  const digest = await sha256(new TextEncoder().encode(digestSource));
  const key = await crypto.subtle.importKey("jwk", proof.webauthn.publicKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const sig = b64uToBytes(proof.webauthn.signatureB64u);
  const verified = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, digest);
  if (!verified)
    return { ok: false, reason: "sig_invalid" };
  for (const r of [proof.stream_roots.video, proof.stream_roots.imu, proof.stream_roots.audio])
    if (b64uToBytes(r).length !== 32)
      return { ok: false, reason: "root_size" };
  const score = integrityScore(proof.liveness, proof.dice.map((d) => d.confidence));
  return { ok: true, score };
}
function integrityScore(lv, confidences) {
  const r = norm((lv.r_luma - 0.7) / 0.3);
  const b = norm((0.4 - lv.barcode_err) / 0.4);
  const h = norm((10 - lv.haptic_imu_ms) / 10);
  const c = norm((lv.chirp_snr - 4) / 12);
  const v = norm((0.5 - lv.vio_imu_dev) / 0.5);
  const overall = 0.3 * r + 0.15 * b + 0.2 * h + 0.2 * c + 0.15 * v;
  return { overall, per_die: confidences.map((c2) => norm(c2)) };
}
var norm = (x) => Math.max(0, Math.min(1, x));
function b64uToBytes(s) {
  let txt = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = txt.length % 4 ? 4 - txt.length % 4 : 0;
  txt += "=".repeat(pad);
  const b = atob(txt);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++)
    out[i] = b.charCodeAt(i);
  return out;
}
function slim(p) {
  const { audit, ...rest } = p;
  return rest;
}

// ../worker/src/router.ts
async function handleApi(req, env) {
  const url = new URL(req.url);
  if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    return corsPreflight();
  }
  if (url.pathname === "/api/rooms" && req.method === "POST") {
    const { hostName } = await req.json();
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
    const payload = await createRes.json();
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
    const { name, role } = await req.json();
    if (!name)
      return bad("missing_name");
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
    const { roomId, userId, token } = await req.json();
    if (!roomId || !userId || !token)
      return bad("missing_params");
    const authOk = await authPlayer(env, roomId, userId, token, req.url);
    if (!authOk)
      return bad("unauthorized", 403);
    const nonce_session = crypto.getRandomValues(new Uint8Array(16));
    const nonce_stim = crypto.getRandomValues(new Uint8Array(16));
    const nonces_b64u = { session: b64url(nonce_session), stim: b64url(nonce_stim) };
    const round_id = b64url(new Uint8Array(await sha256(nonce_session)));
    await kvPutTTL(env.KISMET_KV, `nonces:${roomId}:${round_id}:${userId}`, nonces_b64u, 120);
    const schedule = buildSchedule(nonce_stim);
    return okJson({ nonces_b64u, schedule, round_id });
  }
  if (url.pathname === "/api/submit-roll" && req.method === "POST") {
    const proof = await req.json();
    const roomId = url.searchParams.get("roomId") || "";
    const userId = url.searchParams.get("userId") || "";
    const token = url.searchParams.get("token") || "";
    if (!roomId || !userId || !token)
      return bad("missing_params");
    const authOk = await authPlayer(env, roomId, userId, token, req.url);
    if (!authOk)
      return bad("unauthorized", 403);
    const round_id = await deriveRoundId(proof.nonces.session);
    const nonces = await kvGet(env.KISMET_KV, `nonces:${roomId}:${round_id}:${userId}`);
    if (!nonces)
      return bad("nonces_missing_or_expired");
    const strict = (env.STRICT_MODE || "true").toLowerCase() === "true";
    const res = await verifyProof(proof, nonces, strict);
    if (!("ok" in res) || !res.ok)
      return okJson({ ok: false, reason: res.reason }, { status: 400 });
    const digestBuffer = await sha256(new TextEncoder().encode(JSON.stringify(proof)));
    const rp = {
      match_id: roomId,
      round_id,
      roller_user_id: userId,
      opponent_user_id: "",
      timestamp_server: Date.now(),
      dice_values: proof.dice.map((d) => d.value),
      proof_digest_b64u: b64url(new Uint8Array(digestBuffer)),
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
    const roomId = url.pathname.split("/").pop();
    const id = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(id);
    return stub.fetch(req);
  }
  return new Response("not found", { status: 404 });
}
async function deriveRoundId(nonceSessionB64u) {
  const digest = await sha256(b64uToBytes2(nonceSessionB64u));
  return b64url(new Uint8Array(digest));
}
function b64uToBytes2(s) {
  let txt = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = txt.length % 4 ? 4 - txt.length % 4 : 0;
  txt += "=".repeat(pad);
  const b = atob(txt);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++)
    out[i] = b.charCodeAt(i);
  return out;
}
async function authPlayer(env, roomId, playerId, token, requestUrl) {
  const id = env.ROOM_DO.idFromName(roomId);
  const stub = env.ROOM_DO.get(id);
  const res = await stub.fetch(new Request(new URL("/do/auth", requestUrl), {
    method: "POST",
    body: JSON.stringify({ playerId, token })
  }));
  if (!res.ok)
    return false;
  const payload = await res.json().catch(() => ({ ok: false }));
  const parsed = payload;
  return Boolean(parsed && parsed.ok);
}
async function getRoomIndex(env) {
  const list = await kvGet(env.KISMET_KV, "rooms:index");
  if (!list)
    return [];
  const cutoff = Date.now() - 1e3 * 60 * 30;
  return list.filter((entry) => entry.createdAt >= cutoff);
}
async function addRoomIndex(env, entry) {
  const list = await getRoomIndex(env);
  const filtered = list.filter((e) => e.roomId !== entry.roomId);
  filtered.unshift(entry);
  await env.KISMET_KV.put("rooms:index", JSON.stringify(filtered.slice(0, 50)));
}
async function removeRoomIndex(env, roomId) {
  const list = await getRoomIndex(env);
  const filtered = list.filter((e) => e.roomId !== roomId);
  await env.KISMET_KV.put("rooms:index", JSON.stringify(filtered));
}
function generateRoomId() {
  const alphabet = "bcdfghjklmnpqrstvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * alphabet.length);
    out += alphabet[idx];
  }
  return out;
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ../worker/src/do_room.ts
var STORAGE_KEY = "room";
var RoomDO = class {
  state;
  env;
  clients;
  players;
  data;
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = /* @__PURE__ */ new Map();
    this.players = /* @__PURE__ */ new Map();
    this.data = {
      roomId: "",
      createdAt: Date.now(),
      stage: "AWAITING_OPPONENT",
      hostId: null,
      challengerId: null,
      order: [],
      currentIdx: 0,
      roundHistory: [],
      turnStartTime: null,
      globalPhase: "LOBBY"
    };
    state.blockConcurrencyWhile(async () => {
      const stored = await state.storage.get(STORAGE_KEY);
      if (!stored)
        return;
      this.data = stored.data;
      for (const [id, player] of Object.entries(stored.players)) {
        this.players.set(id, {
          ...player,
          id,
          connected: false,
          lastSeen: Date.now()
        });
      }
    });
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/do/create") && req.method === "POST")
      return this.handleCreate(req);
    if (url.pathname.endsWith("/do/join") && req.method === "POST")
      return this.handleJoin(req);
    if (url.pathname.endsWith("/do/state") && req.method === "GET")
      return this.handleState();
    if (url.pathname.endsWith("/do/leave") && req.method === "POST")
      return this.handleLeave(req);
    if (url.pathname.endsWith("/do/auth") && req.method === "POST")
      return this.handleAuth(req);
    if (url.pathname.endsWith("/do/thumb") && req.method === "POST")
      return this.handleThumb(req);
    if (url.pathname.endsWith("/do/submit") && req.method === "POST")
      return this.handleSubmit(req);
    if (req.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.handleSocket(server, url);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("not found", { status: 404 });
  }
  async handleCreate(req) {
    const { roomId, hostName } = await req.json();
    const now = Date.now();
    const playerId = `host-${crypto.randomUUID().slice(0, 8)}`;
    const token = randomToken();
    const name = sanitizeName(hostName || "Host");
    this.data = {
      roomId,
      createdAt: now,
      stage: "AWAITING_OPPONENT",
      hostId: playerId,
      challengerId: null,
      order: [playerId],
      currentIdx: 0,
      roundHistory: [],
      turnStartTime: null,
      globalPhase: "JOINING"
    };
    this.players.clear();
    this.clients.clear();
    this.players.set(playerId, {
      id: playerId,
      name,
      role: "host",
      token,
      spectator: false,
      rtcWanted: false,
      phase: "JOINING",
      streak: 0,
      xp: 0,
      diceReady: false,
      connected: false,
      lastSeen: now
    });
    await this.persist();
    return jsonResponse({ playerId, token, playerName: name, room: this.buildRoomState() });
  }
  async handleJoin(req) {
    if (!this.data.hostId)
      return jsonResponse({ error: "room_not_initialized" }, 400);
    const body = await req.json();
    const role = body.role === "spectator" ? "spectator" : "challenger";
    if (role === "challenger" && this.data.challengerId && this.players.has(this.data.challengerId)) {
      return jsonResponse({ error: "room_full" }, 409);
    }
    const playerId = `${role}-${crypto.randomUUID().slice(0, 8)}`;
    const token = randomToken();
    const name = sanitizeName(body.name);
    const now = Date.now();
    this.players.set(playerId, {
      id: playerId,
      name,
      role,
      token,
      spectator: role === "spectator",
      rtcWanted: false,
      phase: "JOINING",
      streak: 0,
      xp: 0,
      diceReady: false,
      connected: false,
      lastSeen: now
    });
    if (role === "challenger") {
      this.data.challengerId = playerId;
      if (!this.data.order.includes(playerId))
        this.data.order.push(playerId);
      this.data.stage = "AWAITING_DICE";
    }
    await this.persist();
    return jsonResponse({ playerId, token, playerName: name, room: this.buildRoomState() });
  }
  async handleState() {
    return jsonResponse({ room: this.buildRoomState() });
  }
  async handleLeave(req) {
    const { playerId } = await req.json();
    const player = playerId ? this.players.get(playerId) : void 0;
    if (!player)
      return jsonResponse({ ok: true });
    this.players.delete(playerId);
    this.clients.delete(playerId);
    this.data.order = this.data.order.filter((id) => id !== playerId);
    if (player.role === "host") {
      this.data.hostId = null;
      this.data.stage = "AWAITING_OPPONENT";
    } else if (player.role === "challenger") {
      this.data.challengerId = null;
      this.data.stage = "AWAITING_OPPONENT";
    }
    await this.persist();
    this.broadcastState();
    return jsonResponse({ ok: true });
  }
  async handleAuth(req) {
    const { playerId, token } = await req.json();
    const player = this.players.get(playerId);
    if (!player || player.token !== token)
      return jsonResponse({ ok: false }, 403);
    return jsonResponse({ ok: true, role: player.role });
  }
  async handleThumb(req) {
    const { userId, thumb } = await req.json();
    const player = this.players.get(userId);
    if (player)
      player.phase = "SEALING";
    this.broadcastPhase("SEALING", userId);
    this.broadcastExcept(userId, JSON.stringify({ t: "opp_thumb", p: thumb }));
    this.broadcastState();
    await this.persist();
    return jsonResponse({ ok: true });
  }
  async handleSubmit(req) {
    const { userId, rp } = await req.json();
    const player = this.players.get(userId);
    if (player) {
      player.phase = "SEALED";
      const score = rp.integrity_scores.overall;
      const bonusXp = Math.round(10 + score * 20 + (player.streak > 0 ? player.streak * 5 : 0));
      player.xp += bonusXp;
      if (score >= 0.8)
        player.streak++;
      else
        player.streak = 0;
      this.data.roundHistory.push({ round_id: rp.round_id, userId, dice: rp.dice_values, score, timestamp: rp.timestamp_server });
      if (this.data.roundHistory.length > 50)
        this.data.roundHistory = this.data.roundHistory.slice(-50);
    }
    this.broadcastExcept(userId, JSON.stringify({ t: "opp_result", p: rp }));
    this.broadcastPhase("SEALED", userId);
    this.advanceTurn();
    await this.persist();
    return jsonResponse({ ok: true });
  }
  handleSocket(ws, url) {
    ws.accept();
    const playerId = url.searchParams.get("playerId");
    const token = url.searchParams.get("token");
    if (!playerId || !token) {
      ws.close(4001, "missing_credentials");
      return;
    }
    const player = this.players.get(playerId);
    if (!player || player.token !== token) {
      ws.close(4003, "unauthorized");
      return;
    }
    this.clients.set(playerId, { ws });
    player.connected = true;
    player.lastSeen = Date.now();
    if (!player.diceReady)
      player.phase = "VERIFYING";
    const send = (m) => ws.send(JSON.stringify(m));
    send({ t: "joined", p: { roomId: this.data.roomId, you: playerId, opp: this.getOpponentId(playerId), spectator: player.spectator } });
    this.broadcastState();
    ws.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleClientMessage(playerId, msg);
      } catch {
      }
    });
    ws.addEventListener("close", () => {
      player.connected = false;
      player.diceReady = false;
      player.phase = "WAITING";
      this.clients.delete(playerId);
      this.broadcastState();
      this.persist().catch(() => {
      });
    });
  }
  handleClientMessage(playerId, msg) {
    const player = this.players.get(playerId);
    if (!player)
      return;
    switch (msg.t) {
      case "join": {
        player.spectator = !!msg.p.spectator;
        player.role = msg.p.role;
        if (!this.data.order.includes(playerId) && !player.spectator)
          this.data.order.push(playerId);
        player.phase = this.data.stage === "READY" ? "WAITING" : "VERIFYING";
        this.broadcastState();
        this.persist().catch(() => {
        });
        break;
      }
      case "rtc_want": {
        player.rtcWanted = !!msg.p.enable;
        this.broadcastExcept(playerId, JSON.stringify({ t: "rtc_want", p: { from: playerId, enable: !!msg.p.enable } }));
        this.broadcastState();
        this.persist().catch(() => {
        });
        break;
      }
      case "rtc_offer": {
        this.broadcastExcept(playerId, JSON.stringify({ t: "rtc_offer", p: { from: playerId, sdp: msg.p.sdp } }));
        break;
      }
      case "rtc_answer": {
        this.broadcastExcept(playerId, JSON.stringify({ t: "rtc_answer", p: { from: playerId, sdp: msg.p.sdp } }));
        break;
      }
      case "rtc_ice": {
        this.broadcastExcept(playerId, JSON.stringify({ t: "rtc_ice", p: { from: playerId, candidate: msg.p.candidate } }));
        break;
      }
      case "dice_status": {
        player.diceReady = !!msg.p.ready;
        player.phase = player.diceReady ? "VERIFYING" : "WAITING";
        this.checkStageTransitions();
        this.broadcastState();
        this.persist().catch(() => {
        });
        break;
      }
      case "ready": {
        this.notifyTurn();
        break;
      }
      default:
        break;
    }
  }
  checkStageTransitions() {
    const host = this.data.hostId ? this.players.get(this.data.hostId) : void 0;
    const challenger = this.data.challengerId ? this.players.get(this.data.challengerId) : void 0;
    if (!host) {
      this.data.stage = "AWAITING_OPPONENT";
      return;
    }
    if (!challenger) {
      this.data.stage = "AWAITING_OPPONENT";
      return;
    }
    if (!host.diceReady || !challenger.diceReady) {
      this.data.stage = "AWAITING_DICE";
      this.data.globalPhase = "VERIFYING";
      return;
    }
    if (this.data.stage === "AWAITING_DICE" || this.data.stage === "AWAITING_OPPONENT") {
      this.data.stage = "READY";
      this.data.globalPhase = "TURN_READY";
      this.notifyTurn();
    }
  }
  notifyTurn() {
    if (this.data.order.length === 0)
      return;
    const current = this.data.order[this.data.currentIdx % this.data.order.length];
    const now = Date.now();
    this.data.turnStartTime = now;
    this.data.stage = "IN_PROGRESS";
    this.data.globalPhase = "TURN_READY";
    for (const [id, player] of this.players) {
      if (player.spectator)
        continue;
      if (id === current) {
        player.phase = "TURN_READY";
        const client = this.clients.get(id);
        if (client) {
          client.ws.send(JSON.stringify({ t: "your_turn", p: { round_id: crypto.randomUUID() } }));
        }
      } else {
        player.phase = "WAITING";
      }
    }
    this.broadcastPhase("TURN_READY", current);
    this.broadcastState();
    this.persist().catch(() => {
    });
  }
  advanceTurn() {
    if (this.data.order.length === 0)
      return;
    this.data.currentIdx = (this.data.currentIdx + 1) % this.data.order.length;
    this.data.stage = "READY";
    this.data.globalPhase = "SEALED";
    this.broadcastState();
    this.persist().catch(() => {
    });
    this.notifyTurn();
  }
  broadcastExcept(userId, msg) {
    for (const [uid, client] of this.clients)
      if (uid !== userId)
        client.ws.send(msg);
  }
  broadcastPhase(phase, userId) {
    const msg = JSON.stringify({ t: "phase", p: { phase, userId } });
    for (const client of this.clients.values())
      client.ws.send(msg);
  }
  broadcastState() {
    const payload = this.buildRoomState();
    const msg = JSON.stringify({ t: "state", p: payload });
    for (const client of this.clients.values())
      client.ws.send(msg);
  }
  buildRoomState() {
    const players = Array.from(this.players.values()).map((p) => ({
      userId: p.id,
      name: p.name,
      role: p.role,
      spectator: p.spectator,
      rtcWanted: p.rtcWanted,
      phase: p.phase,
      streak: p.streak,
      xp: p.xp,
      diceReady: p.diceReady,
      connected: p.connected
    }));
    return {
      roomId: this.data.roomId,
      createdAt: this.data.createdAt,
      stage: this.data.stage,
      hostId: this.data.hostId,
      challengerId: this.data.challengerId,
      players,
      order: this.data.order.slice(),
      currentIdx: this.data.currentIdx,
      phase: this.data.globalPhase,
      roundHistory: this.data.roundHistory.slice(-10),
      turnStartTime: this.data.turnStartTime
    };
  }
  getOpponentId(playerId) {
    if (!this.data.hostId || !this.data.challengerId)
      return void 0;
    if (playerId === this.data.hostId)
      return this.data.challengerId;
    if (playerId === this.data.challengerId)
      return this.data.hostId;
    return void 0;
  }
  async persist() {
    const players = {};
    for (const [id, player] of this.players) {
      const { connected: _connected, lastSeen: _lastSeen, ...rest } = player;
      players[id] = rest;
    }
    const payload = { data: this.data, players };
    await this.state.storage.put(STORAGE_KEY, payload);
  }
};
function sanitizeName(name) {
  const trimmed = name.trim().slice(0, 24);
  return trimmed.length > 0 ? trimmed : "Player";
}
function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
async function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

// ../worker/src/index.ts
var handler = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(req, env);
    }
    return new Response("Kismet Worker", { status: 200 });
  }
};
var src_default = handler;

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
};
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
var jsonError = async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
};
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-1IdPuj/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}

// .wrangler/tmp/bundle-1IdPuj/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  };
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      };
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  RoomDO,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
