// .wrangler/tmp/bundle-hhW1rt/checked-fetch.js
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
function okJson(obj, init = {}) {
  return new Response(JSON.stringify(obj), { headers: { "content-type": "application/json" }, ...init });
}
function bad(reason, code = 400) {
  return okJson({ error: reason }, { status: code });
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
  if (url.pathname === "/api/start-roll" && req.method === "POST") {
    const { roomId, userId } = await req.json();
    if (!roomId || !userId)
      return bad("missing_params");
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
    const roomId = url.searchParams.get("roomId") || "room";
    const userId = url.searchParams.get("userId") || "u";
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
  if (url.pathname === "/api/join" && req.method === "POST") {
    const { roomId } = await req.json();
    if (!roomId)
      return bad("missing_room");
    const id = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(id);
    return stub.fetch(new Request(new URL("/do/new", req.url), { method: "POST" }));
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

// ../worker/src/do_room.ts
var RoomDO = class {
  state;
  env;
  clients;
  order;
  currentIdx;
  lastRP;
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = /* @__PURE__ */ new Map();
    this.order = [];
    this.currentIdx = 0;
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/do/new") && req.method === "POST")
      return new Response("ok", { status: 200 });
    if (url.pathname.endsWith("/do/thumb") && req.method === "POST") {
      const { userId, thumb } = await req.json();
      this.broadcastExcept(userId, JSON.stringify({ t: "opp_thumb", p: thumb }));
      return new Response("ok");
    }
    if (url.pathname.endsWith("/do/submit") && req.method === "POST") {
      const { userId, rp } = await req.json();
      this.lastRP = rp;
      this.broadcastExcept(userId, JSON.stringify({ t: "opp_result", p: rp }));
      this.advanceTurn();
      return new Response("ok");
    }
    if (req.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.handleSocket(server, url);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("not found", { status: 404 });
  }
  handleSocket(ws, url) {
    const roomId = url.pathname.split("/").pop();
    ws.accept();
    let userId = "anon-" + Math.random().toString(36).slice(2);
    let spectator = false;
    const send = (m) => ws.send(JSON.stringify(m));
    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.t === "join") {
          userId = msg.p.userId;
          spectator = !!msg.p.spectator;
          this.clients.set(userId, { ws, userId, spectator, rtcWanted: false });
          if (!spectator && !this.order.includes(userId))
            this.order.push(userId);
          send({ t: "joined", p: { roomId, you: userId, opp: this.order.find((u) => u !== userId), spectator } });
          this.notifyTurn();
        } else if (msg.t === "rtc_want") {
          const c = this.clients.get(userId);
          if (c)
            c.rtcWanted = !!msg.p.enable;
          this.broadcastExcept(userId, JSON.stringify({ t: "rtc_want", p: { from: userId, enable: !!msg.p.enable } }));
        } else if (msg.t === "rtc_offer") {
          this.broadcastExcept(userId, JSON.stringify({ t: "rtc_offer", p: { from: userId, sdp: msg.p.sdp } }));
        } else if (msg.t === "rtc_answer") {
          this.broadcastExcept(userId, JSON.stringify({ t: "rtc_answer", p: { from: userId, sdp: msg.p.sdp } }));
        } else if (msg.t === "rtc_ice") {
          this.broadcastExcept(userId, JSON.stringify({ t: "rtc_ice", p: { from: userId, candidate: msg.p.candidate } }));
        }
      } catch {
      }
    });
    ws.addEventListener("close", () => {
      this.clients.delete(userId);
      this.order = this.order.filter((u) => u !== userId);
      if (this.currentIdx >= this.order.length)
        this.currentIdx = 0;
      this.notifyTurn();
    });
  }
  notifyTurn() {
    if (this.order.length === 0)
      return;
    const current = this.order[this.currentIdx];
    for (const [uid, c] of this.clients) {
      if (uid === current && !c.spectator)
        c.ws.send(JSON.stringify({ t: "your_turn", p: { round_id: crypto.randomUUID() } }));
    }
  }
  advanceTurn() {
    if (this.order.length === 0)
      return;
    this.currentIdx = (this.currentIdx + 1) % this.order.length;
    this.notifyTurn();
  }
  broadcastExcept(userId, msg) {
    for (const [uid, c] of this.clients)
      if (uid !== userId)
        c.ws.send(msg);
  }
};

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

// .wrangler/tmp/bundle-hhW1rt/middleware-insertion-facade.js
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

// .wrangler/tmp/bundle-hhW1rt/middleware-loader.entry.ts
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
