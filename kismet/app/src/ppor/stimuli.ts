import { buildSchedule } from "../../../shared/src/stimuli.js";
export function setupStimuli(nonceStimB64u: string, videoContainer: HTMLElement, audioCtx: AudioContext) {
  const stim = buildSchedule(b64uToBytes(nonceStimB64u));
  let raf = 0; const start = performance.now();
  const update = () => {
    const t = performance.now() - start;
    const idx = Math.min(stim.luma.length - 1, Math.max(0, Math.round((t / stim.durMs) * stim.luma.length)));
    videoContainer.style.setProperty("--seal-bright", String(stim.luma[idx]));
    raf = requestAnimationFrame(update);
  };
  raf = requestAnimationFrame(update);

  const gain = audioCtx.createGain(); gain.gain.value = 0.03; gain.connect(audioCtx.destination);
  const startAudio = () => {
    stim.chirps.forEach(({ tMs, freq }) => {
      const t = audioCtx.currentTime + tMs / 1000;
      const osc = audioCtx.createOscillator();
      osc.type = "sine"; osc.frequency.setValueAtTime(freq, t);
      osc.connect(gain); osc.start(t); osc.stop(t + 0.035);
    });
  };
  const startHaptics = () => { if ("vibrate" in navigator) for (const t of stim.haptics) setTimeout(() => navigator.vibrate(20), t); };

  return { stim, startAll: () => { startAudio(); startHaptics(); }, stop: () => cancelAnimationFrame(raf) };
}
function b64uToBytes(s: string) { s = s.replace(/-/g, "+").replace(/_/g, "/"); const pad = s.length % 4 ? 4 - (s.length % 4) : 0; const b = atob(s + "=".repeat(pad)); const out = new Uint8Array(b.length); for (let i=0;i<b.length;i++) out[i]=b.charCodeAt(i); return out; }
