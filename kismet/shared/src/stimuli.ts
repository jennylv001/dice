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
// Reduced default duration to improve responsiveness (was 2000ms)
export function buildSchedule(nonceStim: Uint8Array, durMs = 1400): StimSchedule {
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
