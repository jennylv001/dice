import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { WSFromClient, WSFromServer } from "../../../shared/src/types.js";
import { Toast } from "./Toast";
import { apiGetTurnServers } from "../net/api";

const FALLBACK_STUN = [{ urls: "stun:stun.l.google.com:19302" }];
const MEDIA_ACQ_FAILED = "media_acquisition_failed";
const MEDIA_ACQ_RECOVERABLE = "media_acquisition_recoverable";
const MAX_MEDIA_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1200;
const RETRY_MAX_DELAY_MS = 5000;

type MediaErrorInfo = {
  level: "error" | "warn";
  message: string;
  recoverable: boolean;
};

function describeMediaError(err: unknown, wantAudio: boolean): MediaErrorInfo {
  const fallback: MediaErrorInfo = {
    level: "error",
    message: "Unable to access camera or microphone. Check your browser settings and retry.",
    recoverable: false,
  };

  if (!err || typeof err !== "object") return fallback;

  const name = typeof (err as any).name === "string" ? (err as any).name : "";
  const rawMessage = typeof (err as any).message === "string" ? (err as any).message : "";
  const message = rawMessage.toLowerCase();

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        level: "error",
        message: "Camera or microphone access was blocked. Enable permissions in your browser settings and retry.",
        recoverable: false,
      };
    case "NotFoundError":
    case "DevicesNotFoundError":
      return {
        level: "error",
        message: wantAudio
          ? "No camera or microphone was detected. Connect a device and refresh the page."
          : "No camera was detected. Connect one and refresh the page.",
        recoverable: false,
      };
    case "NotReadableError":
    case "TrackStartError":
      return {
        level: "warn",
        message: "Camera is already in use by another application. Close it and retry the live view.",
        recoverable: true,
      };
    case "AbortError":
      return {
        level: "warn",
        message: "Camera initialisation was interrupted. Reconnect your device and retry the live view.",
        recoverable: true,
      };
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return {
        level: "error",
        message: "The selected camera cannot provide the requested resolution. Try a different device.",
        recoverable: false,
      };
    default:
      if (message.includes("could not start video source")) {
        return {
          level: "warn",
          message: "Camera could not start. Close any other app using it and retry the live view.",
          recoverable: true,
        };
      }
      return fallback;
  }
}

type Props = { roomId: string; userId: string; token: string; ws: WebSocket | null; wantAudio?: boolean };

export default function LiveRTC({ roomId, userId, token, ws, wantAudio = true }: Props) {
  const [enabled] = useState(true); // mandatory now
  const [connected, setConnected] = useState(false);
  const [oppId, setOppId] = useState<string | undefined>();
  const [remoteWanted, setRemoteWanted] = useState<boolean | null>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const connectedRef = useRef(connected);
  const wsRef = useRef<WebSocket | null>(ws);
  const oppIdRef = useRef<string | undefined>(oppId);
  const isInitiatorRef = useRef(false);
  const offerRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaRetryRef = useRef(0);
  // Negotiation state flags (Perfect Negotiation simplified)
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const offerAttemptedRef = useRef(false);
  const remoteWantedRef = useRef<boolean | null>(remoteWanted);

  useEffect(() => {
    remoteWantedRef.current = remoteWanted;
    if (remoteWanted === false) {
      mediaRetryRef.current = 0;
      if (offerRetryTimerRef.current) {
        clearTimeout(offerRetryTimerRef.current);
        offerRetryTimerRef.current = null;
      }
    }
  }, [remoteWanted]);

  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    wsRef.current = ws;
  }, [ws]);

  useEffect(() => {
    oppIdRef.current = oppId;
  }, [oppId]);

  const tearDownPeer = useCallback((stopLocal = false) => {
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (stopLocal && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setConnected(false);
  }, []);

  // Deterministic initiator: lower lexicographic userId (stable w/ generated ids)
  const isInitiator = useMemo(() => {
    if (!oppId) return false; // Cannot be initiator until opponent is known
    return userId < oppId;
  }, [userId, oppId]);

  useEffect(() => {
    isInitiatorRef.current = isInitiator;
  }, [isInitiator]);

  const clearOfferRetryTimer = useCallback(() => {
    if (offerRetryTimerRef.current) {
      clearTimeout(offerRetryTimerRef.current);
      offerRetryTimerRef.current = null;
    }
  }, []);

  // Effect to send the initial 'want' signal
  useEffect(() => {
    if (ws && enabled) {
      const m: WSFromClient = { t: "rtc_want", p: { enable: true } };
      ws.send(JSON.stringify(m));
    }
  }, [ws, enabled]);

  const startRTCPeer = useCallback(async (targetWs: WebSocket, role: "offer" | "answer", remoteSdp?: string) => {
    if (!targetWs) return;

    if (!pcRef.current) {
      let iceServers: RTCIceServer[] = FALLBACK_STUN;
      try {
        const turn = await apiGetTurnServers(roomId, userId, token);
        if (turn.iceServers && turn.iceServers.length) iceServers = turn.iceServers;
      } catch {
        Toast.push("warn", "TURN unavailable, using public STUN only.");
      }
      pcRef.current = new RTCPeerConnection({ iceServers });
      pcRef.current.onicecandidate = (e) => {
        if (e.candidate) {
          const m: WSFromClient = { t: "rtc_ice", p: { candidate: e.candidate.toJSON() } };
          targetWs.send(JSON.stringify(m));
        }
      };
      pcRef.current.onconnectionstatechange = () => {
        const state = pcRef.current?.connectionState;
        const isConn = state === "connected" || state === "completed";
        setConnected(isConn);
        if (isConn) {
          ignoreOfferRef.current = false;
          makingOfferRef.current = false;
          offerAttemptedRef.current = false;
          mediaRetryRef.current = 0;
          clearOfferRetryTimer();
        }
        if (state === "failed" || state === "closed") {
          offerAttemptedRef.current = false;
          tearDownPeer(false);
        } else if (state === "disconnected" && remoteWantedRef.current === false) {
          offerAttemptedRef.current = false;
          tearDownPeer(false);
        }
      };
      pcRef.current.ontrack = (e) => {
        const inbound = e.streams[0];
        if (remoteRef.current) {
          if (remoteRef.current.srcObject !== inbound) {
            remoteRef.current.srcObject = inbound;
            const v = remoteRef.current;
            const tryPlay = () => {
              if (v.paused && (inbound.getVideoTracks().length || inbound.getAudioTracks().length)) {
                const p = v.play();
                if (p && typeof p.then === "function") {
                  p.catch(() => {
                    // Autoplay restrictions require a user gesture; toast already shown elsewhere.
                  });
                }
              }
            };
            if (v.readyState >= 2) {
              tryPlay();
            } else {
              const onMeta = () => { v.removeEventListener("loadedmetadata", onMeta); tryPlay(); };
              v.addEventListener("loadedmetadata", onMeta);
            }
          }
        }
      };

      if (!localStreamRef.current) {
        try {
          localStreamRef.current = await navigator.mediaDevices.getUserMedia({
            video: { width: 240, height: 135, frameRate: { ideal: 15, max: 15 } },
            audio: wantAudio,
          });
          mediaRetryRef.current = 0;
        } catch (err) {
          const info = describeMediaError(err, wantAudio);
          const log = info.level === "error" ? console.error : console.warn;
          log("Failed to acquire local media stream:", err);
          Toast.push(info.level, info.message);
          tearDownPeer(false);
          const failure = Object.assign(new Error(info.recoverable ? MEDIA_ACQ_RECOVERABLE : MEDIA_ACQ_FAILED), {
            code: info.recoverable ? MEDIA_ACQ_RECOVERABLE : MEDIA_ACQ_FAILED,
            recoverable: info.recoverable,
            cause: err instanceof Error ? err : undefined,
          });
          throw failure;
        }
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => pcRef.current!.addTrack(t, localStreamRef.current!));
        if (localRef.current && localRef.current.srcObject !== localStreamRef.current) {
          localRef.current.srcObject = localStreamRef.current;
          const lv = localRef.current;
          const startLocal = () => {
            if (lv.paused) {
              const p = lv.play();
              if (p && typeof p.then === "function") p.catch(() => {});
            }
          };
          if (lv.readyState >= 2) startLocal(); else lv.addEventListener("loadedmetadata", () => startLocal(), { once: true });
        }
      }
    }

    const pc = pcRef.current;
    if (!pc) return;

    if (role === "offer") {
      makingOfferRef.current = true;
      try {
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") return;
        await pc.setLocalDescription(offer);
        const m: WSFromClient = { t: "rtc_offer", p: { sdp: offer.sdp! } };
        targetWs.send(JSON.stringify(m));
      } catch (err) {
        console.error("Failed to create offer:", err);
      } finally {
        makingOfferRef.current = false;
      }
    } else if (role === "answer") {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: remoteSdp! }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const m: WSFromClient = { t: "rtc_answer", p: { sdp: answer.sdp! } };
        targetWs.send(JSON.stringify(m));
      } catch (err) {
        console.error("Failed to create answer:", err);
      }
    }
  }, [roomId, userId, token, wantAudio, tearDownPeer, clearOfferRetryTimer]);

  const attemptOffer = useCallback(() => {
    const currentWs = wsRef.current;
    if (!currentWs) return;
    if (remoteWantedRef.current === false) return;
    if (!isInitiatorRef.current) return;
    if (!oppIdRef.current) return;
    if (connectedRef.current) return;
    if (offerAttemptedRef.current) return;

    clearOfferRetryTimer();
    offerAttemptedRef.current = true;

    startRTCPeer(currentWs, "offer").then(() => {
      mediaRetryRef.current = 0;
    }).catch((err) => {
      offerAttemptedRef.current = false;
      const code = (err as any)?.code;
      if (code === MEDIA_ACQ_RECOVERABLE && remoteWantedRef.current !== false) {
        if (mediaRetryRef.current < MAX_MEDIA_RETRIES) {
          mediaRetryRef.current += 1;
          const delay = Math.min(RETRY_MAX_DELAY_MS, Math.round(RETRY_BASE_DELAY_MS * Math.pow(2, mediaRetryRef.current - 1)));
          offerRetryTimerRef.current = setTimeout(() => {
            attemptOffer();
          }, delay);
        } else {
          mediaRetryRef.current = 0;
          Toast.push("error", "Camera is still unavailable. Refresh once the device is free.");
        }
        return;
      }
      mediaRetryRef.current = 0;
      if (code !== MEDIA_ACQ_FAILED) {
        console.error("Failed to start RTC offer:", err);
        Toast.push("error", "Live view negotiation failed. Check your device and retry.");
      }
    });
  }, [startRTCPeer, clearOfferRetryTimer]);

  useEffect(() => {
    attemptOffer();
  }, [attemptOffer, ws, oppId, remoteWanted, isInitiator, connected]);

  useEffect(() => {
    const currentWs = wsRef.current;
    if (!currentWs || !enabled) return;

    const onMsg = async (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as WSFromServer;

        if (msg.t === "joined") {
          if (msg.p.opp) {
            oppIdRef.current = msg.p.opp;
            setOppId(msg.p.opp);
            isInitiatorRef.current = userId < msg.p.opp;
            if (remoteWantedRef.current !== false) {
              attemptOffer();
            }
          }
        } else if (msg.t === "rtc_offer") {
          if (ignoreOfferRef.current) return;

          const offerCollision = makingOfferRef.current || (pcRef.current && pcRef.current.signalingState !== "stable");
          const isInitiatorNow = isInitiatorRef.current;

          ignoreOfferRef.current = !isInitiatorNow && offerCollision;
          if (ignoreOfferRef.current) {
            return; // Non-initiator backs off
          }

          try {
            await startRTCPeer(currentWs, "answer", msg.p.sdp);
          } catch (err) {
            if ((err as any)?.code === MEDIA_ACQ_FAILED || (err as any)?.code === MEDIA_ACQ_RECOVERABLE) {
              // Media acquisition issues already surfaced.
            } else {
              console.error("Error handling RTC offer:", err);
              Toast.push("error", "Could not answer live video offer.");
            }
          }
        } else if (msg.t === "rtc_answer") {
          if (!pcRef.current) return;
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: msg.p.sdp }));
          } catch (err) {
            console.error("Error setting remote answer:", err);
          }
        } else if (msg.t === "rtc_ice") {
          if (!pcRef.current) return;
          try {
            await pcRef.current.addIceCandidate(msg.p.candidate);
          } catch (err) {
            if (!err.message.includes("transceiver")) {
              console.error("Error adding ICE candidate:", err);
            }
          }
        } else if (msg.t === "rtc_want") {
          if (msg.p.from !== userId) {
            const nextWant = msg.p.enable === undefined ? null : !!msg.p.enable;
            setRemoteWanted(nextWant);
            if (msg.p.enable === false) {
              offerAttemptedRef.current = false;
              tearDownPeer(true);
            }
          }
        }
      } catch (err) {
        console.error("Failed to process WebSocket message:", err);
      }
    };

    currentWs.addEventListener("message", onMsg);
    return () => currentWs.removeEventListener("message", onMsg);
  }, [enabled, startRTCPeer, attemptOffer, tearDownPeer, userId, ws]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      offerAttemptedRef.current = false;
      if (offerRetryTimerRef.current) {
        clearTimeout(offerRetryTimerRef.current);
        offerRetryTimerRef.current = null;
      }
      mediaRetryRef.current = 0;
      tearDownPeer(true);
    };
  }, [tearDownPeer]);

  return (
    <div className="rtc-panel card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Live View</h3>
        <div style={{ fontSize: 12, color: connected ? "#33d17a" : "#9fb2c7" }}>
          {connected ? "Connected" : "Connecting…"}
        </div>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <video
          className="rtc-video"
          ref={localRef}
          autoPlay
          muted
          playsInline
          aria-label="Your live video feed"
        />
        <video
          className="rtc-video"
          ref={remoteRef}
          autoPlay
          playsInline
          aria-label="Opponent live video feed"
        />
      </div>
      <div style={{ color: "#9fb2c7", fontSize: 12, marginTop: 6, minHeight: 16 }}>
        {!connected && (isInitiator ? "Initiating connection..." : "Awaiting connection...")}
      </div>
    </div>
  );
}
