import { merkleRoot } from "../../../shared/src/merkle.js";
import { b64url } from "../../../shared/src/crypto.js";
export async function rootFromFrames(frames: Uint8ClampedArray[]) {
  const leaves = await Promise.all(frames.map(async f => {
    const copy = new Uint8Array(f);
    const digest = await crypto.subtle.digest("SHA-256", copy);
    return new Uint8Array(digest as ArrayBuffer);
  }));
  const root = await merkleRoot(leaves);
  return b64url(root);
}
