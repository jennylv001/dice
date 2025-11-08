import React, { useCallback, useEffect, useRef, useState } from "react";
import SealBadge from "./SealBadge";
import { apiStartRoll, apiSubmitRoll } from "../net/api";
import { startCapture } from "../ppor/capture";
import { setupStimuli } from "../ppor/stimuli";
import { computeBarcodeError, computeLumaCorrelation, vioImuDeviation, alignHapticImu, goertzelSNR } from "../ppor/liveness";
import { rootFromFrames } from "../ppor/merkle";
import { buildAndSignProof } from "../ppor/proof";
import { ephemeralSigner } from "../ppor/webauthn";
import { Toast } from "./Toast";
import type { AuditFrame, Channels, PlayerRole, RoomStage } from "../../../shared/src/types.js";

type Props = {
  roomId: string;
  playerId: string;
  token: string;
  role: PlayerRole;
  yourTurn: boolean;
  stage: RoomStage;
  onDiceReadyChange: (ready: boolean) => void;
};

type CaptureHandle = Awaited<ReturnType<typeof startCapture>>;

type Status = "idle" | "verifying" | "ready" | "rolling" | "success" | "error";

export default function CameraRoller({ roomId, playerId, token, role, yourTurn, stage, onDiceReadyChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const verifierRef = useRef<CaptureHandle | null>(null);
  const diceReadyRef = useRef(false);
  const [status, setStatus] = useState<Status>("idle");
  const [values, setValues] = useState<number[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (role === "spectator") return;
    let cancelled = false;

    const initCapture = async () => {
      if (cancelled || verifierRef.current) return;
      try {
        const cap = await startCapture(videoRef.current!, true, {
          onDetect(info) {
            const ready = info.values.length >= 1;
            if (diceReadyRef.current !== ready) {
              diceReadyRef.current = ready;
              onDiceReadyChange(ready);
            }
            setStatus(ready ? "ready" : "verifying");
          }
        });
        verifierRef.current = cap;
      } catch (err: any) {
        Toast.push("error", err?.message || "Camera permission denied.");
        setStatus("error");
      }
    };

    initCapture();
    return () => {
      cancelled = true;
      verifierRef.current?.stop();
      verifierRef.current = null;
    };
  }, [role, onDiceReadyChange]);

  useEffect(() => {
    if (role === "spectator") return;
    if (!yourTurn || rolling) return;
    if (!diceReadyRef.current) {
      Toast.push("warn", "Hold your dice steady so the system can verify them before rolling.");
      return;
    }
    setRolling(true);
    performRoll().finally(() => setRolling(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yourTurn]);

  const performRoll = useCallback(async () => {
    const video = videoRef.current;
    const wrap = wrapRef.current;
    if (!video || !wrap) return;

    const existing = verifierRef.current;
    verifierRef.current = null;
    existing?.stop();
    onDiceReadyChange(false);
    diceReadyRef.current = false;

    const ac = new window.AudioContext({ latencyHint: "interactive" });
    const { nonces_b64u, schedule } = await apiStartRoll(roomId, playerId, token);
    const stimCtl = setupStimuli(nonces_b64u.stim, wrap, ac);

  const signer = await ephemeralSigner();
    let cap: CaptureHandle | null = null;
    let mic: MediaStream | null = null;
    const channels: Channels = { video: true, audio: true, haptics: "vibrate" in navigator, imu: false };
    const imu: { t: number; a: number }[] = [];
    let started = false;
    const t0 = performance.now();

    const motionHandler = (e: DeviceMotionEvent) => {
      channels.imu = true;
      const ax = e.accelerationIncludingGravity?.x || 0;
      const ay = e.accelerationIncludingGravity?.y || 0;
      const az = e.accelerationIncludingGravity?.z || 0;
      const a = Math.sqrt(ax * ax + ay * ay + az * az);
      imu.push({ t: performance.now() - t0, a });
    };

    try {
      try {
        cap = await startCapture(video, true);
      } catch {
        throw new Error("Camera access blocked. Enable camera permission and try again.");
      }

      window.addEventListener("devicemotion", motionHandler);

      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, noiseSuppression: false, echoCancellation: false, autoGainControl: false } });
      } catch {
        throw new Error("Microphone access blocked. Re-enable mic permissions to complete the roll.");
      }

      const micCtx = ac.createMediaStreamSource(mic);
      const analyser = ac.createAnalyser(); analyser.fftSize = 2048;
      micCtx.connect(analyser);
      const micBuf = new Float32Array(analyser.fftSize);

      stimCtl.startAll();
      started = true;
      setStatus("rolling");

      const settleWaitStart = performance.now();
      while (!cap.isSettled()) {
        await waitMs(16);
        if (performance.now() - settleWaitStart > 3500) break;
      }

      const frames = cap.getFrames();
      const lumaTrace = cap.getLumaTrace();
      const last = cap.getLastValues();
      const t_settle = performance.now() - t0;

      const picks: AuditFrame[] = [];
      const indices = Array.from(new Set([frames.length - 1, Math.floor(frames.length * 0.6), Math.floor(frames.length * 0.3)])).filter(i => i >= 0);
      for (const idx of indices) {
        picks.push({ t_ms: Math.round((idx / Math.max(1, frames.length - 1)) * schedule.durMs), luma64x36_b64: toB64(frames[idx]) });
      }

      const r_luma = computeLumaCorrelation(lumaTrace, schedule.luma);
      const barcode_err = computeBarcodeError(lumaTrace, schedule.barcode);
      analyser.getFloatTimeDomainData(micBuf);
      const chirp_snr = Math.max(...schedule.chirps.map(c => goertzelSNR(micBuf, ac.sampleRate, c.freq)));
      const haptic_imu_ms = channels.haptics && channels.imu ? alignHapticImu(schedule.haptics, imu) : 0;
      const vio_imu_dev = channels.imu ? vioImuDeviation(diffMag(frames), imu.map(m => m.a)) : 0.2;

      const root_video = await rootFromFrames(frames);
      const root_imu = await rootFromFrames([floatToBytes(imu.map(m => m.a))]);
      const root_audio = await rootFromFrames([floatToBytes(Array.from(micBuf))]);

      const t_send = performance.now() - t0;
      const proof = await buildAndSignProof({
        dice: last.values.map((v, i) => ({ id: "d" + i, value: v, confidence: last.confidence[i] || 0.75, settle_t_ms: Math.round(t_settle), tumble_count: 2 })),
        roots: { video: root_video, imu: root_imu, audio: root_audio },
        liveness: { r_luma, barcode_err, haptic_imu_ms, chirp_snr, vio_imu_dev },
        channels,
        timing: { t_start: 0, t_settle: Math.round(t_settle), t_send: Math.round(t_send) },
        nonces: nonces_b64u,
        auditFrames: picks
      }, signer);

      setValues(last.values);
      setScore(Math.max(0, Math.min(1, r_luma)));

      await apiSubmitRoll(roomId, playerId, token, proof);
      setStatus("success");
    } catch (err: any) {
      setStatus("error");
      Toast.push("error", err?.message || "Roll failed. Try again." );
    } finally {
      try { stimCtl.stop(); } catch {}
      if (cap) cap.stop();
      window.removeEventListener("devicemotion", motionHandler);
      mic?.getTracks().forEach(t => t.stop());
      await ac.close().catch(() => {});
      restartVerifier();
    }
  }, [playerId, roomId, token, onDiceReadyChange]);

  const restartVerifier = useCallback(() => {
    const start = async () => {
      try {
        setStatus("verifying");
        const cap = await startCapture(videoRef.current!, true, {
          onDetect(info) {
            const ready = info.values.length >= 1;
            if (diceReadyRef.current !== ready) {
              diceReadyRef.current = ready;
              onDiceReadyChange(ready);
            }
            setStatus(ready ? "ready" : "verifying");
          }
        });
        verifierRef.current = cap;
      } catch (err: any) {
        Toast.push("error", err?.message || "Camera permission denied.");
        setStatus("error");
      }
    };
    start();
  }, [onDiceReadyChange]);

  if (role === "spectator") {
    return (
      <div ref={wrapRef} className="camera spectator" aria-label="Spectator view">
        <div className="spectator-placeholder">Spectator mode — no capture required.</div>
      </div>
    );
  }

  const statusText = statusMessage(status, stage, yourTurn);

  return (
    <div
      ref={wrapRef}
      className="camera"
      style={{ filter: "brightness(var(--seal-bright))" }}
      role="group"
      aria-label="Dice roll capture area"
    >
      <video
        ref={videoRef}
        className="video"
        muted
        playsInline
        aria-label="Live dice video feed"
      ></video>
      <div className="overlay" aria-hidden="false">
        <SealBadge score={score} />
        {values.length > 0 && (
          <div className="snap" role="status" aria-live="polite">
            Result:
            <div className="values values-row" aria-label="Dice values side by side">
              {values.map((v, i) => (
                <span key={i} className="value-chip" aria-label={`Die ${i + 1} value ${v}`}>{v}</span>
              ))}
            </div>
          </div>
        )}
        <div className="camera-status" role="status" aria-live="polite">{statusText}</div>
      </div>
    </div>
  );
}

function statusMessage(status: Status, stage: RoomStage, yourTurn: boolean): string {
  if (status === "error") return "Issue detected — retry.";
  if (stage === "AWAITING_OPPONENT") return "Waiting for opponent.";
  if (stage === "AWAITING_DICE") return status === "verifying" ? "Detecting dice…" : "Hold steady to lock.";
  if (status === "verifying") return "Detecting dice…";
  if (status === "ready" && !yourTurn) return "Locked. Await turn.";
  if (status === "rolling") return "Rolling…";
  if (status === "success") return "Sealed.";
  return "Preparing…";
}

function waitMs(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function toB64(bytes: Uint8ClampedArray) { let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]); return btoa(bin); }
function floatToBytes(arr: number[]) { const out = new Uint8ClampedArray(arr.length); const min = Math.min(...arr), max = Math.max(...arr) || 1; for (let i = 0; i < arr.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(((arr[i] - min) / (max - min || 1)) * 255))); return out; }
function diffMag(frames: Uint8ClampedArray[]) { const mags: number[] = []; for (let i = 1; i < frames.length; i++) { let s = 0; const a = frames[i], b = frames[i - 1]; const n = Math.min(a.length, b.length); for (let j = 0; j < n; j++) { const d = a[j] - b[j]; s += Math.abs(d); } mags.push(s / n); } return mags; }
