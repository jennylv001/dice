import type { Proof } from "../../../shared/src/types.js";
import { PROTOCOL_VERSION } from "../../../shared/src/constants.js";
import { sha256, b64url } from "../../../shared/src/crypto.js";

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
  const digestSource = JSON.stringify({ ...proofCore, webauthn: { ...proofCore.webauthn, signatureB64u: "" } });
  const digest = await sha256(new TextEncoder().encode(digestSource));
  const sig = await signer.sign(digest);
  proofCore.webauthn.signatureB64u = b64url(sig);
  return proofCore;
}
