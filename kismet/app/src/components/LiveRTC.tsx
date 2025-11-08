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
    if (!oppId) return true; // alone until opponent joins
    return userId < oppId;
  }, [userId, oppId]);

  useEffect(() => {
    if (!ws) return;
    const onMsg = async (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as WSFromServer;
        if (msg.t === "joined") {
          if (msg.p.opp) setOppId(msg.p.opp);
        } else if (msg.t === "rtc_want" && enabled) {
          if (msg.p.from && msg.p.from !== userId) setRemoteWanted(!!msg.p.enable);
          // Only initiator starts offer when BOTH sides expressed want.
          if (!pcRef.current && isInitiator && remoteWanted && enabled) {
            try {
              await startRTCPeer("offer");
            } catch (err) {
              Toast.push("error", "Live video setup failed. Check device permissions.");
            }
          }
        } else if (msg.t === "rtc_offer") {
          if (!enabled) return;
          const pc = pcRef.current;
          const offerSDP = msg.p.sdp;
          // Glare handling: if both created offers, keep the designated initiator's offer.
          if (pc && pc.signalingState !== "stable") {
            // If we're the initiator, ignore incoming simultaneous offer.
            if (isInitiator) return; // ignore glare
          }
          try {
            await startRTCPeer("answer", offerSDP);
          } catch (err) {
            Toast.push("error", "Could not answer live video offer. Retry in a moment.");
          }
        } else if (msg.t === "rtc_answer") {
          if (!enabled || !pcRef.current) return;
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: msg.p.sdp }));
          } catch {}
        } else if (msg.t === "rtc_ice") {
          if (!enabled || !pcRef.current) return;
          try { await pcRef.current.addIceCandidate(msg.p.candidate); } catch {}
        }
      } catch {}
    };
    ws.addEventListener("message", onMsg);
    return () => ws.removeEventListener("message", onMsg);
  }, [ws, enabled, isInitiator, remoteWanted, userId]);

  async function startRTCPeer(role: "offer" | "answer", remoteSdp?: string) {
    if (!ws) return;
    if (!pcRef.current) {
      let iceServers: RTCIceServer[] = FALLBACK_STUN as RTCIceServer[];
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
      pcRef.current.onconnectionstatechange = () => setConnected(pcRef.current?.connectionState === "connected");
      pcRef.current.ontrack = (e) => { if (remoteRef.current) remoteRef.current.srcObject = e.streams[0]; };
      if (!localStreamRef.current) {
        try {
          // Reduce capture resolution & frame rate to lower GPU/CPU usage while preserving clarity.
          localStreamRef.current = await navigator.mediaDevices.getUserMedia({
            video: { width: 240, height: 135, frameRate: { ideal: 15, max: 15 } },
            audio: wantAudio
          });
        } catch (err) {
          Toast.push("error", "Camera or mic permission denied. Enable access to join live.");
          return;
        }
      }
      localStreamRef.current.getTracks().forEach(t => pcRef.current!.addTrack(t, localStreamRef.current!));
      if (localRef.current) localRef.current.srcObject = localStreamRef.current;
    }
    if (role === "offer") {
      makingOfferRef.current = true;
      try {
        const offer = await pcRef.current.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
        await pcRef.current.setLocalDescription(offer);
        const m: WSFromClient = { t: "rtc_offer", p: { sdp: offer.sdp! } };
        ws.send(JSON.stringify(m));
      } finally {
        makingOfferRef.current = false;
      }
    } else {
      // If already have an offer (glare) and we're initiator: ignore.
      if (pcRef.current.signalingState === "have-local-offer" && isInitiator) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: remoteSdp! }));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      const m: WSFromClient = { t: "rtc_answer", p: { sdp: answer.sdp! } };
      ws.send(JSON.stringify(m));
    }
  }

  // Express desire for RTC; initiator waits until remote also wants.
  useEffect(() => {
    if (!ws || !enabled) return;
    const m: WSFromClient = { t: "rtc_want", p: { enable: true } };
    ws.send(JSON.stringify(m));
  }, [ws, enabled]);

  return (
    <div className="rtc-panel card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3>Live View</h3>
        <div style={{ fontSize: 12, color: "#9fb2c7" }}>{connected ? "Connected" : "Connecting…"}</div>
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
      <div style={{ color: "#9fb2c7", fontSize: 12, marginTop: 6 }}>
        {connected ? (wantAudio ? "Video+Audio live" : "Video live") : (isInitiator ? "Waiting for opponent video intent" : "Awaiting offer")}
      </div>
    </div>
  );
}
