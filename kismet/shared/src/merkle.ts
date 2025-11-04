import { sha256 } from "./crypto.js";

export async function merkleRoot(leaves: Uint8Array[]): Promise<Uint8Array> {
  if (leaves.length === 0) throw new Error("no leaves");
  let level = await Promise.all(leaves.map(async x => new Uint8Array(await sha256(x) as ArrayBuffer)));
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = level[i + 1] ?? a;
  const h = new Uint8Array(await sha256(concat(a, b)) as ArrayBuffer);
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
