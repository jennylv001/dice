import React, { useCallback, useEffect, useMemo, useState } from "react";
import DuelView from "./components/DuelView";
import RoomLobby, { type LobbySession } from "./components/RoomLobby";
import AuthScreen from "./components/AuthScreen";
import GameModeSelect from "./components/GameModeSelect";
import { ThemeToggle } from "./components/ThemeToggle";
import type { RoomStatePayload } from "../../shared/src/types.js";

type User = {
  id: string;
  name: string;
  email?: string;
  token?: string;
  isGuest?: boolean;
  avatar?: string;
  xp?: number;
  level?: number;
};

type AppScreen = "auth" | "game-select" | "lobby" | "duel";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [screen, setScreen] = useState<AppScreen>("auth");
  const [selectedGameMode, setSelectedGameMode] = useState<string | null>(null);
  const [session, setSession] = useState<LobbySession | null>(null);
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);

  // Check for existing auth on mount
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const userId = localStorage.getItem("user_id");
    const userName = localStorage.getItem("user_name");
    const email = localStorage.getItem("user_email");
    const avatar = localStorage.getItem("user_avatar");
    const xp = parseInt(localStorage.getItem("user_xp") || "0");
    const level = parseInt(localStorage.getItem("user_level") || "1");
    const isGuest = localStorage.getItem("guest_mode") === "true";

    if (userId && userName) {
      setUser({ 
        id: userId, 
        name: userName, 
        email: email || undefined, 
        token: token || undefined,
        avatar: avatar || "🎲",
        xp,
        level,
        isGuest 
      });
      setScreen("game-select");
    }
  }, []);

  const handleAuth = useCallback((authUser: { id: string; name: string; email: string; token: string; avatar: string }) => {
    const xp = parseInt(localStorage.getItem("user_xp") || "0");
    const level = parseInt(localStorage.getItem("user_level") || "1");
    setUser({ ...authUser, isGuest: false, xp, level });
    setScreen("game-select");
  }, []);

  const handleGuestMode = useCallback(() => {
    const guestId = localStorage.getItem("user_id") || "";
    const guestName = localStorage.getItem("user_name") || "";
    setUser({ id: guestId, name: guestName, isGuest: true });
    setScreen("game-select");
  }, []);

  const handleGameModeSelect = useCallback((modeId: string) => {
    setSelectedGameMode(modeId);
    setScreen("lobby");
  }, []);

  const handleEnter = useCallback((next: LobbySession) => {
    setSession(next);
    setRoomState(next.room);
    setScreen("duel");
  }, []);

  const handleStateUpdate = useCallback((state: RoomStatePayload) => {
    setRoomState(state);
  }, []);

  const handleLeave = useCallback(() => {
    setSession(null);
    setRoomState(null);
    setScreen("game-select");
  }, []);

  const handleBackToGameSelect = useCallback(() => {
    setScreen("game-select");
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_email");
    localStorage.removeItem("guest_mode");
    setUser(null);
    setSession(null);
    setRoomState(null);
    setScreen("auth");
  }, []);

  const activeRoomId = useMemo(() => roomState?.roomId ?? session?.room.roomId ?? "", [roomState, session]);

  // Render auth screen
  if (screen === "auth") {
    return <AuthScreen onAuth={handleAuth} onSkip={handleGuestMode} />;
  }

  // Render main app with header
  return (
    <div className="app">
      <header className="topbar" role="banner">
        <div className="brand" aria-label="Kismet">Kismet</div>
        <div className="sub">{selectedGameMode ? `${selectedGameMode} Mode` : "Dice Roll."}</div>
        <div className="topbar-actions">
          <ThemeToggle />
          {user && (
            <>
              <div className="user-badge">
                <span className="user-avatar">{user.avatar || "🎲"}</span>
                <div className="user-info">
                  <span className="user-name-display">{user.name}{user.isGuest ? " (Guest)" : ""}</span>
                  {!user.isGuest && <span className="user-level">Level {user.level || 1} • {user.xp || 0} XP</span>}
                </div>
              </div>
              {screen === "duel" ? (
                <button className="btn ghost" type="button" onClick={handleLeave} aria-label="Leave room">
                  Forfeit Match
                </button>
              ) : (
                <button className="btn ghost" type="button" onClick={handleLogout} aria-label="Log out">
                  {user.isGuest ? "Sign In" : "Log Out"}
                </button>
              )}
            </>
          )}
        </div>
      </header>
      <main className="main" role="main">
        <div className="layout-grid main-grid" aria-live="polite">
          {screen === "game-select" && (
            <GameModeSelect 
              onSelectMode={handleGameModeSelect}
            />
          )}
          {screen === "lobby" && (
            <RoomLobby 
              onEnter={handleEnter}
              onBack={handleBackToGameSelect}
            />
          )}
          {screen === "duel" && session && (
            <DuelView
              key={activeRoomId}
              session={session}
              roomState={roomState ?? session.room}
              onRoomState={handleStateUpdate}
              onLeave={handleLeave}
            />
          )}
        </div>
      </main>
      <footer className="foot" role="contentinfo">
        Cryptographic proof meets dice — No cheats. No lies. Just rolls. 🎲
      </footer>
    </div>
  );
}
