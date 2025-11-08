import React, { useEffect, useMemo, useState } from "react";
import { Toast } from "./Toast";
import {
  apiCreateRoom,
  apiJoinRoom,
  apiGetRoom,
  apiListOpenRooms,
  type CreateRoomResponse,
  type JoinRoomResponse,
  type OpenRoomEntry
} from "../net/api";
import type { GameMode, PlayerRole, RoomStatePayload } from "../../../shared/src/types.js";
import { useAuth } from "../providers/AuthProvider";
import PlayerBadge from "./PlayerBadge";

export type LobbySession = {
  roomId: string;
  playerId: string;
  token: string;
  role: PlayerRole;
  name: string;
  room: RoomStatePayload;
};

type Props = {
  onEnter: (session: LobbySession) => void;
  onBack?: () => void;
  gameMode?: string;  // Selected game mode ID
};

type LobbyTab = "create" | "join" | "discover";

export default function RoomLobby({ onEnter, onBack }: Props) {
  const { state } = useAuth();
  const [activeTab, setActiveTab] = useState<LobbyTab>("create");
  const profileName = state.status === "authenticated" ? state.profile.name : "";
  const [hostName, setHostName] = useState(profileName);
  const [roomIdInput, setRoomIdInput] = useState("");
  const [playerName, setPlayerName] = useState(profileName || "player-" + Math.random().toString(36).slice(2, 7));
  const [role, setRole] = useState<PlayerRole>("challenger");
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<OpenRoomEntry[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [gameMode, setGameMode] = useState<GameMode>("QUICK_DUEL");
  const profile = state.status === "authenticated" ? state.profile : null;
  const xpLabel = useMemo(() => profile ? `XP ${new Intl.NumberFormat().format(Math.max(0, Math.round(profile.xp)))}` : "", [profile]);

  useEffect(() => {
    if (state.status === "authenticated" && !hostName) setHostName(state.profile.name);
    if (state.status === "authenticated" && !playerName) setPlayerName(state.profile.name);
  }, [hostName, playerName, state]);

  useEffect(() => {
    let cancelled = false;
    async function loadOpenRooms() {
      try {
        const res = await apiListOpenRooms();
        if (!cancelled) setRooms(res);
      } catch {
        if (!cancelled) setRooms([]);
      }
    }
    loadOpenRooms();
    const id = setInterval(() => setRefreshTick(t => t + 1), 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshTick]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const name = hostName.trim() || "Host";
    setLoading(true);
    try {
      const res = await apiCreateRoom({ hostName: name, token: state.status === "authenticated" ? state.token : undefined, gameMode });
      onEnter(toSession(res.roomId, res.playerId, res.token, "host", res.playerName, res.room));
      Toast.push("info", `Table ${res.roomId} ready. Invite an opponent to begin.`);
    } catch (err: any) {
      Toast.push("error", friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (
    e: React.FormEvent | React.MouseEvent,
    joinRoomId?: string,
    overrideRole?: PlayerRole
  ) => {
    e.preventDefault?.();
    if (loading) return;
    const targetRoomId = (joinRoomId ?? roomIdInput).trim();
    if (!targetRoomId) {
      Toast.push("warn", "Enter a table code to join");
      return;
    }
    const player = playerName.trim() || "Player";
    const nextRole = overrideRole ?? role;
    setLoading(true);
    try {
      const res = await apiJoinRoom({ roomId: targetRoomId, name: player, role: nextRole, token: state.status === "authenticated" ? state.token : undefined });
      const room = res.room ?? (await apiGetRoom(targetRoomId)).room;
      onEnter(toSession(res.roomId, res.playerId, res.token, nextRole, player, room));
      Toast.push("info", `Joined table ${targetRoomId}. Get your dice ready.`);
    } catch (err: any) {
      Toast.push("error", friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const nearbyRooms = useMemo(() => rooms.slice(0, 6), [rooms]);

  return (
    <section className="card lobby-card" aria-labelledby="lobby-heading">
      <header className="card-header">
        {onBack && (
          <button type="button" className="btn ghost" onClick={onBack} style={{ marginBottom: "var(--space-4)" }}>
            ← Back to Game Selection
          </button>
        )}
        <p className="eyebrow">Ready to roll?</p>
        <h1 id="lobby-heading">Start your dice duel</h1>
        <p className="card-sub">Provably fair rolls. Real dice only. Cryptographic seals in milliseconds.</p>
      </header>
      {profile && (
        <div className="profile-highlight" role="note" aria-live="polite">
          <PlayerBadge
            name={profile.name}
            avatar={profile.avatar}
            level={profile.level}
            subtitle={xpLabel}
            size="lg"
            orientation="vertical"
          />
          <div className="muted" style={{ maxWidth: "38ch" }}>
            Maintain your streak to accelerate level gains. Higher tiers unlock invitational ladders and premium table cosmetics.
          </div>
        </div>
      )}
      <div className="lobby-tabs" role="tablist" aria-label="Lobby options">
        <button
          className={`lobby-tab${activeTab === "create" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "create"}
          onClick={() => setActiveTab("create")}
        >Host a table</button>
        <button
          className={`lobby-tab${activeTab === "join" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "join"}
          onClick={() => setActiveTab("join")}
        >Join match</button>
        <button
          className={`lobby-tab${activeTab === "discover" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={activeTab === "discover"}
          onClick={() => setActiveTab("discover")}
        >Find opponents</button>
      </div>

      {activeTab === "create" && (
        <form className="form-grid" onSubmit={handleCreate} aria-label="Create a room">
          <div className="field">
            <label className="label" htmlFor="host-name">Your name</label>
            <input
              id="host-name"
              className="input"
              placeholder="The Dice Master"
              value={hostName}
              onChange={e => setHostName(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="game-mode">Game mode</label>
            <select
              id="game-mode"
              className="input role-select"
              value={gameMode}
              onChange={event => setGameMode(event.target.value as GameMode)}
              disabled={loading}
            >
              <option value="QUICK_DUEL">Quick Duel</option>
              <option value="PRACTICE">Practice</option>
              <option value="CRAPS">Craps</option>
              <option value="LIARS_DICE">Liar's Dice</option>
              <option value="YAHTZEE">Yahtzee</option>
              <option value="BUNCO">Bunco</option>
            </select>
          </div>
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? "Setting up table…" : "Roll out the welcome mat"}
          </button>
        </form>
      )}

      {activeTab === "join" && (
        <form className="form-grid" onSubmit={(e) => handleJoin(e)} aria-label="Join a room">
          <div className="field">
            <label className="label" htmlFor="room-id-input">Table Code</label>
            <input
              id="room-id-input"
              className="input"
              placeholder="nx4h2k"
              value={roomIdInput}
              onChange={e => setRoomIdInput(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="player-name">Your name</label>
            <input
              id="player-name"
              className="input"
              placeholder="Lucky Seven"
              value={playerName}
              onChange={e => setPlayerName(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="role-select">Role</label>
            <select
              id="role-select"
              className="input role-select"
              value={role}
              onChange={e => setRole(e.target.value as PlayerRole)}
            >
              <option value="challenger">Challenger</option>
              <option value="spectator">Watch & Learn</option>
            </select>
          </div>
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? "Joining table…" : "Grab a seat"}
          </button>
        </form>
      )}

      {activeTab === "discover" && (
        <div className="discover-panel" aria-live="polite">
          {nearbyRooms.length === 0 && <p className="muted">Tables are empty. Be the first to host a legendary duel.</p>}
          {nearbyRooms.map(entry => (
            <button
              key={entry.roomId}
              className="discover-item"
              type="button"
              onClick={(e) => handleJoin(e, entry.roomId, "challenger")}
              disabled={loading}
            >
              <span className="discover-room">Table {entry.roomId}</span>
              <span className="discover-host">Host: {entry.hostName}</span>
            </button>
          ))}
        </div>
      )}

      <footer className="card-footer" role="note">
        <span className="kbd">SEALED</span>
        <span>Every roll cryptographically verified. Cheaters don't stand a chance.</span>
      </footer>
      <Toast.Container />
    </section>
  );
}

function toSession(roomId: string, playerId: string, token: string, role: PlayerRole, name: string, room: RoomStatePayload): LobbySession {
  return { roomId, playerId, token, role, name, room };
}

function friendlyError(err: any): string {
  if (!err) return "Request failed";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err?.message) return err.message;
  if (err?.error) return String(err.error);
  return "Something went wrong";
}
