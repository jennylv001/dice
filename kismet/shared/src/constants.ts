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
