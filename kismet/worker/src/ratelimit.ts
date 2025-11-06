/**
 * Rate limiting middleware for API endpoints
 * Tracks requests per user/IP to prevent abuse
 */

import type { Env } from "./kv.js";

const LIMITS = {
  START_ROLL: { max: 5, windowSec: 60 },
  SUBMIT_ROLL: { max: 5, windowSec: 60 },
  JOIN_ROOM: { max: 10, windowSec: 60 },
  WS_CONNECTIONS: { max: 5, windowSec: 300 }
} as const;

export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  limit: { max: number; windowSec: number }
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowKey = `ratelimit:${key}:${Math.floor(now / (limit.windowSec * 1000))}`;
  
  const countStr = await kv.get(windowKey);
  const count = countStr ? parseInt(countStr) : 0;
  
  if (count >= limit.max) {
    const resetAt = Math.ceil(now / (limit.windowSec * 1000)) * (limit.windowSec * 1000);
    return { allowed: false, remaining: 0, resetAt };
  }
  
  await kv.put(windowKey, String(count + 1), { expirationTtl: limit.windowSec * 2 });
  
  return {
    allowed: true,
    remaining: limit.max - count - 1,
    resetAt: Math.ceil(now / (limit.windowSec * 1000)) * (limit.windowSec * 1000)
  };
}

export function rateLimitResponse(resetAt: number) {
  return new Response(
    JSON.stringify({ 
      error: "rate_limit_exceeded", 
      message: "Too many requests. Please try again later.",
      resetAt 
    }),
    { 
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(Math.ceil((resetAt - Date.now()) / 1000))
      }
    }
  );
}

export function getRateLimitKey(req: Request, userId?: string): string {
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  return userId ? `${userId}:${ip}` : ip;
}

export { LIMITS };
