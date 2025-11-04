import React, { useCallback, useMemo, useState } from "react";
import DuelView from "./components/DuelView";
import RoomLobby, { type LobbySession } from "./components/RoomLobby";
import type { RoomStatePayload } from "../../shared/src/types.js";

export default function App() {
  const [session, setSession] = useState<LobbySession | null>(null);
  const [roomState, setRoomState] = useState<RoomStatePayload | null>(null);

  const handleEnter = useCallback((next: LobbySession) => {
    setSession(next);
    setRoomState(next.room);
  }, []);

  const handleStateUpdate = useCallback((state: RoomStatePayload) => {
    setRoomState(state);
  }, []);

  const handleLeave = useCallback(() => {
    setSession(null);
    setRoomState(null);
  }, []);

  const activeRoomId = useMemo(() => roomState?.roomId ?? session?.room.roomId ?? "", [roomState, session]);

  return (
    <div className="app">
      <header className="topbar" role="banner">
        <div className="brand" aria-label="Kismet">Kismet</div>
        <div className="sub">Dice Roll.</div>
        {session && (
          <button className="btn ghost" type="button" onClick={handleLeave} aria-label="Leave room">Forfeit Match</button>
        )}
      </header>
      <main className="main" role="main">
        <div className="layout-grid main-grid" aria-live="polite">
          {!session
            ? <RoomLobby onEnter={handleEnter} />
            : (
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
      <footer className="foot" role="contentinfo">Cryptographic proof meets dice — No cheats. No lies. Just rolls. 🎲</footer>
    </div>
  );
}
