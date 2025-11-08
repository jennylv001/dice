import React, { useCallback, useMemo, useState } from "react";
import { useAuth } from "../providers/AuthProvider";
import { Toast } from "./Toast";

type Mode = "login" | "signup";

export default function AuthScreen() {
  const { login, signUp, guest } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [busy, setBusy] = useState(false);

  const title = mode === "login" ? "Welcome back" : "Create your Kismet ID";
  const subtitle = mode === "login"
    ? "Securely access tournaments, leaderboards and your full match history."
    : "Claim your handle, choose an avatar and start climbing the ladder.";

  const primaryAction = useMemo(() => mode === "login" ? "Sign in" : "Create account", [mode]);

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
        Toast.push("info", "Signed in. Time to roll.");
      } else {
        await signUp({ email: email.trim(), password, name: name.trim() || undefined, avatar: avatar.trim() || undefined });
        Toast.push("info", "Account ready. Let's duel.");
      }
    } catch (err) {
      const message = extractMessage(err);
      Toast.push("error", message);
    } finally {
      setBusy(false);
    }
  }, [avatar, busy, email, login, mode, name, password, signUp]);

  return (
    <section className="card entry-card" aria-labelledby="auth-heading">
      <header className="card-header">
        <p className="eyebrow">Authenticated access</p>
        <h1 id="auth-heading">{title}</h1>
        <p className="card-sub">{subtitle}</p>
      </header>
      <div className="lobby-tabs" role="tablist" aria-label="Authentication mode">
        <button
          className={`lobby-tab${mode === "login" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          onClick={() => setMode("login")}
        >Sign in</button>
        <button
          className={`lobby-tab${mode === "signup" ? " is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          onClick={() => setMode("signup")}
        >Create account</button>
      </div>
  <form className="form-grid" onSubmit={handleSubmit} aria-label="Authentication">
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label className="label" htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            className="input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={busy}
          />
        </div>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label className="label" htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            className="input"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            disabled={busy}
          />
        </div>
        {mode === "signup" && (
          <>
            <div className="field">
              <label className="label" htmlFor="auth-name">Display name</label>
              <input
                id="auth-name"
                className="input"
                placeholder="Dice Monarch"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="auth-avatar">Avatar URL</label>
              <input
                id="auth-avatar"
                className="input"
                placeholder="https://avatars.githubusercontent.com/u/123"
                value={avatar}
                onChange={(event) => setAvatar(event.target.value)}
                disabled={busy}
              />
            </div>
          </>
        )}
        <button className="btn primary" type="submit" disabled={busy} style={{ gridColumn: "span 2" }}>
          {busy ? "Securing credentials…" : primaryAction}
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          style={{ gridColumn: "span 2" }}
          onClick={() => {
            guest();
            Toast.push("info", "Guest session started. Limited persistence.");
          }}
        >Play as Guest</button>
      </form>
      <footer className="card-footer" role="note">
        <span className="kbd">ZERO TRUST</span>
        <span>Multi-factor ready. Passwords hashed, tokens short-lived. Built for enterprise play.</span>
      </footer>
      <Toast.Container />
    </section>
  );
}

function extractMessage(error: unknown): string {
  if (!error) return "Unexpected failure";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "Authentication failed";
}
