import React, { useState } from "react";
import { Toast } from "./Toast";

export default function JoinCard({ onJoin }: { onJoin: (roomId: string, userId: string, spectator: boolean) => void }) {
  const [room, setRoom] = useState("");
  const [user, setUser] = useState("player-" + Math.random().toString(36).slice(2, 8));
  const [spectator, setSpectator] = useState(false);

  const join = () => {
    if (!room) return Toast.push("warn", "Enter Room ID");
    onJoin(room, user, spectator);
  };

  return (
    <section className="card entry-card" aria-labelledby="join-heading">
      <header className="card-header">
        <p className="eyebrow">Get Started</p>
        <h1 id="join-heading">Enter a room to duel</h1>
        <p className="card-sub">Secure, real-time dice authentication with proof in seconds.</p>
      </header>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); join(); }}>
        <div className="field">
          <label htmlFor="room-id" className="label">Room ID</label>
          <input id="room-id" className="input" placeholder="e.g. alpha-7" value={room} onChange={e => setRoom(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="user-id" className="label">Display name</label>
          <input id="user-id" className="input" placeholder="Your name" value={user} onChange={e => setUser(e.target.value)} required />
        </div>
        <label className="toggle" htmlFor="spectator-toggle">
          <input id="spectator-toggle" type="checkbox" checked={spectator} onChange={e => setSpectator(e.target.checked)} />
          <span>Spectator mode</span>
        </label>
        <button className="btn primary" type="submit">Join match</button>
      </form>
      <footer className="card-footer" role="note">
        <span className="kbd">HTTPS</span>
        <span>Required for encrypted roll proofs. Cloudflare Pages + Workers ready.</span>
      </footer>
      <Toast.Container />
    </section>
  );
}
