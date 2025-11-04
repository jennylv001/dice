export async function sha256(data: ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  const buf = data instanceof Uint8Array ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
  return crypto.subtle.digest("SHA-256", buf as ArrayBuffer);
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
