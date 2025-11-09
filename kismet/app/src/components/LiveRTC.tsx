import React, { useEffect, useRef, useState, useMemo } from "react";
import type { WSFromClient, WSFromServer } from "../../../shared/src/types.js";
import { Toast } from "./Toast";
import { apiGetTurnServers } from "../net/api";

const FALLBACK_STUN = [{ urls: "stun:stun.l.google.com:19302" }];

type Props = { roomId: string; userId: string; token: string; ws: WebSocket | null; wantAudio?: boolean };

export default function LiveRTC({ roomId, userId, token, ws, wantAudio = true }: Props) {
  const [enabled] = useState(true); // mandatory now
  const [connected, setConnected] = useState(false);
  const [oppId, setOppId] = useState<string | undefined>();
  const [remoteWanted, setRemoteWanted] = useState(false);
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // Negotiation state flags (Perfect Negotiation simplified)
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);

  // Deterministic initiator: lower lexicographic userId (stable w/ generated ids)
  const isInitiator = useMemo(() => {
    if (!oppId) return false; // Cannot be initiator until opponent is known
    return userId < oppId;
  }, [userId, oppId]);

  useEffect(() => {
    if (!ws || !enabled) return;

    const onMsg = async (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as WSFromServer;

        if (msg.t === "joined") {
          if (msg.p.opp) setOppId(msg.p.opp);
          // When an opponent joins, the new initiator should kick off the process.
          const newOppId = msg.p.opp;
          if (newOppId && userId < newOppId) {
            await startRTCPeer("offer");
          }
        } else if (msg.t === "rtc_offer") {
          if (ignoreOfferRef.current) return;

          const offerCollision = makingOfferRef.current || (pcRef.current && pcRef.current.signalingState !== "stable");

          ignoreOfferRef.current = !isInitiator && offerCollision;
          if (ignoreOfferRef.current) {
            return; // Non-initiator backs off
          }

          try {
            await startRTCPeer("answer", msg.p.sdp);
          } catch (err) {
            console.error("Error handling RTC offer:", err);
            Toast.push("error", "Could not answer live video offer.");
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
            // Ignore benign "no active transceiver" errors during setup
            if (!err.message.includes("transceiver")) {
              console.error("Error adding ICE candidate:", err);
            }
          }
        }
      } catch (err) {
        console.error("Failed to process WebSocket message:", err);
      }
    };

    ws.addEventListener("message", onMsg);
    return () => ws.removeEventListener("message", onMsg);
  }, [ws, enabled, isInitiator, userId]);

  // Effect to send the initial 'want' signal
  useEffect(() => {
    if (ws && enabled) {
      const m: WSFromClient = { t: "rtc_want", p: { enable: true } };
      ws.send(JSON.stringify(m));
    }
  }, [ws, enabled]);

  async function startRTCPeer(role: "offer" | "answer", remoteSdp?: string) {
    if (!ws) return;

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
          ws.send(JSON.stringify(m));
        }
      };
      pcRef.current.onconnectionstatechange = () => {
        const isConnected = pcRef.current?.connectionState === "connected";
        setConnected(isConnected);
        if (isConnected) {
          // Reset negotiation state on successful connection
          ignoreOfferRef.current = false;
          makingOfferRef.current = false;
        }
      };
      pcRef.current.ontrack = (e) => {
        const inbound = e.streams[0];
        if (remoteRef.current) {
          // Avoid redundant assignments which can trigger play race warnings.
          if (remoteRef.current.srcObject !== inbound) {
            remoteRef.current.srcObject = inbound;
            // Safari/Chrome sometimes need an explicit play() after metadata.
            const v = remoteRef.current;
            const tryPlay = () => {
              // Only attempt if paused and we have tracks.
              if (v.paused && (inbound.getVideoTracks().length || inbound.getAudioTracks().length)) {
                const p = v.play();
                if (p && typeof p.then === "function") {
                  p.catch(() => {
                    // Swallow autoplay restrictions; user gesture will resolve.
                  });
                }
              }
            };
            if (v.readyState >= 2) { // HAVE_CURRENT_DATA
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
        } catch (err) {
          Toast.push("error", "Camera or mic permission denied. Enable access to join live.");
          pcRef.current = null; // Clean up on failure
          return;
        }
      }
      localStreamRef.current.getTracks().forEach((t) => pcRef.current!.addTrack(t, localStreamRef.current!));
      if (localRef.current && localRef.current.srcObject !== localStreamRef.current) {
        localRef.current.srcObject = localStreamRef.current;
        // Ensure local preview starts; muted so autoplay is allowed.
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

    const pc = pcRef.current;

    if (role === "offer") {
      makingOfferRef.current = true;
      try {
        const offer = await pc.createOffer();
        if (pc.signalingState !== "stable") return;
        await pc.setLocalDescription(offer);
        const m: WSFromClient = { t: "rtc_offer", p: { sdp: offer.sdp! } };
        ws.send(JSON.stringify(m));
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
        ws.send(JSON.stringify(m));
      } catch (err) {
        console.error("Failed to create answer:", err);
      }
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
    };
  }, []);

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
