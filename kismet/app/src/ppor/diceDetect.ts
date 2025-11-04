export type DieTrack = { id: string; value: number; confidence: number; x: number; y: number; angle: number; tumble: number; lastSeen: number };

export function detectPipsAndDice(luma: Uint8ClampedArray, w: number, h: number) {
  let sum = 0, sum2 = 0;
  for (let i = 0; i < luma.length; i++) { const v = luma[i]; sum += v; sum2 += v * v; }
  const n = luma.length; const mean = sum / n; const std = Math.sqrt(sum2 / n - mean * mean);
  const thr = Math.max(10, Math.min(200, mean - 0.6 * std));

  const visited = new Uint8Array(w * h);
  const blobs: { x: number; y: number; area: number }[] = [];
  const at = (x: number, y: number) => luma[y * w + x];

  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const idx = y * w + x; if (visited[idx]) continue;
    const v = at(x, y);
    if (v < thr) {
      let qx = [x], qy = [y], qh = 0, area = 0, sx = 0, sy = 0;
      visited[idx] = 1;
      while (qh < qx.length) {
        const cx = qx[qh], cy = qy[qh]; qh++; area++; sx += cx; sy += cy;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy; if (nx <= 0 || nx >= w-1 || ny <= 0 || ny >= h-1) continue;
          const nidx = ny * w + nx;
          if (!visited[nidx] && at(nx, ny) < thr) { visited[nidx] = 1; qx.push(nx); qy.push(ny); }
        }
      }
      if (area >= 5 && area <= 300) blobs.push({ x: Math.round(sx / area), y: Math.round(sy / area), area });
    } else visited[idx] = 1;
  }

  const eps = Math.max(6, Math.round(Math.min(w, h) * 0.06));
  const clusters: { points: typeof blobs, cx: number, cy: number }[] = [];
  const used = new Array(blobs.length).fill(false);
  for (let i = 0; i < blobs.length; i++) {
    if (used[i]) continue;
    const cur = [i]; used[i] = true;
    for (let j = 0; j < cur.length; j++) {
      const a = blobs[cur[j]];
      for (let k = 0; k < blobs.length; k++) {
        if (used[k]) continue;
        const b = blobs[k]; const dx = a.x - b.x, dy = a.y - b.y;
        if (dx*dx + dy*dy <= eps*eps) { used[k] = true; cur.push(k); }
      }
    }
    const pts = cur.map(idx => blobs[idx]);
    if (pts.length >= 1 && pts.length <= 6) {
      const cx = Math.round(pts.reduce((s,p)=>s+p.x,0)/pts.length);
      const cy = Math.round(pts.reduce((s,p)=>s+p.y,0)/pts.length);
      clusters.push({ points: pts, cx, cy });
    }
  }

  const dice = clusters.map(c => {
    let cov_xx = 0, cov_xy = 0, cov_yy = 0;
    for (const p of c.points) { const dx = p.x - c.cx, dy = p.y - c.cy; cov_xx += dx*dx; cov_xy += dx*dy; cov_yy += dy*dy; }
    const angle = 0.5 * Math.atan2(2 * cov_xy, cov_xx - cov_yy);
    const conf = Math.min(1, c.points.length / 6 + 0.3);
    return { x: c.cx, y: c.cy, pips: c.points.length, angle, confidence: conf };
  });

  return dice;
}

export function updateTracks(tracks: DieTrack[], detections: ReturnType<typeof detectPipsAndDice>, tMs: number) {
  const used = new Array(detections.length).fill(false);
  for (const tr of tracks) {
    let best = -1, bestD = 1e9;
    for (let i = 0; i < detections.length; i++) {
      if (used[i]) continue;
      const d = detections[i]; const dx = tr.x - d.x, dy = tr.y - d.y;
      const dist = dx*dx + dy*dy; if (dist < bestD) { bestD = dist; best = i; }
    }
    if (best >= 0 && bestD < 4000) {
      const d = detections[best]; used[best] = true;
      const dAngle = Math.abs(normAngle(d.angle - tr.angle));
      const tumbleInc = dAngle > 0.7 ? 1 : 0;
      tr.x = d.x; tr.y = d.y; tr.angle = d.angle;
      tr.value = d.pips; tr.confidence = Math.min(tr.confidence * 0.7 + d.confidence * 0.3, 1);
      tr.tumble += tumbleInc; tr.lastSeen = tMs;
    }
  }
  for (let i = 0; i < detections.length; i++) if (!used[i]) {
    const d = detections[i];
    tracks.push({ id: Math.random().toString(36).slice(2), value: d.pips, confidence: d.confidence, x: d.x, y: d.y, angle: d.angle, tumble: 1, lastSeen: tMs });
  }
  return tracks.filter(tr => tMs - tr.lastSeen < 800);
}
function normAngle(a: number) { while (a > Math.PI) a -= 2*Math.PI; while (a < -Math.PI) a += 2*Math.PI; return a; }
