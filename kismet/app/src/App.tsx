import React, { useCallback, useEffect, useMemo, useState } from "react";
import DuelView from "./components/DuelView";
import RoomLobby, { type LobbySession } from "./components/RoomLobby";
import AuthScreen from "./components/AuthScreen";
import { ThemeToggle } from "./components/ThemeToggle";
import type { RoomStatePayload } from "../../shared/src/types.js";
import { AuthProvider, useAuth } from "./providers/AuthProvider";
import PlayerBadge from "./components/PlayerBadge";

// AppShell renders auth screen, lobby or active duel based on provider state.

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const { state, logout } = useAuth();
  const [session, setSession] = useState<LobbySession | null>(null);
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);

  // Reset session when auth state changes.
  useEffect(() => {
    if (state.status !== "authenticated") {
      setSession(null);
      setRoomState(null);
    }
  }, [state.status]);

  const handleEnter = useCallback((next: LobbySession) => {
    setSession(next);
    setRoomState(next.room);
  }, []);

  const handleStateUpdate = useCallback((next: RoomStatePayload) => {
    setRoomState(next);
  }, []);

  const handleLeave = useCallback(() => {
    setSession(null);
    setRoomState(null);
  }, []);

  const activeRoomId = useMemo(() => roomState?.roomId ?? session?.room.roomId ?? "", [roomState, session]);
  const authed = state.status === "authenticated";

  const mainContent = (() => {
    if (!authed) return <AuthScreen />;
    if (session) {
      return (
        <DuelView
          key={activeRoomId}
          session={session}
          roomState={roomState ?? session.room}
          onRoomState={handleStateUpdate}
          onLeave={handleLeave}
        />
      );
    }
    return <RoomLobby onEnter={handleEnter} />;
  })();

  return (
    <div className="app-shell" aria-live="polite">
      <header className="topbar" role="banner">
        <div className="brand">Kismet <span className="sub">Dice Roll.</span></div>
        <ThemeToggle />
        {authed && state.status === "authenticated" && (
          <AccountActions
            profileName={state.profile.name}
            level={state.profile.level}
            avatar={state.profile.avatar}
            xp={state.profile.xp}
            onLeave={session ? handleLeave : undefined}
            onLogout={logout}
          />
        )}
      </header>
      <main className="main" role="main">
        <div className="layout-grid main-grid" aria-live="polite">{mainContent}</div>
      </main>
      <footer className="foot" role="contentinfo">
        Cryptographic proof meets dice — No cheats. No lies. Just rolls. 🎲
      </footer>
    </div>
  );
}

function AccountActions({ profileName, level, avatar, xp, onLeave, onLogout }: { profileName: string; level: number; avatar: string; xp: number; onLeave?: () => void; onLogout: () => void }) {
  const xpLabel = useMemo(() => `XP ${new Intl.NumberFormat().format(Math.max(0, Math.round(xp)))}`, [xp]);
  return (
    <div className="row" role="group" aria-label="Account controls">
      <PlayerBadge name={profileName} level={level} avatar={avatar} subtitle={xpLabel} size="sm" />
      {onLeave && (
        <button className="btn ghost" type="button" onClick={onLeave} aria-label="Leave room">Forfeit Match</button>
      )}
      <button className="btn ghost" type="button" onClick={onLogout} aria-label="Logout">Sign out</button>
    </div>
  );
}
