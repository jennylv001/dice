import { FRAME_LUMA_SIZE, LIVENESS_THRESHOLDS } from "../../../shared/src/constants";
import { detectPipsAndDice, updateTracks, type DieTrack } from "./diceDetect";
import { mean } from "../../../shared/src/util";

type Capture = {
  stop: (options?: { preserveStream?: boolean }) => void;
  getFrames: () => Uint8ClampedArray[];
  getLumaTrace: () => number[];
  getLastValues: () => { values: number[]; confidence: number[] };
  isSettled: () => boolean;
};

type CaptureOpts = {
  onDetect?: (info: { values: number[]; confidence: number[]; settled: boolean }) => void;
};

export async function startCapture(videoEl: HTMLVideoElement, wantRear = true, opts: CaptureOpts = {}, existingStream?: MediaStream): Promise<Capture> {
  // Primary high-quality constraints; may be downgraded if device rejects.
  const primary: MediaStreamConstraints = {
    video: { facingMode: wantRear ? { ideal: "environment" } : { ideal: "user" }, frameRate: { ideal: 60, min: 30 }, width: { ideal: 1280 }, height: { ideal: 720 } } as any,
    audio: false
  };
  const fallback: MediaStreamConstraints = {
    video: { facingMode: wantRear ? { ideal: "environment" } : { ideal: "user" }, frameRate: { ideal: 30, min: 24 }, width: { ideal: 640 }, height: { ideal: 480 } } as any,
    audio: false
  };
  let stream: MediaStream;
  if (existingStream) {
    stream = existingStream;
  } else {
    try {
      stream = await navigator.mediaDevices.getUserMedia(primary);
    } catch (err: any) {
      console.warn("[capture] primary constraints failed, retrying with fallback", err?.name || err?.message);
      stream = await navigator.mediaDevices.getUserMedia(fallback);
    }
  }
  // Clean previous association before swapping stream (helps avoid aborted fetch warnings).
  if (videoEl.srcObject && (videoEl.srcObject as MediaStream) !== stream) {
    try { (videoEl.srcObject as MediaStream).getTracks().forEach(t => t.stop()); } catch {}
  }
  videoEl.srcObject = stream;
  try { await videoEl.play(); } catch (err: any) {
    if (err?.name !== "AbortError") {
      console.warn("[capture] video play() rejected", err?.name || err?.message);
    }
  }
  // Attach basic error listeners for diagnostics; do not throw, allow caller to manage restarts.
  const onError = (e: Event) => {
    console.warn("[capture] video element error", (e as any)?.message || "media error");
  };
  videoEl.addEventListener("error", onError);

  const [w, h] = [FRAME_LUMA_SIZE.w, FRAME_LUMA_SIZE.h];
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  (ctx.canvas.width = w), (ctx.canvas.height = h);
  const tmpCanvas = document.createElement("canvas");
  const tmp = tmpCanvas.getContext("2d")!;
  let tracks: DieTrack[] = [];
  let frames: Uint8ClampedArray[] = [];
  let lumaTrace: number[] = [];
  let lastValues: { values: number[]; confidence: number[] } = { values: [], confidence: [] };
  let settledAt = 0;

  let raf = 0;
  const tick = () => {
    tmp.drawImage(videoEl, 0, 0, w, h);
    ctx.drawImage(tmp.canvas, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const luma = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) luma[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;

    frames.push(luma); if (frames.length > 240) frames.shift();
    const det = detectPipsAndDice(luma, w, h);
    const tMs = performance.now();
    tracks = updateTracks(tracks, det, tMs);
  lumaTrace.push(mean(Array.from(luma))); if (lumaTrace.length > 240) lumaTrace.shift();

    const values = tracks.map(t => t.value).filter(v => v >= 1 && v <= 6).slice(0, 5);
    const conf = tracks.map(t => t.confidence);
    if (values.length > 0) { if (settledAt === 0) settledAt = tMs; lastValues = { values, confidence: conf }; } else settledAt = 0;

    if (opts.onDetect) {
      const settled = settledAt > 0 && (performance.now() - settledAt) >= LIVENESS_THRESHOLDS.settleStableMs;
      opts.onDetect({ values, confidence: conf, settled });
    }

    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  function stop(options?: { preserveStream?: boolean }) {
    cancelAnimationFrame(raf);
    if (!options?.preserveStream) {
      try { if (!existingStream) (stream.getTracks()).forEach(t => t.stop()); } catch {}
    }
    // Detach stream to reduce MEDIA_ERR_ABORTED noise when tracks stopped mid-playback.
    if (videoEl.srcObject === stream) {
      videoEl.pause?.();
      videoEl.srcObject = null;
    }
    videoEl.removeEventListener("error", onError);
  }

  return {
    stop,
    getFrames: () => frames.slice(-120),
    getLumaTrace: () => lumaTrace.slice(),
    getLastValues: () => lastValues,
    isSettled: () => settledAt > 0 && (performance.now() - settledAt) >= LIVENESS_THRESHOLDS.settleStableMs
  };
}
