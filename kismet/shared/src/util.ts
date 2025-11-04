export function nowMs() { return performance && "now" in performance ? performance.now() : Date.now(); }
export function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const a = x[i], b = y[i]; sx += a; sy += b; sxx += a*a; syy += b*b; sxy += a*b; }
  const cov = sxy - (sx * sy) / n, vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n;
  const denom = Math.sqrt(vx * vy);
  return denom === 0 ? 0 : clamp(cov / denom, -1, 1);
}
export function mean(arr: number[]) { return arr.reduce((a, b) => a + b, 0) / (arr.length || 1); }
export function stddev(arr: number[]) { const m = mean(arr); return Math.sqrt(mean(arr.map(v => (v - m) ** 2))); }
