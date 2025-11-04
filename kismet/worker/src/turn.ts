import type { Env } from "./kv.js";
import { kvGet, kvPutTTL } from "./kv.js";
import { okJson, bad } from "./utils.js";

// Cloudflare TURN: we generate short-lived credentials by calling CF API with
// TURN Token ID and API token (expected bound to environment as secrets).
// The external API returns username/credential; we relay plus static iceServers list.

type TurnApiResponse = { iceServers: { urls: string[]; username: string; credential: string }[] };
type CachedTurnEntry = { iceServers: TurnApiResponse["iceServers"]; expiresAt: number };

const DEFAULT_TTL_SECONDS = 1800; // 30 minutes balances churn vs. renegotiation
const CACHE_GRACE_MS = 15_000; // Refresh slightly before expiry to avoid serving stale creds
const RATE_LIMIT_WINDOW_SECONDS = 120;
const RATE_LIMIT_MAX_REQUESTS = 8;

function parseTtl(value: unknown): number {
  if (typeof value === "string" && value.trim().length) {
    const num = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(num) && num >= 60 && num <= 86400) return num;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const clamped = Math.max(60, Math.min(86400, Math.floor(value)));
    if (clamped) return clamped;
  }
  return DEFAULT_TTL_SECONDS;
}

function filterProblematicPorts(entry: TurnApiResponse["iceServers"][number]) {
  const filteredUrls = entry.urls.filter(url => !url.includes(":53"));
  return { ...entry, urls: filteredUrls.length ? filteredUrls : entry.urls };
}

export async function handleTurnRequest(req: Request, env: Env, context: { roomId: string; userId: string }): Promise<Response> {
  const tokenId = (env as any).TURN_TOKEN_ID as string | undefined;
  const apiToken = (env as any).TURN_API_TOKEN as string | undefined;
  if (!tokenId || !apiToken) return bad("turn_secrets_missing", 500);
  const ttl = parseTtl((env as any).TURN_TTL_SECONDS);
  const cached = await getCachedIceServers(env, tokenId);
  if (cached) {
    return okJson({ iceServers: cached });
  }
  const rateAllowed = await enforceRateLimit(env, req);
  if (!rateAllowed) return bad("turn_rate_limited", 429);
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${tokenId}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ ttl })
    });
    if (!r.ok) {
      const bodyText = await r.text().catch(() => "");
      console.error("[turn] Cloudflare API error", { status: r.status, body: bodyText.slice(0, 512), roomId: context.roomId, userId: context.userId });
      return bad("turn_api_error_" + r.status, r.status);
    }
    const data = await r.json<TurnApiResponse>().catch(() => null);
    if (!data || !Array.isArray(data.iceServers) || data.iceServers.length === 0) return bad("turn_parse_error", 500);
    const iceServers = data.iceServers.map(filterProblematicPorts);
    const cacheTtl = Math.max(30, Math.min(ttl - 30, ttl));
    await setCachedIceServers(env, tokenId, iceServers, cacheTtl);
    // Return Cloudflare list filtered for browser-incompatible ports. Keep shape consistent with WebRTC RTCConfiguration.
    return okJson({ iceServers });
  } catch (err: any) {
    console.error("[turn] fetch failed", { message: err?.message, roomId: context.roomId, userId: context.userId });
    return bad("turn_fetch_failed", 500);
  }
}

async function getCachedIceServers(env: Env, tokenId: string): Promise<TurnApiResponse["iceServers"] | null> {
  try {
    const cached = await kvGet<CachedTurnEntry>(env.KISMET_KV, cacheKey(tokenId));
    if (!cached) return null;
    if (cached.expiresAt - CACHE_GRACE_MS <= Date.now()) return null;
    return cached.iceServers;
  } catch (err: any) {
    console.error("[turn] cache read failed", { message: err?.message });
    return null;
  }
}

async function setCachedIceServers(env: Env, tokenId: string, iceServers: TurnApiResponse["iceServers"], ttlSeconds: number) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  try {
    await kvPutTTL(env.KISMET_KV, cacheKey(tokenId), { iceServers, expiresAt }, ttlSeconds);
  } catch (err: any) {
    console.error("[turn] cache write failed", { message: err?.message });
  }
}

async function enforceRateLimit(env: Env, req: Request): Promise<boolean> {
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  const bucket = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));
  const key = `turn:rate:${ip}:${bucket}`;
  try {
    const currentRaw = await env.KISMET_KV.get(key);
    const count = currentRaw ? Number(currentRaw) : 0;
    if (Number.isFinite(count) && count >= RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }
    const next = Number.isFinite(count) ? count + 1 : 1;
    await env.KISMET_KV.put(key, String(next), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
    return true;
  } catch (err: any) {
    console.error("[turn] rate-limit check failed", { message: err?.message, ip });
    return true; // fail open to avoid locking users out due to KV issues
  }
}

function cacheKey(tokenId: string) {
  return `turn:cache:${tokenId}`;
}
