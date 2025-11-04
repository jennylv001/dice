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

  const digestSource = JSON.stringify(slim(proof));
  const digest = await sha256(new TextEncoder().encode(digestSource));
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
  let txt = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = txt.length % 4 ? 4 - (txt.length % 4) : 0;
  txt += "=".repeat(pad);
  const b = atob(txt);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
function slim(p: Proof) { const { audit, ...rest } = p; return rest; }
