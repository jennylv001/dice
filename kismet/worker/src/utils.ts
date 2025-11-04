import { b64url } from "../../shared/src/crypto.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

export function okJson(obj: unknown, init: ResponseInit = {}) {
  const baseHeaders: Record<string, string> = { "content-type": "application/json", ...CORS_HEADERS };
  const mergedHeaders = { ...(init.headers || {}), ...baseHeaders } as Record<string, string>;
  return new Response(JSON.stringify(obj), { ...init, headers: mergedHeaders });
}
export function bad(reason: string, code = 400) { return okJson({ error: reason }, { status: code }); }
export function toB64u(buf: ArrayBuffer): string { return b64url(new Uint8Array(buf)); }
export function corsPreflight(): Response {
  return new Response("", { status: 204, headers: CORS_HEADERS });
}
