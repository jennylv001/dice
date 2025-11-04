import { pearson, mean, stddev } from "../../../shared/src/util";
export function computeLumaCorrelation(lumaTrace: number[], planned: number[]): number {
  const L = lumaTrace.length; const arr: number[] = [];
  for (let i = 0; i < L; i++) { const idx = Math.round((i / (L - 1)) * (planned.length - 1)); arr.push(planned[idx]); }
  return pearson(lumaTrace, arr);
}
export function computeBarcodeError(lumaTrace: number[], barcode: number[]): number {
  const L = lumaTrace.length; let mism = 0, total = 0;
  for (let i = 0; i < barcode.length; i++) if (barcode[i]) {
    total++; const idx = Math.round((i / (barcode.length - 1)) * (L - 1));
    const window = lumaTrace.slice(Math.max(0, idx - 2), Math.min(L, idx + 3));
    const m = mean(window), s = stddev(window);
    if (Math.abs(lumaTrace[idx] - m) < 1.2 * s) mism++;
  }
  return total ? mism / total : 0.3;
}
export function alignHapticImu(hapticTimes: number[], imuMagnitudes: { t: number; a: number }[]) {
  let deltas: number[] = [];
  for (const t of hapticTimes) {
    let bestDt = 1e9;
    for (const m of imuMagnitudes) { const dt = Math.abs(m.t - t); if (dt < bestDt) bestDt = dt; }
    if (bestDt < 30) deltas.push(bestDt);
  }
  return deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 999;
}
export function goertzelSNR(samples: Float32Array, sampleRate: number, freq: number) {
  const k = Math.round(0.5 + ((samples.length * freq) / sampleRate));
  const omega = (2 * Math.PI * k) / samples.length;
  const cos = Math.cos(omega), sin = Math.sin(omega);
  let s_prev = 0, s_prev2 = 0;
  for (let i = 0; i < samples.length; i++) { const s = samples[i] + 2 * cos * s_prev - s_prev2; s_prev2 = s_prev; s_prev = s; }
  const real = s_prev - s_prev2 * cos, imag = s_prev2 * sin; const power = real * real + imag * imag;
  let meanv = 0; for (let i = 0; i < samples.length; i++) meanv += samples[i]; meanv /= samples.length;
  let varv = 0; for (let i = 0; i < samples.length; i++) { const d = samples[i] - meanv; varv += d * d; } varv /= samples.length;
  return 10 * Math.log10(power / (varv + 1e-9));
}
export function vioImuDeviation(optFlowMag: number[], imuVar: number[]) {
  const n = Math.min(optFlowMag.length, imuVar.length); if (n === 0) return 1;
  const a = normalize(optFlowMag.slice(-n)); const b = normalize(imuVar.slice(-n));
  let s = 0; for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]); return s / n;
}
function normalize(arr: number[]) { const m = mean(arr); const s = stddev(arr) || 1; return arr.map(v => (v - m) / s); }
