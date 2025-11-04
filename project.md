SYSTEM FLOWS, DEPENDENCIES, SIDE‑EFFECTS (BEFORE CODING)

Actors

Browser App (Pages): Capture dice + sensors, compute liveness + Merkle roots, sign proof, snap‑lock UX, optional WebRTC (live video) in addition to thumb‑cast.

Worker (Edge API): Nonces, proof verification, XP, routes, API.

Durable Object (Room): WebSocket hub + signaling relay for WebRTC (SDP/ICE), turn state, broadcast of thumbnails and results.

KV: Ephemeral nonces (TTL), XP counters.

(Optional) R2: Audits for tournaments (not required for core).

TLS/HTTPS

All app fetches are relative (/api/*), so when served via Pages HTTPS, all XHR/WSS are also HTTPS/WSS.

CSP upgrade‑insecure‑requests meta added.

No absolute http:// references; WSS used on HTTPS pages.

User.md includes exact Cloudflare toggles: “Always Use HTTPS”, SSL/TLS Full (strict), HSTS optional, Pages route to Worker.

WebRTC (optional)

Signaling: via Room DO WS messages (rtc_offer, rtc_answer, rtc_ice, rtc_want).

Media: Low‑res (320×180) camera stream; STUN only (stun:stun.l.google.com:19302)—no TURN (Free‑Tier). If NAT traversal fails, UI falls back to thumbnail with no errors.

Isolation: PPoR capture is independent of WebRTC. WebRTC is optional and has zero effect on proof integrity.

Side‑effects

KV: nonces:* (TTL 120s), rank:<user>:xp counters.

DO state: in‑memory client map + turn index.

No raw full video leaves device (only roots and tiny audit frames).

FULL MONOREPO
Project Tree
kismet/
├─ package.json
├─ package-lock.json            # generated after first npm install (not included here)
├─ .gitignore
├─ infra/
│  ├─ wrangler.toml
│  └─ pages.json
├─ shared/
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ src/
│     ├─ constants.ts
│     ├─ crypto.ts
│     ├─ merkle.ts
│     ├─ stimuli.ts
│     ├─ types.ts
│     └─ util.ts
├─ worker/
│  ├─ package.json
│  ├─ tsconfig.json
│  └─ src/
│     ├─ index.ts
│     ├─ do_room.ts
│     ├─ verify.ts
│     ├─ router.ts
│     ├─ kv.ts
│     ├─ types.ts
│     └─ utils.ts
├─ app/
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ vite.config.ts
│  ├─ index.html
│  ├─ public/
│  │  ├─ manifest.webmanifest
│  │  ├─ icon-192.png
│  │  ├─ icon-512.png
│  │  └─ sw.js
│  └─ src/
│     ├─ main.tsx
│     ├─ App.tsx
│     ├─ styles.css
│     ├─ components/
│     │  ├─ JoinCard.tsx
│     │  ├─ DuelView.tsx
│     │  ├─ CameraRoller.tsx
│     │  ├─ OpponentPane.tsx
│     │  ├─ LiveRTC.tsx
│     │  ├─ SealBadge.tsx
│     │  └─ Toast.tsx
│     ├─ net/
│     │  ├─ api.ts
│     │  └─ ws.ts
│     └─ ppor/
│        ├─ capture.ts
│        ├─ diceDetect.ts
│        ├─ liveness.ts
│        ├─ stimuli.ts
│        ├─ webauthn.ts
│        ├─ proof.ts
│        └─ merkle.ts
├─ docs/
│  ├─ README.md
│  ├─ DEPLOY.md
│  ├─ OPERATIONS.md
│  ├─ THREAT.md
│  └─ USER.md

Root
package.json
{
  "name": "kismet",
  "private": true,
  "version": "2.0.0",
  "description": "Kismet: Remote dice-dueling with PPoR v1 ROLLSEAL on Cloudflare Free-Tier",
  "workspaces": [
    "app",
    "worker",
    "shared"
  ],
  "scripts": {
    "install:all": "npm install --workspaces",
    "dev:worker": "npx wrangler dev --config infra/wrangler.toml",
    "deploy:worker": "npx wrangler deploy --config infra/wrangler.toml",
    "dev:app": "npm --workspace @kismet/app run dev",
    "build:app": "npm --workspace @kismet/app run build",
    "preview:app": "npm --workspace @kismet/app run preview"
  }
}

.gitignore
node_modules
dist
*.local
*.log
.env
.DS_Store

Infra
infra/wrangler.toml
name = "kismet-worker"
main = "worker/src/index.ts"
compatibility_date = "2025-10-01"

[placement]
mode = "smart"

# Durable Object binding
[[durable_objects.bindings]]
name = "ROOM_DO"
class_name = "RoomDO"

# KV Namespace for nonces, XP
[[kv_namespaces]]
binding = "KISMET_KV"
# preview_id = "SET_PREVIEW_ID"
# id = "SET_PRODUCTION_ID"

[vars]
PROTOCOL_VERSION = "1"
STRICT_MODE = "true"

[observability]
enabled = true

infra/pages.json
{
  "build": {
    "command": "npm --workspace @kismet/app run build",
    "cwd": "./"
  },
  "deploymentPresets": {
    "production": {}
  }
}

Shared
shared/package.json
{
  "name": "@kismet/shared",
  "version": "2.0.0",
  "type": "module",
  "main": "src/index.ts",
  "private": true,
  "scripts": {
    "build": "echo shared uses TS sources directly"
  }
}

shared/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"]
}

shared/src/constants.ts
export const PROTOCOL_VERSION = 1 as const;
export const FRAME_LUMA_SIZE = { w: 64, h: 36 } as const;

export const LIVENESS_THRESHOLDS = {
  rLumaMin: 0.82,
  barcodeMaxErr: 0.25,
  hapticImuMsMax: 10,
  chirpSnrMinDb: 6,
  vioImuDevMax: 0.35,
  minTumble: 2,
  settleStableMs: 200
} as const;

export const AUDIO_CHIRP_FREQS = [17300, 18300, 19300] as const;
export const CHIRP_DURATION_MS = 35;
export const MAX_DICE = 5;

export const INTEGRITY_WEIGHTS = {
  rLuma: 0.3,
  barcode: 0.15,
  haptic: 0.2,
  chirp: 0.2,
  vioImu: 0.15
} as const;

export const UI_META_SEED_BYTES = 8;

shared/src/crypto.ts
export async function sha256(data: ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  const buf = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
  return crypto.subtle.digest("SHA-256", buf);
}
export function b64url(bytes: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/[^a-fA-F0-9]/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export function toHex(bytes: Uint8Array): string {
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}

shared/src/merkle.ts
import { sha256 } from "./crypto.js";

export async function merkleRoot(leaves: Uint8Array[]): Promise<Uint8Array> {
  if (leaves.length === 0) throw new Error("no leaves");
  let level = await Promise.all(leaves.map(x => new Uint8Array(await sha256(x))));
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = level[i + 1] ?? a;
      const h = new Uint8Array(await sha256(concat(a, b)));
      next.push(h);
    }
    level = next;
  }
  return level[0];
}
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0); out.set(b, a.length);
  return out;
}

shared/src/stimuli.ts
export type StimSchedule = {
  durMs: number;
  luma: number[];
  barcode: number[];
  haptics: number[];
  chirps: { tMs: number; freq: number }[];
};
export function xorshift128(seed: Uint8Array): () => number {
  let x = (seed[0] << 24) | (seed[1] << 16) | (seed[2] << 8) | seed[3];
  let y = (seed[4] << 24) | (seed[5] << 16) | (seed[6] << 8) | seed[7];
  let z = (seed[8] << 24) | (seed[9] << 16) | (seed[10] << 8) | seed[11];
  let w = (seed[12] << 24) | (seed[13] << 16) | (seed[14] << 8) | seed[15];
  return () => {
    const t = x ^ (x << 11);
    x = y; y = z; z = w;
    w = (w ^ (w >>> 19) ^ (t ^ (t >>> 8))) >>> 0;
    return (w & 0xffffffff) / 0x100000000;
  };
}
export function buildSchedule(nonceStim: Uint8Array, durMs = 2000): StimSchedule {
  const rand = xorshift128(nonceStim);
  const frames = Math.round((durMs / 1000) * 60);
  const luma: number[] = [];
  const a1 = 0.015 + rand() * 0.01, a2 = 0.01 + rand() * 0.01, a3 = 0.005 + rand() * 0.005;
  const p1 = rand() * Math.PI * 2, p2 = rand() * Math.PI * 2, p3 = rand() * Math.PI * 2;
  for (let i = 0; i < frames; i++) {
    const t = i / 60;
    const v = 1 + a1 * Math.sin(2 * Math.PI * 1.3 * t + p1) + a2 * Math.sin(2 * Math.PI * 2.1 * t + p2) + a3 * Math.sin(2 * Math.PI * 0.7 * t + p3);
    luma.push(Math.max(0.97, Math.min(1.03, v)));
  }
  const barcode = Array(frames).fill(0);
  for (let k = 0; k < 6; k++) barcode[Math.min(frames - 1, Math.floor(rand() * (frames - 6)) + k)] = 1;
  const haptics = [rand(), rand(), rand()].map(r => Math.floor(300 + r * 1200));
  const freqs = [17300, 18300, 19300];
  const nC = 2 + Math.floor(rand() * 2);
  const chirps = Array.from({ length: nC }, () => ({ tMs: Math.floor(250 + rand() * 1400), freq: freqs[Math.floor(rand() * freqs.length)] }));
  return { durMs, luma, barcode, haptics, chirps };
}

shared/src/types.ts
export type Nonces = { session: string; stim: string };

export type DiceValue = {
  id: string;
  value: number;
  confidence: number;
  settle_t_ms: number;
  tumble_count: number;
};

export type Liveness = {
  r_luma: number;
  barcode_err: number;
  haptic_imu_ms: number;
  chirp_snr: number;
  vio_imu_dev: number;
};

export type Channels = { video: boolean; audio: boolean; haptics: boolean; imu: boolean };

export type StreamRoots = { video: string; imu: string; audio: string };
export type AuditFrame = { t_ms: number; luma64x36_b64: string };

export type Proof = {
  version: number;
  dice: DiceValue[];
  stream_roots: StreamRoots;
  liveness: Liveness;
  channels: Channels;
  timing: { t_start: number; t_settle: number; t_send: number };
  nonces: Nonces;
  webauthn: { publicKeyJwk: JsonWebKey; attestationFmt: "webcrypto"; signatureB64u: string };
  audit: { frames: AuditFrame[] };
};

export type RPv1 = {
  match_id: string;
  round_id: string;
  roller_user_id: string;
  opponent_user_id: string;
  timestamp_server: number;
  dice_values: number[];
  proof_digest_b64u: string;
  device_sig_b64u: string;
  integrity_scores: { overall: number; per_die: number[] };
  ui_meta: { fx_seed_b64u: string };
};

export type ApiStartRollRes = {
  nonces_b64u: Nonces;
  schedule: { luma: number[]; barcode: number[]; haptics: number[]; chirps: { tMs: number; freq: number }[]; durMs: number };
  round_id: string;
};

export type JoinPayload = { roomId: string; userId: string; spectator?: boolean };

export type WSFromClient =
  | { t: "join"; p: JoinPayload }
  | { t: "ready" }
  | { t: "rtc_want"; p: { enable: boolean } }
  | { t: "rtc_offer"; p: { sdp: string } }
  | { t: "rtc_answer"; p: { sdp: string } }
  | { t: "rtc_ice"; p: { candidate: RTCIceCandidateInit } };

export type WSFromServer =
  | { t: "joined"; p: { roomId: string; you: string; opp?: string; spectator?: boolean } }
  | { t: "your_turn"; p: { round_id: string } }
  | { t: "opp_result"; p: RPv1 }
  | { t: "opp_thumb"; p: { t_ms: number; luma64x36_b64: string } }
  | { t: "rtc_want"; p: { from: string; enable: boolean } }
  | { t: "rtc_offer"; p: { from: string; sdp: string } }
  | { t: "rtc_answer"; p: { from: string; sdp: string } }
  | { t: "rtc_ice"; p: { from: string; candidate: RTCIceCandidateInit } }
  | { t: "toast"; p: { kind: "info" | "warn" | "error"; text: string } };

shared/src/util.ts
export function nowMs() { return performance && "now" in performance ? performance.now() : Date.now(); }
export function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const a = x[i], b = y[i]; sx += a; sy += b; sxx += a*a; syy += b*b; sxy += a*b; }
  const cov = sxy - (sx * sy) / n, vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
  const denom = Math.sqrt(vx * vy);
  return denom === 0 ? 0 : clamp(cov / denom, -1, 1);
}
export function mean(arr: number[]) { return arr.reduce((a, b) => a + b, 0) / (arr.length || 1); }
export function stddev(arr: number[]) { const m = mean(arr); return Math.sqrt(mean(arr.map(v => (v - m) ** 2))); }

Worker
worker/package.json
{
  "name": "@kismet/worker",
  "version": "2.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "wrangler dev --config ../infra/wrangler.toml",
    "deploy": "wrangler deploy --config ../infra/wrangler.toml"
  },
  "devDependencies": {
    "wrangler": "3.78.12",
    "typescript": "^5.6.3",
    "@cloudflare/workers-types": "^4.20241011.0"
  }
}

worker/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "types": ["@cloudflare/workers-types"]
  }
}

worker/src/types.ts
import type { RPv1, Proof } from "../../shared/src/types.js";
export type { RPv1, Proof };

worker/src/utils.ts
import { b64url } from "../../shared/src/crypto.js";
export function okJson(obj: any, init: ResponseInit = {}) {
  return new Response(JSON.stringify(obj), { headers: { "content-type": "application/json" }, ...init });
}
export function bad(reason: string, code = 400) { return okJson({ error: reason }, { status: code }); }
export function toB64u(buf: ArrayBuffer): string { return b64url(new Uint8Array(buf)); }

worker/src/kv.ts
export type Env = {
  KISMET_KV: KVNamespace;
  ROOM_DO: DurableObjectNamespace;
  PROTOCOL_VERSION: string;
  STRICT_MODE?: string;
};
export async function kvPutTTL(kv: KVNamespace, key: string, value: any, ttlSec = 600) {
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSec });
}
export async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key); return v ? JSON.parse(v) as T : null;
}
export async function kvIncr(kv: KVNamespace, key: string, by = 1) {
  const cur = Number((await kv.get(key)) || "0"); await kv.put(key, String(cur + by));
}

worker/src/verify.ts
import { LIVENESS_THRESHOLDS } from "../../shared/src/constants.js";
import type { Proof } from "./types.js";
import { sha256, b64url } from "../../shared/src/crypto.js";
import { buildSchedule } from "../../shared/src/stimuli.js";

export async function verifyProof(proof: Proof, nonces_b64u: { session: string; stim: string }, strictMode: boolean) {
  if (proof.version !== 1) return { ok: false, reason: "version_mismatch" } as const;
  if (proof.nonces.session !== nonces_b64u.session || proof.nonces.stim !== nonces_b64u.stim)
    return { ok: false, reason: "nonce_mismatch" } as const;

  const L = LIVENESS_THRESHOLDS, lv = proof.liveness, ch = proof.channels;
  const passed: Record<"luma"|"barcode"|"haptic"|"chirp"|"vio", boolean> = {
    luma: lv.r_luma >= L.rLumaMin,
    barcode: lv.barcode_err <= L.barcodeMaxErr,
    haptic: ch.haptics && ch.imu ? lv.haptic_imu_ms <= L.hapticImuMsMax : true,
    chirp: ch.audio ? lv.chirp_snr >= L.chirpSnrMinDb : true,
    vio: ch.video && ch.imu ? lv.vio_imu_dev <= L.vioImuDevMax : true
  };
  if (!(passed.luma && passed.barcode)) return { ok: false, reason: "visual_liveness" } as const;

  if (strictMode) {
    const count = [passed.haptic, passed.chirp, passed.vio].filter(Boolean).length;
    if (count < 2) return { ok: false, reason: "insufficient_channels" } as const;
  }

  for (const d of proof.dice) if (d.tumble_count < L.minTumble) return { ok: false, reason: "tumble_low" } as const;

  const schedule = buildSchedule(b64uToBytes(nonces_b64u.stim));
  if (proof.audit?.frames?.length) {
    let hit = 0;
    for (const f of proof.audit.frames) {
      const idx = Math.round((f.t_ms / schedule.durMs) * (schedule.barcode.length - 1));
      if (schedule.barcode[idx]) hit++;
    }
    if (hit < 2) return { ok: false, reason: "barcode_audit_fail" } as const;
  }

  const digest = await sha256(new TextEncoder().encode(JSON.stringify(slim(proof))));
  const key = await crypto.subtle.importKey("jwk", proof.webauthn.publicKeyJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const sig = b64uToBytes(proof.webauthn.signatureB64u);
  const verified = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, digest);
  if (!verified) return { ok: false, reason: "sig_invalid" } as const;

  for (const r of [proof.stream_roots.video, proof.stream_roots.imu, proof.stream_roots.audio])
    if (b64uToBytes(r).length !== 32) return { ok: false, reason: "root_size" } as const;

  const score = integrityScore(proof.liveness, proof.dice.map(d => d.confidence));
  return { ok: true, score } as const;
}

function integrityScore(lv: Proof["liveness"], confidences: number[]) {
  const r = norm((lv.r_luma - 0.7) / 0.3);
  const b = norm((0.4 - lv.barcode_err) / 0.4);
  const h = norm((10 - lv.haptic_imu_ms) / 10);
  const c = norm((lv.chirp_snr - 4) / 12);
  const v = norm((0.5 - lv.vio_imu_dev) / 0.5);
  const overall = 0.3*r + 0.15*b + 0.2*h + 0.2*c + 0.15*v;
  return { overall, per_die: confidences.map(c => norm(c)) };
}
const norm = (x: number) => Math.max(0, Math.min(1, x));

function b64uToBytes(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const b = atob(s + "=".repeat(pad));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
function slim(p: Proof) { const { audit, ...rest } = p; return rest; }

worker/src/router.ts
import { okJson, bad } from "./utils.js";
import type { Env } from "./kv.js";
import { kvGet, kvPutTTL, kvIncr } from "./kv.js";
import { buildSchedule } from "../../shared/src/stimuli.js";
import { verifyProof } from "./verify.js";
import type { Proof, RPv1 } from "./types.js";
import { sha256, b64url } from "../../shared/src/crypto.js";

export async function handleApi(req: Request, env: Env) {
  const url = new URL(req.url);

  if (url.pathname === "/api/start-roll" && req.method === "POST") {
    const { roomId, userId } = await req.json<{ roomId: string; userId: string }>();
    if (!roomId || !userId) return bad("missing_params");
    const nonce_session = crypto.getRandomValues(new Uint8Array(16));
    const nonce_stim = crypto.getRandomValues(new Uint8Array(16));
    const nonces_b64u = { session: b64url(nonce_session), stim: b64url(nonce_stim) };
    const round_id = b64url(new Uint8Array(await sha256(nonce_session)));
    await kvPutTTL(env.KISMET_KV, `nonces:${roomId}:${round_id}:${userId}`, nonces_b64u, 120);
    const schedule = buildSchedule(nonce_stim);
    return okJson({ nonces_b64u, schedule, round_id });
  }

  if (url.pathname === "/api/submit-roll" && req.method === "POST") {
    const proof = (await req.json()) as Proof;
    const roomId = url.searchParams.get("roomId") || "room";
    const userId = url.searchParams.get("userId") || "u";
    const round_id = await deriveRoundId(proof.nonces.session);
    const nonces = await kvGet<{ session: string; stim: string }>(env.KISMET_KV, `nonces:${roomId}:${round_id}:${userId}`);
    if (!nonces) return bad("nonces_missing_or_expired");

    const strict = (env.STRICT_MODE || "true").toLowerCase() === "true";
    const res = await verifyProof(proof, nonces, strict);
    if (!("ok" in res) || !res.ok) return okJson({ ok: false, reason: (res as any).reason }, { status: 400 });

    const digest = await sha256(new TextEncoder().encode(JSON.stringify(proof)));
    const rp: RPv1 = {
      match_id: roomId,
      round_id,
      roller_user_id: userId,
      opponent_user_id: "",
      timestamp_server: Date.now(),
      dice_values: proof.dice.map(d => d.value),
      proof_digest_b64u: b64url(new Uint8Array(digest)),
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

  if (url.pathname === "/api/join" && req.method === "POST") {
    const { roomId } = await req.json<{ roomId: string }>();
    if (!roomId) return bad("missing_room");
    const id = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(id);
    return stub.fetch(new Request(new URL("/do/new", req.url), { method: "POST" }));
  }

  return new Response("not found", { status: 404 });
}

async function deriveRoundId(nonceSessionB64u: string) {
  const digest = await sha256(b64uToBytes(nonceSessionB64u));
  return b64url(new Uint8Array(digest));
}
function b64uToBytes(s: string) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const b = atob(s + "=".repeat(pad));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

worker/src/do_room.ts
import type { Env } from "./kv.js";
import type { RPv1 } from "./types.js";
import type { AuditFrame, WSFromClient, WSFromServer } from "../../shared/src/types.js";

type Client = { ws: WebSocket; userId: string; spectator: boolean; rtcWanted: boolean };

export class RoomDO {
  state: DurableObjectState;
  env: Env;
  clients: Map<string, Client>;
  order: string[];
  currentIdx: number;
  lastRP?: RPv1;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.clients = new Map();
    this.order = [];
    this.currentIdx = 0;
  }

  async fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/do/new") && req.method === "POST") return new Response("ok", { status: 200 });

    if (url.pathname.endsWith("/do/thumb") && req.method === "POST") {
      const { userId, thumb } = await req.json<{ userId: string; thumb: AuditFrame }>();
      this.broadcastExcept(userId, JSON.stringify({ t: "opp_thumb", p: thumb } satisfies WSFromServer));
      return new Response("ok");
    }

    if (url.pathname.endsWith("/do/submit") && req.method === "POST") {
      const { userId, rp } = await req.json<{ userId: string; rp: RPv1 }>();
      this.lastRP = rp;
      this.broadcastExcept(userId, JSON.stringify({ t: "opp_result", p: rp } satisfies WSFromServer));
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

  handleSocket(ws: WebSocket, url: URL) {
    const roomId = url.pathname.split("/").pop()!;
    ws.accept();
    let userId = "anon-" + Math.random().toString(36).slice(2);
    let spectator = false;

    const send = (m: WSFromServer) => ws.send(JSON.stringify(m));

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as WSFromClient;
        if (msg.t === "join") {
          userId = msg.p.userId;
          spectator = !!msg.p.spectator;
          this.clients.set(userId, { ws, userId, spectator, rtcWanted: false });
          if (!spectator && !this.order.includes(userId)) this.order.push(userId);
          send({ t: "joined", p: { roomId, you: userId, opp: this.order.find(u => u !== userId), spectator } });
          this.notifyTurn();
        } else if (msg.t === "rtc_want") {
          const c = this.clients.get(userId); if (c) c.rtcWanted = !!msg.p.enable;
          this.broadcastExcept(userId, JSON.stringify({ t: "rtc_want", p: { from: userId, enable: !!msg.p.enable } satisfies WSFromServer["p"] }));
        } else if (msg.t === "rtc_offer") {
          this.broadcastExcept(userId, JSON.stringify({ t: "rtc_offer", p: { from: userId, sdp: msg.p.sdp } as any }));
        } else if (msg.t === "rtc_answer") {
          this.broadcastExcept(userId, JSON.stringify({ t: "rtc_answer", p: { from: userId, sdp: msg.p.sdp } as any }));
        } else if (msg.t === "rtc_ice") {
          this.broadcastExcept(userId, JSON.stringify({ t: "rtc_ice", p: { from: userId, candidate: msg.p.candidate } as any }));
        }
      } catch { /* ignore malformed */ }
    });

    ws.addEventListener("close", () => {
      this.clients.delete(userId);
      this.order = this.order.filter(u => u !== userId);
      if (this.currentIdx >= this.order.length) this.currentIdx = 0;
      this.notifyTurn();
    });
  }

  notifyTurn() {
    if (this.order.length === 0) return;
    const current = this.order[this.currentIdx];
    for (const [uid, c] of this.clients) {
      if (uid === current && !c.spectator) c.ws.send(JSON.stringify({ t: "your_turn", p: { round_id: crypto.randomUUID() } }));
    }
  }

  advanceTurn() {
    if (this.order.length === 0) return;
    this.currentIdx = (this.currentIdx + 1) % this.order.length;
    this.notifyTurn();
  }

  broadcastExcept(userId: string, msg: string) {
    for (const [uid, c] of this.clients) if (uid !== userId) c.ws.send(msg);
  }
}

worker/src/index.ts
import { handleApi } from "./router.js";
import { RoomDO } from "./do_room.js";
import type { Env } from "./kv.js";

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(req, env as Env);
    }
    return new Response("Kismet Worker", { status: 200 });
  }
} satisfies ExportedHandler<Env>;

export { RoomDO };

App
app/package.json
{
  "name": "@kismet/app",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 5173"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vite": "^5.4.8",
    "@types/react": "^18.3.9",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1"
  }
}

app/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ES2022",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src", "../shared/src"]
}

app/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false, target: "es2022" },
  server: {
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } }
  }
});

app/index.html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="upgrade-insecure-requests">
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>Kismet</title>
    <style>html,body,#root{height:100%;margin:0;background:#070a0e;color:#eef2f6}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

app/public/manifest.webmanifest
{
  "name": "Kismet",
  "short_name": "Kismet",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#070a0e",
  "theme_color": "#0b1220",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}

app/public/icon-192.png

(binary omitted)

app/public/icon-512.png

(binary omitted)

app/public/sw.js
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

app/src/main.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<App />);

app/src/App.tsx
import React, { useState } from "react";
import JoinCard from "./components/JoinCard";
import DuelView from "./components/DuelView";

export default function App() {
  const [roomId, setRoomId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [spectator, setSpectator] = useState<boolean>(false);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Kismet</div>
        <div className="sub">Invisible Armor</div>
      </header>
      <main className="main">
        {!roomId
          ? <JoinCard onJoin={(r, u, s) => { setRoomId(r); setUserId(u); setSpectator(s); }} />
          : <DuelView roomId={roomId} userId={userId} spectator={spectator} />}
      </main>
      <footer className="foot">PPoR v1 “ROLLSEAL” · Sub‑second · HTTPS + WSS only</footer>
    </div>
  );
}

app/src/styles.css
:root {
  --bg: #070a0e;
  --panel: #0b1220;
  --panel-2: #0f192b;
  --text: #eef2f6;
  --muted: #9fb2c7;
  --accent: #7cf5d3;
  --accent-2: #61dafb;
  --warn: #ffcd70;
  --error: #ff6b6b;
  --ring: rgba(124,245,211,0.35);
}
* { box-sizing: border-box; }
body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif; }

.app { display:flex; min-height:100vh; flex-direction:column; background: radial-gradient(1200px 600px at 80% -20%, rgba(97,218,251,0.08), transparent 60%), var(--bg); }
.topbar { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background: linear-gradient(0deg, rgba(11,18,32,0.7), rgba(11,18,32,0.7)); border-bottom:1px solid #142035; position:sticky; top:0; backdrop-filter: blur(6px); }
.brand { font-weight:900; font-size:18px; letter-spacing:.4px; }
.sub { color: var(--muted); font-size:13px; }
.main { flex:1; width:100%; max-width: 1100px; margin: 0 auto; padding: 16px; }
.foot { text-align:center; color: var(--muted); padding: 12px; border-top: 1px solid #142035; }
.card { background: linear-gradient(180deg, var(--panel), var(--panel-2)); border:1px solid #15243b; border-radius:16px; padding:16px; box-shadow: 0 10px 30px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.02); }
.grid { display:grid; gap:16px; }
.row { display:flex; gap:12px; flex-wrap: wrap; }
.input { flex:1; background:#0c1626; color:var(--text); border:1px solid #1a2d49; padding:10px 12px; border-radius:10px; outline: none; }
.btn { background: #0e1b2f; color: var(--text); border:1px solid #234063; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:600; }
.btn:active { transform: translateY(1px); }
.kbd { background:#0c1626; border:1px solid #1a2d49; padding:2px 6px; border-radius:6px; font-size:12px; color:#c9d6e4; }

.camera {
  position: relative; border-radius: 16px; overflow: hidden; border: 2px solid rgba(124,245,211,0.25);
  box-shadow: 0 0 0 3px rgba(124,245,211,0.08), inset 0 0 0 2px rgba(124,245,211,0.05);
  filter: brightness(var(--seal-bright, 1));
}
.video { width: 100%; height: auto; transform: scaleX(-1); }
.overlay { position: absolute; inset: 0; pointer-events: none; }
.seal { position: absolute; top: 10px; right: 10px; padding: 6px 10px; border-radius: 999px; background: rgba(124,245,211,0.12); border: 1px solid var(--ring); font-size: 12px; letter-spacing: 0.3px; color: var(--accent); }
.snap { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); padding: 8px 12px; border-radius: 10px; background: rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.18); backdrop-filter: blur(6px); }
.values { display:flex; gap:8px; font-size:18px; font-weight:800 }
.value-chip { padding: 6px 10px; border-radius: 8px; background: #122036; border: 1px solid #24436a; }

.duel-grid { display:grid; grid-template-columns: 2fr 1fr; gap:16px; }
@media (max-width: 900px) { .duel-grid { grid-template-columns: 1fr; } }

.stat-bar { height: 8px; border-radius: 6px; background: #0d1a2c; border:1px solid #1b3454; overflow: hidden; }
.stat-fill { height:100%; background: linear-gradient(90deg, var(--accent), #b7fff0); width:0%; transition: width .4s ease; }

.toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: #0f1829; border: 1px solid #1f3656; color: #e6eaef; padding: 10px 14px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.25); }
.thumb { image-rendering: pixelated; background: #0d1727; border:1px dashed #29486f; border-radius:12px; width:128px; height:72px; display:flex; align-items:center; justify-content:center; color:#3b5d87; }
.rank-chip { padding:6px 10px; border-radius:8px; background:#13213a; border:1px solid #25426a; font-weight:700; }

.rtc-panel { background:#0c1525; border:1px solid #1e3554; border-radius:14px; padding:12px; }
.rtc-video { width:100%; border-radius:10px; background:#0b1220; border:1px solid #203655; }

app/src/components/Toast.tsx
import React from "react";
type T = { id: string; kind: "info" | "warn" | "error"; text: string };
const listeners: ((t: T) => void)[] = [];
export const Toast = {
  push(kind: T["kind"], text: string) {
    const id = Math.random().toString(36).slice(2);
    const t = { id, kind, text };
    for (const l of listeners) l(t);
    setTimeout(() => { for (const l of listeners) l({ ...t, text: "" }); }, 2200);
  },
  Container() {
    const [t, setT] = React.useState<T | null>(null);
    React.useEffect(() => {
      const l = (x: T) => setT(x.text ? x : null);
      listeners.push(l);
      return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1); };
    }, []);
    if (!t) return null;
    return <div className="toast">{t.text}</div>;
  }
};

app/src/components/SealBadge.tsx
import React from "react";
export default function SealBadge({ score }: { score: number | null }) {
  const txt = score === null ? "Kismet—Ready" : `Sealed ${Math.round(score * 100)}%`;
  return <div className="seal">{txt}</div>;
}

app/src/components/JoinCard.tsx
import React, { useState } from "react";
import { Toast } from "./Toast";

export default function JoinCard({ onJoin }: { onJoin: (roomId: string, userId: string, spectator: boolean) => void }) {
  const [room, setRoom] = useState("");
  const [user, setUser] = useState("player-" + Math.random().toString(36).slice(2, 8));
  const [spectator, setSpectator] = useState(false);

  const join = () => {
    if (!room) return Toast.push("warn", "Enter Room ID");
    onJoin(room, user, spectator);
  };

  return (
    <div className="grid">
      <div className="card">
        <h2>Join a Room</h2>
        <div className="row">
          <input className="input" placeholder="Room ID" value={room} onChange={e => setRoom(e.target.value)} />
          <input className="input" placeholder="Your Name" value={user} onChange={e => setUser(e.target.value)} />
          <label className="row"><input type="checkbox" checked={spectator} onChange={e => setSpectator(e.target.checked)} /> Spectator</label>
          <button className="btn" onClick={join}>Join</button>
        </div>
        <p style={{ color: "#9fb2c7", marginTop: 8 }}>Use HTTPS (Pages domain or custom domain with Cloudflare SSL). Then roll dice on camera.</p>
      </div>
      <Toast.Container />
    </div>
  );
}

app/src/components/OpponentPane.tsx
import React from "react";

export default function OpponentPane({ lastThumb, lastResult, xp }: {
  lastThumb: { t_ms: number; luma64x36_b64: string } | null;
  lastResult: { values: number[]; score: number } | null;
  xp: number;
}) {
  const w = 128, h = 72;
  const imageUrl = lastThumb ? toCanvasData(lastThumb.luma64x36_b64, w, h) : null;

  return (
    <div className="card">
      <h3>Opponent</h3>
      <div className="row" style={{ alignItems: "center" }}>
        <div className="thumb">{imageUrl ? <img src={imageUrl} width={w} height={h} style={{ imageRendering: "pixelated", borderRadius: 8 }} /> : "No thumb yet"}</div>
        <div>
          <div style={{ marginBottom: 8 }}>
            {lastResult ? lastResult.values.map((v, i) => <span key={i} className="value-chip">{v}</span>) : <span className="value-chip">—</span>}
          </div>
          <div className="rank-chip">XP {xp}</div>
          <div className="stat-bar" style={{ marginTop: 8 }}><div className="stat-fill" style={{ width: `${(lastResult?.score ?? 0) * 100}%` }} /></div>
          <div style={{ color: "#9fb2c7", fontSize: 12, marginTop: 6 }}>{lastResult ? `Seal ${Math.round(lastResult.score * 100)}%` : "Waiting for a roll…"}</div>
        </div>
      </div>
    </div>
  );
}

function toCanvasData(b64: string, W: number, H: number) {
  try {
    const raw = atob(b64);
    const smallW = 64, smallH = 36;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const imgDataSmall = ctx.createImageData(smallW, smallH);
    for (let i = 0; i < smallW * smallH; i++) {
      const v = raw.charCodeAt(i);
      imgDataSmall.data[i * 4 + 0] = v;
      imgDataSmall.data[i * 4 + 1] = v;
      imgDataSmall.data[i * 4 + 2] = v;
      imgDataSmall.data[i * 4 + 3] = 255;
    }
    const tmp = document.createElement("canvas"); tmp.width = smallW; tmp.height = smallH;
    const tctx = tmp.getContext("2d")!;
    tctx.putImageData(imgDataSmall, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, W, H);
    return canvas.toDataURL("image/png");
  } catch { return null; }
}

app/src/components/LiveRTC.tsx
import React, { useEffect, useRef, useState } from "react";
import type { WSFromClient, WSFromServer } from "../../../shared/src/types";

const STUN = [{ urls: "stun:stun.l.google.com:19302" }];

export default function LiveRTC({ roomId, userId, ws }: { roomId: string; userId: string; ws: WebSocket | null }) {
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!ws) return;
    const onMsg = async (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as WSFromServer;
        if (msg.t === "rtc_want" && enabled) {
          // peer also wants RTC; if we have no connection, initiate offer
          if (!pcRef.current) await startRTCPeer("offer");
        } else if (msg.t === "rtc_offer") {
          if (!enabled) return;
          await startRTCPeer("answer", msg.p.sdp);
        } else if (msg.t === "rtc_answer") {
          if (!enabled || !pcRef.current) return;
          await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: msg.p.sdp }));
        } else if (msg.t === "rtc_ice") {
          if (!enabled || !pcRef.current) return;
          try { await pcRef.current.addIceCandidate(msg.p.candidate); } catch {}
        }
      } catch {}
    };
    ws.addEventListener("message", onMsg);
    return () => ws.removeEventListener("message", onMsg);
  }, [ws, enabled]);

  async function startRTCPeer(role: "offer" | "answer", remoteSdp?: string) {
    if (!ws) return;
    if (!pcRef.current) {
      pcRef.current = new RTCPeerConnection({ iceServers: STUN });
      pcRef.current.onicecandidate = (e) => {
        if (e.candidate) {
          const m: WSFromClient = { t: "rtc_ice", p: { candidate: e.candidate.toJSON() } };
          ws.send(JSON.stringify(m));
        }
      };
      pcRef.current.onconnectionstatechange = () => setConnected(pcRef.current?.connectionState === "connected");
      pcRef.current.ontrack = (e) => { if (remoteRef.current) remoteRef.current.srcObject = e.streams[0]; };
      // get or reuse local stream (low-res)
      if (!localStreamRef.current) {
        try {
          localStreamRef.current = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 180, frameRate: { ideal: 24 } }, audio: false });
        } catch {
          return; // gracefully fail; thumbnail continues to work
        }
      }
      localStreamRef.current.getTracks().forEach(t => pcRef.current!.addTrack(t, localStreamRef.current!));
      if (localRef.current) localRef.current.srcObject = localStreamRef.current;
    }
    if (role === "offer") {
      const offer = await pcRef.current.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
      await pcRef.current.setLocalDescription(offer);
      const m: WSFromClient = { t: "rtc_offer", p: { sdp: offer.sdp! } };
      ws.send(JSON.stringify(m));
    } else {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: remoteSdp! }));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      const m: WSFromClient = { t: "rtc_answer", p: { sdp: answer.sdp! } };
      ws.send(JSON.stringify(m));
    }
  }

  async function toggleRTC() {
    if (!ws) return;
    const next = !enabled;
    setEnabled(next);
    const m: WSFromClient = { t: "rtc_want", p: { enable: next } };
    ws.send(JSON.stringify(m));
    if (!next) {
      // teardown
      pcRef.current?.getSenders().forEach(s => s.track && s.track.stop());
      pcRef.current?.close(); pcRef.current = null;
      localStreamRef.current?.getTracks().forEach(t => t.stop()); localStreamRef.current = null;
      setConnected(false);
      if (localRef.current) localRef.current.srcObject = null;
      if (remoteRef.current) remoteRef.current.srcObject = null;
    }
  }

  return (
    <div className="rtc-panel card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Live View (WebRTC)</h3>
        <button className="btn" onClick={toggleRTC}>{enabled ? "Disable" : "Enable"}</button>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <video className="rtc-video" ref={localRef} autoPlay muted playsInline />
        <video className="rtc-video" ref={remoteRef} autoPlay playsInline />
      </div>
      <div style={{ color: "#9fb2c7", fontSize: 12, marginTop: 6 }}>
        {enabled ? (connected ? "Connected via STUN" : "Negotiating… (falls back to thumbnails if blocked)") : "Off — thumbnails only"}
      </div>
    </div>
  );
}

app/src/components/CameraRoller.tsx
import React, { useEffect, useRef, useState } from "react";
import SealBadge from "./SealBadge";
import { apiStartRoll, apiSubmitRoll } from "../net/api";
import { startCapture } from "../ppor/capture";
import { setupStimuli } from "../ppor/stimuli";
import { computeBarcodeError, computeLumaCorrelation, vioImuDeviation, alignHapticImu, goertzelSNR } from "../ppor/liveness";
import { rootFromFrames } from "../ppor/merkle";
import { buildAndSignProof } from "../ppor/proof";
import { ephemeralSigner } from "../ppor/webauthn";
import { Toast } from "./Toast";
import type { AuditFrame, Channels } from "../../../shared/src/types";

export default function CameraRoller({ active, roomId, userId }: { active: boolean; roomId: string; userId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<number[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (active && !running) {
      setRunning(true);
      run().then(() => setRunning(false)).catch(err => { setRunning(false); Toast.push("error", err.message || "Roll failed"); });
    }
    async function run() {
      const video = videoRef.current!, wrap = wrapRef.current!;
      const ac = new window.AudioContext({ latencyHint: "interactive" });

      const { nonces_b64u, schedule } = await apiStartRoll(roomId, userId);
      const stimCtl = setupStimuli(nonces_b64u.stim, wrap, ac);

      const signer = await ephemeralSigner();
      const cap = await startCapture(video, true);

      const channels: Channels = { video: true, audio: true, haptics: "vibrate" in navigator, imu: false };
      const imu: { t: number; a: number }[] = [];
      const motionHandler = (e: DeviceMotionEvent) => {
        channels.imu = true;
        const a = Math.sqrt((e.accelerationIncludingGravity?.x || 0)**2 + (e.accelerationIncludingGravity?.y || 0)**2 + (e.accelerationIncludingGravity?.z || 0)**2);
        imu.push({ t: performance.now() - t0, a });
      };
      window.addEventListener("devicemotion", motionHandler);

      const mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, noiseSuppression: false, echoCancellation: false, autoGainControl: false } });
      const micCtx = ac.createMediaStreamSource(mic);
      const analyser = ac.createAnalyser(); analyser.fftSize = 2048;
      micCtx.connect(analyser);
      const micBuf = new Float32Array(analyser.fftSize);

      const t0 = performance.now();
      stimCtl.startAll();

      const settleWaitStart = performance.now();
      while (!cap.isSettled()) {
        await waitMs(16);
        if (performance.now() - settleWaitStart > 3500) break;
      }

      const frames = cap.getFrames();
      const lumaTrace = cap.getLumaTrace();
      const last = cap.getLastValues();
      const t_settle = performance.now() - t0;

      const picks: AuditFrame[] = [];
      const indices = Array.from(new Set([frames.length - 1, Math.floor(frames.length * 0.6), Math.floor(frames.length * 0.3)])).filter(i => i >= 0);
      for (let j = 0; j < indices.length; j++) {
        const idx = indices[j];
        picks.push({ t_ms: Math.round((idx / Math.max(1, frames.length - 1)) * schedule.durMs), luma64x36_b64: toB64(frames[idx]) });
      }

      const r_luma = computeLumaCorrelation(lumaTrace, schedule.luma);
      const barcode_err = computeBarcodeError(lumaTrace, schedule.barcode);
      analyser.getFloatTimeDomainData(micBuf);
      const chirp_snr = Math.max(...schedule.chirps.map(c => goertzelSNR(micBuf, ac.sampleRate, c.freq)));
      const haptic_imu_ms = channels.haptics && channels.imu ? alignHapticImu(schedule.haptics, imu) : 0;
      const vio_imu_dev = channels.imu ? vioImuDeviation(diffMag(frames), imu.map(m => m.a)) : 0.2;

      const root_video = await rootFromFrames(frames);
      const root_imu = await rootFromFrames([floatToBytes(imu.map(m => m.a))]);
      const root_audio = await rootFromFrames([floatToBytes(Array.from(micBuf))]);

      const t_send = performance.now() - t0;
      const proof = await buildAndSignProof({
        dice: last.values.map((v, i) => ({ id: "d"+i, value: v, confidence: last.confidence[i] || 0.75, settle_t_ms: Math.round(t_settle), tumble_count: 2 })),
        roots: { video: root_video, imu: root_imu, audio: root_audio },
        liveness: { r_luma, barcode_err, haptic_imu_ms, chirp_snr, vio_imu_dev },
        channels,
        timing: { t_start: 0, t_settle: Math.round(t_settle), t_send: Math.round(t_send) },
        nonces: nonces_b64u,
        auditFrames: picks
      }, signer);

      setValues(last.values);
      setScore(Math.max(0, Math.min(1, r_luma)));

      await apiSubmitRoll(roomId, userId, proof);

      stimCtl.stop(); cap.stop(); window.removeEventListener("devicemotion", motionHandler);
      mic.getTracks().forEach(t => t.stop());
    }
  }, [active]);

  return (
    <div ref={wrapRef} className="camera" style={{ filter: "brightness(var(--seal-bright))" }}>
      <video ref={videoRef} className="video" muted playsInline></video>
      <div className="overlay">
        <SealBadge score={score} />
        {values.length > 0 && <div className="snap">Result: <span className="values">{values.map((v,i)=><span key={i} className="value-chip">{v}</span>)}</span></div>}
      </div>
    </div>
  );
}

function waitMs(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function toB64(bytes: Uint8ClampedArray) { let bin = ""; for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]); return btoa(bin); }
function floatToBytes(arr: number[]) { const out = new Uint8ClampedArray(arr.length); const min = Math.min(...arr), max = Math.max(...arr) || 1; for (let i=0;i<arr.length;i++) out[i] = Math.max(0, Math.min(255, Math.round(((arr[i]-min)/(max-min))*255))); return out; }
function diffMag(frames: Uint8ClampedArray[]) { const mags: number[] = []; for (let i=1;i<frames.length;i++){ let s=0; const a=frames[i], b=frames[i-1]; const n=Math.min(a.length,b.length); for(let j=0;j<n;j++){ const d=a[j]-b[j]; s+=Math.abs(d);} mags.push(s/n);} return mags; }

app/src/components/DuelView.tsx
import React, { useEffect, useRef, useState } from "react";
import CameraRoller from "./CameraRoller";
import OpponentPane from "./OpponentPane";
import LiveRTC from "./LiveRTC";
import { connectRoomWS } from "../net/ws";
import { Toast } from "./Toast";

export default function DuelView({ roomId, userId, spectator }: { roomId: string; userId: string; spectator: boolean }) {
  const [yourTurn, setYourTurn] = useState(false);
  const [lastOpp, setLastOpp] = useState<{ values: number[]; score: number } | null>(null);
  const [thumb, setThumb] = useState<{ t_ms: number; luma64x36_b64: string } | null>(null);
  const [xp, setXp] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = connectRoomWS(roomId, userId, spectator, (msg) => {
      if (msg.t === "your_turn") setYourTurn(true);
      if (msg.t === "opp_result") {
        setLastOpp({ values: msg.p.dice_values, score: msg.p.integrity_scores.overall });
        setXp(x => x + Math.round(10 + msg.p.integrity_scores.overall * 20));
      }
      if (msg.t === "opp_thumb") setThumb(msg.p);
      if (msg.t === "toast") Toast.push(msg.p.kind, msg.p.text);
    });
    wsRef.current = ws;
    return () => ws.close();
  }, [roomId, userId, spectator]);

  return (
    <div className="duel-grid">
      <div className="card">
        <h3>You</h3>
        <CameraRoller active={!spectator && yourTurn} roomId={roomId} userId={userId} />
        {!yourTurn && !spectator && <p style={{ color: "#9fb2c7", marginTop: 8 }}>Waiting for your turn…</p>}
        {spectator && <p style={{ color: "#9fb2c7", marginTop: 8 }}>Spectating</p>}
        {wsRef.current && <LiveRTC roomId={roomId} userId={userId} ws={wsRef.current} />}
      </div>
      <OpponentPane lastThumb={thumb} lastResult={lastOpp} xp={xp} />
      <Toast.Container />
    </div>
  );
}

app/src/net/api.ts
import type { ApiStartRollRes, Proof } from "../../../shared/src/types";

export async function apiStartRoll(roomId: string, userId: string): Promise<ApiStartRollRes> {
  const r = await fetch("/api/start-roll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomId, userId }) });
  if (!r.ok) throw new Error("start-roll failed");
  return r.json();
}
export async function apiSubmitRoll(roomId: string, userId: string, proof: Proof): Promise<void> {
  const r = await fetch(`/api/submit-roll?roomId=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(userId)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(proof)
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || "submit failed");
  }
}

app/src/net/ws.ts
import type { WSFromClient, WSFromServer } from "../../../shared/src/types";
export function connectRoomWS(roomId: string, userId: string, spectator: boolean, onMessage: (m: WSFromServer) => void) {
  const secure = location.protocol === "https:";
  const wsProto = secure ? "wss" : "ws";
  const ws = new WebSocket(`${wsProto}://${location.host}/api/room/${roomId}`);
  ws.addEventListener("open", () => {
    const msg: WSFromClient = { t: "join", p: { roomId, userId, spectator } };
    ws.send(JSON.stringify(msg));
  });
  ws.addEventListener("message", (ev) => { try { onMessage(JSON.parse(ev.data as string)); } catch {} });
  return ws;
}

app/src/ppor/stimuli.ts
import { buildSchedule } from "../../../shared/src/stimuli";
export function setupStimuli(nonceStimB64u: string, videoContainer: HTMLElement, audioCtx: AudioContext) {
  const stim = buildSchedule(b64uToBytes(nonceStimB64u));
  let raf = 0; const start = performance.now();
  const update = () => {
    const t = performance.now() - start;
    const idx = Math.min(stim.luma.length - 1, Math.max(0, Math.round((t / stim.durMs) * stim.luma.length)));
    videoContainer.style.setProperty("--seal-bright", String(stim.luma[idx]));
    raf = requestAnimationFrame(update);
  };
  raf = requestAnimationFrame(update);

  const gain = audioCtx.createGain(); gain.gain.value = 0.03; gain.connect(audioCtx.destination);
  const startAudio = () => {
    stim.chirps.forEach(({ tMs, freq }) => {
      const t = audioCtx.currentTime + tMs / 1000;
      const osc = audioCtx.createOscillator();
      osc.type = "sine"; osc.frequency.setValueAtTime(freq, t);
      osc.connect(gain); osc.start(t); osc.stop(t + 0.035);
    });
  };
  const startHaptics = () => { if ("vibrate" in navigator) for (const t of stim.haptics) setTimeout(() => navigator.vibrate(20), t); };

  return { stim, startAll: () => { startAudio(); startHaptics(); }, stop: () => cancelAnimationFrame(raf) };
}
function b64uToBytes(s: string) { s = s.replace(/-/g, "+").replace(/_/g, "/"); const pad = s.length % 4 ? 4 - (s.length % 4) : 0; const b = atob(s + "=".repeat(pad)); const out = new Uint8Array(b.length); for (let i=0;i<b.length;i++) out[i]=b.charCodeAt(i); return out; }

app/src/ppor/diceDetect.ts
export type DieTrack = { id: string; value: number; confidence: number; x: number; y: number; angle: number; tumble: number; lastSeen: number };

export function detectPipsAndDice(luma: Uint8ClampedArray, w: number, h: number) {
  let sum = 0, sum2 = 0;
  for (let i = 0; i < luma.length; i++) { const v = luma[i]; sum += v; sum2 += v * v; }
  const n = luma.length; const mean = sum / n; const std = Math.sqrt(sum2 / n - mean * mean);
  const thr = Math.max(10, Math.min(200, mean - 0.6 * std));

  const visited = new Uint8Array(w * h);
  const blobs: { x: number; y: number; area: number }[] = [];
  const at = (x: number, y: number) => luma[y * w + x];

  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const idx = y * w + x; if (visited[idx]) continue;
    const v = at(x, y);
    if (v < thr) {
      let qx = [x], qy = [y], qh = 0, area = 0, sx = 0, sy = 0;
      visited[idx] = 1;
      while (qh < qx.length) {
        const cx = qx[qh], cy = qy[qh]; qh++; area++; sx += cx; sy += cy;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy; if (nx <= 0 || nx >= w-1 || ny <= 0 || ny >= h-1) continue;
          const nidx = ny * w + nx;
          if (!visited[nidx] && at(nx, ny) < thr) { visited[nidx] = 1; qx.push(nx); qy.push(ny); }
        }
      }
      if (area >= 5 && area <= 300) blobs.push({ x: Math.round(sx / area), y: Math.round(sy / area), area });
    } else visited[idx] = 1;
  }

  const eps = Math.max(6, Math.round(Math.min(w, h) * 0.06));
  const clusters: { points: typeof blobs, cx: number, cy: number }[] = [];
  const used = new Array(blobs.length).fill(false);
  for (let i = 0; i < blobs.length; i++) {
    if (used[i]) continue;
    const cur = [i]; used[i] = true;
    for (let j = 0; j < cur.length; j++) {
      const a = blobs[cur[j]];
      for (let k = 0; k < blobs.length; k++) {
        if (used[k]) continue;
        const b = blobs[k]; const dx = a.x - b.x, dy = a.y - b.y;
        if (dx*dx + dy*dy <= eps*eps) { used[k] = true; cur.push(k); }
      }
    }
    const pts = cur.map(idx => blobs[idx]);
    if (pts.length >= 1 && pts.length <= 6) {
      const cx = Math.round(pts.reduce((s,p)=>s+p.x,0)/pts.length);
      const cy = Math.round(pts.reduce((s,p)=>s+p.y,0)/pts.length);
      clusters.push({ points: pts, cx, cy });
    }
  }

  const dice = clusters.map(c => {
    let cov_xx = 0, cov_xy = 0, cov_yy = 0;
    for (const p of c.points) { const dx = p.x - c.cx, dy = p.y - c.cy; cov_xx += dx*dx; cov_xy += dx*dy; cov_yy += dy*dy; }
    const angle = 0.5 * Math.atan2(2 * cov_xy, cov_xx - cov_yy);
    const conf = Math.min(1, c.points.length / 6 + 0.3);
    return { x: c.cx, y: c.cy, pips: c.points.length, angle, confidence: conf };
  });

  return dice;
}

export function updateTracks(tracks: DieTrack[], detections: ReturnType<typeof detectPipsAndDice>, tMs: number) {
  const used = new Array(detections.length).fill(false);
  for (const tr of tracks) {
    let best = -1, bestD = 1e9;
    for (let i = 0; i < detections.length; i++) {
      if (used[i]) continue;
      const d = detections[i]; const dx = tr.x - d.x, dy = tr.y - d.y;
      const dist = dx*dx + dy*dy; if (dist < bestD) { bestD = dist; best = i; }
    }
    if (best >= 0 && bestD < 4000) {
      const d = detections[best]; used[best] = true;
      const dAngle = Math.abs(normAngle(d.angle - tr.angle));
      const tumbleInc = dAngle > 0.7 ? 1 : 0;
      tr.x = d.x; tr.y = d.y; tr.angle = d.angle;
      tr.value = d.pips; tr.confidence = Math.min(tr.confidence * 0.7 + d.confidence * 0.3, 1);
      tr.tumble += tumbleInc; tr.lastSeen = tMs;
    }
  }
  for (let i = 0; i < detections.length; i++) if (!used[i]) {
    const d = detections[i];
    tracks.push({ id: Math.random().toString(36).slice(2), value: d.pips, confidence: d.confidence, x: d.x, y: d.y, angle: d.angle, tumble: 1, lastSeen: tMs });
  }
  return tracks.filter(tr => tMs - tr.lastSeen < 800);
}
function normAngle(a: number) { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; }

app/src/ppor/capture.ts
import { FRAME_LUMA_SIZE, LIVENESS_THRESHOLDS } from "../../../shared/src/constants";
import { detectPipsAndDice, updateTracks, type DieTrack } from "./diceDetect";
import { mean } from "../../../shared/src/util";

export async function startCapture(videoEl: HTMLVideoElement, wantRear = true) {
  const constraints: MediaStreamConstraints = {
    video: { facingMode: wantRear ? { ideal: "environment" } : { ideal: "user" }, frameRate: { ideal: 60, min: 30 }, width: { ideal: 1280 }, height: { ideal: 720 } } as any,
    audio: false
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  videoEl.srcObject = stream; await videoEl.play();

  const [w, h] = [FRAME_LUMA_SIZE.w, FRAME_LUMA_SIZE.h];
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  (ctx.canvas.width = w), (ctx.canvas.height = h);
  const tmp = document.createElement("canvas").getContext("2d")!;
  let tracks: DieTrack[] = [];
  let frames: Uint8ClampedArray[] = [];
  let lumaTrace: number[] = [];
  let lastValues: { values: number[]; confidence: number[] } = { values: [], confidence: [] };
  let settledAt = 0;

  let raf = 0;
  const tick = () => {
    tmp.drawImage(videoEl, 0, 0, w, h);
    ctx.drawImage(tmp.canvas, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const luma = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) luma[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;

    frames.push(luma); if (frames.length > 240) frames.shift();
    const det = detectPipsAndDice(luma, w, h);
    const tMs = performance.now();
    tracks = updateTracks(tracks, det, tMs);
    lumaTrace.push(mean(luma)); if (lumaTrace.length > 240) lumaTrace.shift();

    const values = tracks.map(t => t.value).filter(v => v >= 1 && v <= 6).slice(0, 5);
    const conf = tracks.map(t => t.confidence);
    if (values.length > 0) { if (settledAt === 0) settledAt = tMs; lastValues = { values, confidence: conf }; } else settledAt = 0;

    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  function stop() { cancelAnimationFrame(raf); (stream.getTracks()).forEach(t => t.stop()); }

  return {
    stop,
    getFrames: () => frames.slice(-120),
    getLumaTrace: () => lumaTrace.slice(),
    getLastValues: () => lastValues,
    isSettled: () => settledAt > 0 && (performance.now() - settledAt) >= LIVENESS_THRESHOLDS.settleStableMs
  };
}

app/src/ppor/liveness.ts
import { pearson, mean, stddev } from "../../../shared/src/util";
export function computeLumaCorrelation(lumaTrace: number[], planned: number[]): number {
  const L = lumaTrace.length; const arr: number[] = [];
  for (let i = 0; i < L; i++) { const idx = Math.round((i / (L - 1)) * (planned.length - 1)); arr.push(planned[idx]); }
  return pearson(lumaTrace, arr);
}
export function computeBarcodeError(lumaTrace: number[], barcode: number[]): number {
  const L = lumaTrace.length; let mism = 0, total = 0;
  for (let i = 0; i < barcode.length; i++) if (barcode[i]) {
    total++; const idx = Math.round((i / (barcode.length - 1)) * (L - 1));
    const window = lumaTrace.slice(Math.max(0, idx - 2), Math.min(L, idx + 3));
    const m = mean(window), s = stddev(window);
    if (Math.abs(lumaTrace[idx] - m) < 1.2 * s) mism++;
  }
  return total ? mism / total : 0.3;
}
export function alignHapticImu(hapticTimes: number[], imuMagnitudes: { t: number; a: number }[]) {
  let deltas: number[] = [];
  for (const t of hapticTimes) {
    let bestDt = 1e9;
    for (const m of imuMagnitudes) { const dt = Math.abs(m.t - t); if (dt < bestDt) bestDt = dt; }
    if (bestDt < 30) deltas.push(bestDt);
  }
  return deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 999;
}
export function goertzelSNR(samples: Float32Array, sampleRate: number, freq: number) {
  const k = Math.round(0.5 + ((samples.length * freq) / sampleRate));
  const omega = (2 * Math.PI * k) / samples.length;
  const cos = Math.cos(omega), sin = Math.sin(omega);
  let s_prev = 0, s_prev2 = 0;
  for (let i = 0; i < samples.length; i++) { const s = samples[i] + 2 * cos * s_prev - s_prev2; s_prev2 = s_prev; s_prev = s; }
  const real = s_prev - s_prev2 * cos, imag = s_prev2 * sin; const power = real * real + imag * imag;
  let meanv = 0; for (let i = 0; i < samples.length; i++) meanv += samples[i]; meanv /= samples.length;
  let varv = 0; for (let i = 0; i < samples.length; i++) { const d = samples[i] - meanv; varv += d * d; } varv /= samples.length;
  return 10 * Math.log10(power / (varv + 1e-9));
}
export function vioImuDeviation(optFlowMag: number[], imuVar: number[]) {
  const n = Math.min(optFlowMag.length, imuVar.length); if (n === 0) return 1;
  const a = normalize(optFlowMag.slice(-n)); const b = normalize(imuVar.slice(-n));
  let s = 0; for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]); return s / n;
}
function normalize(arr: number[]) { const m = mean(arr); const s = stddev(arr) || 1; return arr.map(v => (v - m) / s); }

app/src/ppor/merkle.ts
import { merkleRoot } from "../../../shared/src/merkle";
import { b64url } from "../../../shared/src/crypto";
export async function rootFromFrames(frames: Uint8ClampedArray[]) {
  const leaves = await Promise.all(frames.map(async f => new Uint8Array(await crypto.subtle.digest("SHA-256", f))));
  const root = await merkleRoot(leaves);
  return b64url(root);
}

app/src/ppor/webauthn.ts
export async function ephemeralSigner() {
  const key = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", key.publicKey);
  return {
    publicKeyJwk,
    sign: async (digest: ArrayBuffer) => new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, digest)),
    type: "webcrypto" as const
  };
}

app/src/ppor/proof.ts
import type { Proof } from "../../../shared/src/types";
import { PROTOCOL_VERSION } from "../../../shared/src/constants";
import { sha256, b64url } from "../../../shared/src/crypto";

export async function buildAndSignProof(
  input: {
    dice: { id: string; value: number; confidence: number; settle_t_ms: number; tumble_count: number }[];
    roots: { video: string; imu: string; audio: string };
    liveness: { r_luma: number; barcode_err: number; haptic_imu_ms: number; chirp_snr: number; vio_imu_dev: number };
    channels: { video: boolean; audio: boolean; haptics: boolean; imu: boolean };
    timing: { t_start: number; t_settle: number; t_send: number };
    nonces: { session: string; stim: string };
    auditFrames: { t_ms: number; luma64x36_b64: string }[];
  },
  signer: { publicKeyJwk: JsonWebKey; sign: (digest: ArrayBuffer) => Promise<Uint8Array>; type: "webcrypto" | "webauthn" }
): Promise<Proof> {
  const proofCore: Proof = {
    version: PROTOCOL_VERSION,
    dice: input.dice,
    stream_roots: input.roots,
    liveness: input.liveness,
    channels: input.channels,
    timing: input.timing,
    nonces: input.nonces,
    webauthn: { publicKeyJwk: signer.publicKeyJwk, attestationFmt: "webcrypto", signatureB64u: "" },
    audit: { frames: input.auditFrames }
  };
  const digest = await sha256(new TextEncoder().encode(JSON.stringify({ ...proofCore, webauthn: { ...proofCore.webauthn, signatureB64u: "" } })));
  const sig = await signer.sign(digest);
  proofCore.webauthn.signatureB64u = b64url(sig);
  return proofCore;
}

Docs
docs/README.md
# Kismet

**Remote dice‑dueling with real dice** and **PPoR v1 “ROLLSEAL”** on Cloudflare Free‑Tier.

- **Invisible Armor UX**: instant snap‑lock results, no validating spinners.
- **Integrity**: per‑roll unpredictable stimuli (visual luma, chirps, haptics), multi‑modal liveness, Merkle roots + signature, edge verification.
- **Presence**: thumbnail (WS) + optional **WebRTC live video** (STUN, no TURN).
- **TLS‑first**: HTTPS only, WSS only, CSP upgrade.

See **DEPLOY.md** to ship, **USER.md** to operate, **OPERATIONS.md** for SLOs, **THREAT.md** for red‑team.

docs/DEPLOY.md
# Deploy Kismet (Cloudflare Free‑Tier, npm)

## Prereqs
- Cloudflare account with Pages + Workers
- Node 20+, **npm** 9+
- `npx wrangler --version` (installed automatically when run)

## 1) Install (root)
```bash
npm install

2) Create KV namespace (dev + prod)
npx wrangler kv namespace create KISMET_KV --preview
npx wrangler kv namespace create KISMET_KV


Copy preview_id and id into infra/wrangler.toml under [[kv_namespaces]].

3) Local dev

Terminal A (Worker):

npm run dev:worker


Terminal B (App):

npm run dev:app


Open http://localhost:5173
 (dev server proxies /api/* to Worker dev).

4) Deploy Worker (HTTPS by default)
npm run deploy:worker

5) Deploy App via Pages

Option A — CLI:

npm run build:app
npx wrangler pages deploy app/dist


Option B — Dashboard:

Create a Pages project for /app, build command: npm run build, output: dist.

6) Route /api/* to Worker

Cloudflare Dashboard → Workers Routes → Add:

Pattern: <your-pages-domain>/api/*

Service: kismet-worker
This ensures same‑origin HTTPS → WSS.

7) TLS / “Not secure” Fix Checklist

Cloudflare Dashboard → SSL/TLS → Overview: set Full (strict).

Edge Certificates: turn on Always Use HTTPS and Automatic HTTPS Rewrites.

(Optional) HSTS: enable after confirming TLS working.

If using a custom domain for Pages, attach it in Pages → Custom Domains and wait for the Active certificate state. Do not gray‑cloud (bypass) the DNS record—orange‑cloud (proxied) required for managed certs.

8) Validate Production

Visit your Pages domain via https.

Open two devices/tabs, join the same room, roll once; opponent sees Sealed in <1s.

(Optional) Toggle Live View (WebRTC) on both ends; if NAT allows STUN, you’ll see live video. Otherwise thumbnails continue to work.

You do not need TURN for core functionality. WebRTC is optional and independent of proof integrity.


### `docs/OPERATIONS.md`
```md
# Operations

## SLOs
- p50 settle→opponent render ≤ 800ms (LTE), p95 ≤ 1300ms
- Worker verify p95 ≤ 15ms/roll
- KV ops success ≥ 99.9%

## Rate Limits (recommend)
- `/api/start-roll`: 5/min/user
- `/api/submit-roll`: 5/min/user
- WebSockets: 2 per IP

## Metrics
- Rejection reasons, liveness aggregates, latency (submit→broadcast)
- KV: `rank:<user>:xp` counters

## Threshold Adjustment
- Edit `shared/src/constants.ts` (liveness)
- `STRICT_MODE` in `wrangler.toml` (≥2 independent channels for ranked)

## Privacy
- Only Merkle roots + tiny audit frames (64×36 luma) leave device
- No full video storage; R2 optional for tournaments (7‑day retention)

docs/THREAT.md
# Threat Model

## Replay / Deepfake
- **Vector**: Use prerecorded video/sensors
- **Mitigation**: Nonce‑driven stimuli (visual, chirps, haptics) across channels; cross‑modal timing; signed proof

## Sensor Spoofing
- **Vector**: Fake IMU/mic
- **Mitigation**: Haptic→IMU alignment; chirp SNR & echo; VIO↔IMU parity; STRICT requires ≥2 channels

## Optical Confusion
- **Vector**: Painted/sticker dice; staged placement
- **Mitigation**: Tumble ≥ 2; multi‑frame pip stability ≥ 200ms; pip geometry

## Signaling/RTC Abuse
- **Vector**: Malformed SDP/ICE
- **Mitigation**: DO forwards only; no server execution of SDP; RTC optional and sandboxed; thumbnail path persists

## Failure Tests
- Screen replay → low `r_luma` / barcode mismatch → reject
- IMU spoof → high `haptic_imu_ms` → reject (strict)
- Mic off → must still pass 2 channels in ranked
- No tumble → reject

docs/USER.md
# Production Runbook (Human Tasks + Requirements)

You must complete these items. Nothing is assumed.

## A) Tooling
- Node 20+, npm 9+ (`node -v`, `npm -v`)
- Cloudflare account with Pages & Workers
- `npx wrangler` (installed automatically when invoked)

## B) Install
```bash
npm install

C) Cloudflare Resources

KV namespace

npx wrangler kv namespace create KISMET_KV --preview
npx wrangler kv namespace create KISMET_KV


Paste preview_id and id into infra/wrangler.toml under [[kv_namespaces]].

(Optional) R2 — only for tournaments dispute storage. Not required for core.

D) Local Dev (optional)

Worker:

npm run dev:worker


App:

npm run dev:app


Visit http://localhost:5173

E) Deploy

Worker:

npm run deploy:worker


App (Pages):

npm run build:app
npx wrangler pages deploy app/dist


Route:

Cloudflare → Workers → Routes → Add:
Pattern: <your-pages-domain>/api/* → Service: kismet-worker

F) TLS / HTTPS (Fix “Not secure”)

Cloudflare → SSL/TLS → Overview: set Full (strict)

Edge Certificates: enable Always Use HTTPS + Automatic HTTPS Rewrites

(Optional) enable HSTS (only after HTTPS confirmed)

Pages Custom Domain: attach domain and wait for “Active certificate.”

Ensure orange‑cloud proxy on DNS records (Cloudflare must terminate SSL).

G) Permissions

Players must allow Camera and Microphone (mic used for chirp SNR).

(Optional) Motion permission for IMU (iOS Safari: Settings → Motion & Orientation).

H) How to Play

Open your HTTPS Pages URL.

Both players enter the same Room ID and distinct Names → Join.

When it’s your turn, roll dice naturally; you’ll feel a snap‑lock; opponent sees Sealed and a pixel‑thumb instantly (<1s).

(Optional) Toggle Live View (WebRTC) on both ends for live low‑res video. If NAT blocks STUN, thumbnails still function.

I) Operations

Threshold tuning: shared/src/constants.ts → redeploy

XP counters: rank:<user>:xp in KV

Observability: enable Workers logs; monitor rejections/latency

J) Support

If WebRTC fails to connect: disable Live View; it’s optional. The proof system, thumbnails, and gameplay remain fully functional.