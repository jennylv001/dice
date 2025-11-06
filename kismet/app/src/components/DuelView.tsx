import React, { useEffect, useMemo, useRef, useState } from "react";
import CameraRoller from "./CameraRoller";
import OpponentPane from "./OpponentPane";
import LiveRTC from "./LiveRTC";
import PhaseIndicator from "./PhaseIndicator";
import RoundTimeline from "./RoundTimeline";
import PlayerStats from "./PlayerStats";
import StageBanner from "./StageBanner";
import GameResults from "./GameResults";
import { connectRoomWS } from "../net/ws";
import { Toast } from "./Toast";
import { evaluateGame, isGameComplete } from "../rules/gameRules";
import type { LobbySession } from "./RoomLobby";
import type { PlayerState, RoomStatePayload, WSFromServer, RoomStage } from "../../../shared/src/types.js";
import { GamePhase } from "../../../shared/src/types.js";
import type { WSFromClient } from "../../../shared/src/types.js";

type Props = {
  session: LobbySession;
  roomState: RoomStatePayload;
  onRoomState: (state: RoomStatePayload) => void;
  onLeave: () => void;
};

export default function DuelView({ session, roomState, onRoomState, onLeave }: Props) {
  const { roomId, playerId, token, role, name } = session;
  const [state, setState] = useState<RoomStatePayload>(roomState);
  const [lastOpp, setLastOpp] = useState<{ values: number[]; score: number } | null>(null);
  const [thumb, setThumb] = useState<{ t_ms: number; luma64x36_b64: string } | null>(null);
  const [localDiceReady, setLocalDiceReady] = useState(false);
  const [preGameStarted, setPreGameStarted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => { setState(roomState); }, [roomState]);

  useEffect(() => {
    const ws = connectRoomWS({
      roomId,
      playerId,
      token,
      spectator: role === "spectator",
      role,
      onMessage: (msg: WSFromServer) => {
        if (msg.t === "state") {
          setState(msg.p);
          onRoomState(msg.p);
        }
        if (msg.t === "room_stage") {
          setState(curr => ({ ...curr, stage: msg.p.stage }));
        }
        if (msg.t === "your_turn") {
          Toast.push("info", "🎲 Roll 'em! Your moment has arrived.");
        }
        if (msg.t === "opp_result") {
          setLastOpp({ values: msg.p.dice_values, score: msg.p.integrity_scores.overall });
        }
        if (msg.t === "opp_thumb") setThumb(msg.p);
        if (msg.t === "toast") Toast.push(msg.p.kind, msg.p.text);
      }
    });
    wsRef.current = ws;
    return () => ws.close();
  }, [roomId, playerId, token, role, onRoomState]);

  const currentTurnId = useMemo(() => {
    if (!state.order.length) return null;
    const idx = state.currentIdx % state.order.length;
    return state.order[idx];
  }, [state.order, state.currentIdx]);

  const youState = useMemo<PlayerState | undefined>(() => state.players.find(p => p.userId === playerId), [state.players, playerId]);
  const oppState = useMemo<PlayerState | undefined>(() => state.players.find(p => p.userId !== playerId && !p.spectator), [state.players, playerId]);
  const currentPhase = youState?.phase ?? state.phase ?? GamePhase.LOBBY;
  const stage: RoomStage = state.stage;
  const yourTurn = role !== "spectator" && currentTurnId === playerId;
  const bothPlayersPresent = useMemo(() => state.players.filter(p => !p.spectator).length >= 2, [state.players]);
  const canStartPreGame = !preGameStarted && bothPlayersPresent && stage === "AWAITING_OPPONENT" && role === "host";
  // Local transition for UI only; authoritative stage remains server-driven.
  useEffect(() => {
    // When server advances to AWAITING_DICE, mark preGameStarted true so capture can start.
    if (!preGameStarted && stage === "AWAITING_DICE") setPreGameStarted(true);
  }, [preGameStarted, stage]);

  const handleDiceReadyChange = (ready: boolean) => {
    if (localDiceReady === ready) return;
    setLocalDiceReady(ready);
    const ws = wsRef.current;
    if (ws) {
      const msg: WSFromClient = { t: "dice_status", p: { ready } };
      ws.send(JSON.stringify(msg));
    }
  };

  // Check if game is complete and evaluate results
  const gameMode = state.gameMode || "quick-duel";
  const playerIds = useMemo(() => 
    state.players.filter(p => !p.spectator).map(p => p.userId),
    [state.players]
  );
  
  const gameResult = useMemo(() => {
    if (isGameComplete(gameMode, state.roundHistory, playerIds)) {
      return evaluateGame(gameMode, state.roundHistory, playerIds);
    }
    return null;
  }, [gameMode, state.roundHistory, playerIds]);

  // Show results when game is complete
  useEffect(() => {
    if (gameResult && !showResults) {
      // Award XP
      const myXP = gameResult.xpRewards[playerId] || 0;
      if (myXP > 0) {
        const currentXP = parseInt(localStorage.getItem("user_xp") || "0");
        const newXP = currentXP + myXP;
        const newLevel = Math.floor(newXP / 100) + 1;
        localStorage.setItem("user_xp", newXP.toString());
        localStorage.setItem("user_level", newLevel.toString());
        Toast.push("success", `+${myXP} XP earned!`);
      }
      
      // Show results after a brief delay
      setTimeout(() => setShowResults(true), 1500);
    }
  }, [gameResult, showResults, playerId]);

  const handlePlayAgain = () => {
    setShowResults(false);
    onLeave();  // Return to game select
  };

  const playerNames = useMemo(() => {
    const names: Record<string, string> = {};
    state.players.forEach(p => {
      names[p.userId] = p.name;
    });
    return names;
  }, [state.players]);

  // moved stage earlier

  return (
    <div className="duel-grid" role="region" aria-label="Duel dashboard">
      {showResults && gameResult && (
        <GameResults
          result={gameResult}
          playerNames={playerNames}
          onPlayAgain={handlePlayAgain}
          onLeave={onLeave}
        />
      )}
      <StageBanner stage={stage} roomId={state.roomId} onLeave={onLeave} />
      {wsRef.current && (
        <LiveRTC
          roomId={roomId}
          userId={playerId}
          token={token}
          ws={wsRef.current}
          wantAudio={role !== "spectator"}
        />
      )}
      <section className="card high-card" aria-labelledby="you-heading">
        <header className="card-header">
          <p className="eyebrow">Your station</p>
          <h2 id="you-heading">{name}</h2>
        </header>
        <CameraRoller
          roomId={roomId}
          playerId={playerId}
          token={token}
          role={role}
          yourTurn={yourTurn}
          stage={stage}
          onDiceReadyChange={handleDiceReadyChange}
          startCaptureEnabled={preGameStarted}
        />
        <footer className="card-footer status">
          {role === "spectator" && <span className="muted">Watching the action unfold</span>}
          {role !== "spectator" && !yourTurn && <span className="muted">Warming up the dice…</span>}
          {role !== "spectator" && yourTurn && <span className="status-pill highlight">🎲 Your turn to shine</span>}
          {canStartPreGame && (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const ws = wsRef.current;
                if (ws) {
                  const msg: WSFromClient = { t: "start_verification" };
                  ws.send(JSON.stringify(msg));
                }
              }}
              style={{ marginLeft: 12 }}
            >Let's roll</button>
          )}
          {!canStartPreGame && !preGameStarted && !bothPlayersPresent && role === "host" && (
            <span className="muted" style={{ marginLeft: 12 }}>Waiting for a worthy opponent</span>
          )}
          {!canStartPreGame && !preGameStarted && bothPlayersPresent && role !== "spectator" && stage === "AWAITING_OPPONENT" && (
            <span className="muted" style={{ marginLeft: 12 }}>Host will start when ready</span>
          )}
        </footer>
      </section>
      <OpponentPane
        opponent={oppState}
        lastThumb={thumb}
        lastResult={lastOpp}
        stage={stage}
      />
      <aside className="card room-shell" aria-label="Room overview">
        <RoomStatePanel
          state={state}
          youId={playerId}
          currentTurnId={currentTurnId}
          phase={currentPhase}
          localDiceReady={localDiceReady}
        />
        {youState && <PlayerStats xp={youState.xp} streak={youState.streak} />}
      </aside>
      <Toast.Container />
    </div>
  );
}

function RoomStatePanel({ state, youId, currentTurnId, phase, localDiceReady }: { state: RoomStatePayload; youId: string; currentTurnId: string | null; phase: GamePhase; localDiceReady: boolean }) {
  const activeCount = state.players.filter(p => !p.spectator).length;
  return (
    <section className="room-state" aria-labelledby="room-overview-heading">
      <div className="state-head">
        <div>
          <p className="eyebrow">Match stats</p>
          <h2 id="room-overview-heading">Table {state.roomId}</h2>
        </div>
        <PhaseIndicator phase={phase} compact />
      </div>
      <dl className="state-metrics">
        <div className="state-line">
          <dt>Stage</dt>
          <dd>{formatStage(state.stage)}</dd>
        </div>
        <div className="state-line">
          <dt>Active roller</dt>
          <dd>{currentTurnId ? nameFor(state.players, currentTurnId, youId) : "—"}</dd>
        </div>
        <div className="state-line">
          <dt>Challengers</dt>
          <dd>{activeCount}</dd>
        </div>
      </dl>
      <ul className="roster" aria-label="Player roster">
        {state.players.length === 0 && <li className="muted">Empty table. Share your code to fill the seats.</li>}
        {state.players.map(p => {
          const isTurn = currentTurnId === p.userId;
          const diceStatus = p.userId === youId ? localDiceReady : p.diceReady;
          return (
            <li key={p.userId} className={`roster-item${isTurn ? " is-turn" : ""}`} aria-current={isTurn ? "true" : undefined}>
              <div className="roster-names">
                <span className="roster-name">{p.name}{p.userId === youId ? " (you)" : ""}</span>
                <span className="roster-role">{roleLabel(p)}</span>
              </div>
              <div className="roster-tags">
                {diceStatus ? <span className="tag tag-ready">Dice locked</span> : <span className="tag">Need dice</span>}
                {p.connected ? <span className="tag tag-live">📹 Live</span> : <span className="tag">Offline</span>}
                {isTurn && <span className="tag tag-turn">🎲 Rolling</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <RoundTimeline history={state.roundHistory} userId={youId} />
    </section>
  );
}

function roleLabel(p: PlayerState): string {
  if (p.spectator || p.role === "spectator") return "Observer";
  return p.role === "host" ? "Table Host" : "Challenger";
}

function nameFor(players: PlayerState[], userId: string, youId: string): string {
  const target = players.find(p => p.userId === userId);
  if (!target) return userId;
  return `${target.name}${userId === youId ? " (you)" : ""}`;
}

function formatStage(stage: RoomStage): string {
  switch (stage) {
    case "AWAITING_OPPONENT": return "Seeking opponent";
    case "AWAITING_DICE": return "Dice check";
    case "READY": return "Ready to rumble";
    case "IN_PROGRESS": return "Battle in progress";
    case "COMPLETED": return "Match complete";
    default: return stage;
  }
}
