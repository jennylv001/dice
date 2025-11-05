import React, { useState } from "react";
import { Toast } from "./Toast";

type AuthMode = "login" | "signup";

type Props = {
  onAuth: (user: { id: string; name: string; email: string; token: string }) => void;
  onSkip?: () => void;
};

export default function AuthScreen({ onAuth, onSkip }: Props) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (!email || !password) {
      Toast.push("warn", "Please fill in all fields");
      return;
    }

    if (mode === "signup" && !name) {
      Toast.push("warn", "Please enter your name");
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: mode === "signup" ? name : undefined })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Authentication failed" }));
        throw new Error(error.error || "Authentication failed");
      }

      const data = await response.json();
      
      // Store token in localStorage
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("user_id", data.userId);
      localStorage.setItem("user_name", data.name);
      localStorage.setItem("user_email", data.email);

      Toast.push("success", mode === "login" ? "Welcome back!" : "Account created successfully!");
      onAuth({ id: data.userId, name: data.name, email: data.email, token: data.token });
    } catch (err: any) {
      Toast.push("error", err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGuestMode = () => {
    const guestId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const guestName = `Guest-${Math.random().toString(36).slice(2, 7)}`;
    
    localStorage.setItem("guest_mode", "true");
    localStorage.setItem("user_id", guestId);
    localStorage.setItem("user_name", guestName);
    
    Toast.push("info", "Playing as guest. Sign up to save progress!");
    if (onSkip) onSkip();
  };

  return (
    <div className="auth-screen">
      <div className="auth-container">
        <div className="auth-card card elevated">
          <div className="auth-header">
            <div className="auth-logo">
              <div className="logo-icon">🎲</div>
              <h1 className="logo-text">Kismet</h1>
            </div>
            <p className="auth-subtitle">
              {mode === "login" ? "Welcome back, roller" : "Start your journey"}
            </p>
          </div>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => setMode("login")}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab ${mode === "signup" ? "active" : ""}`}
              onClick={() => setMode("signup")}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === "signup" && (
              <div className="field">
                <label htmlFor="name" className="label">Name</label>
                <input
                  id="name"
                  type="text"
                  className="input"
                  placeholder="Dice Master"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required={mode === "signup"}
                  autoComplete="name"
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="email" className="label">Email</label>
              <input
                id="email"
                type="email"
                className="input"
                placeholder="roller@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="field">
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                type="password"
                className="input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
              {mode === "signup" && (
                <p className="field-hint">At least 8 characters</p>
              )}
            </div>

            <button
              type="submit"
              className="btn primary full-width"
              disabled={loading}
            >
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <button
            type="button"
            className="btn secondary full-width"
            onClick={handleGuestMode}
            disabled={loading}
          >
            Continue as Guest
          </button>

          <p className="auth-footer">
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              className="link-button"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>

        <div className="auth-features">
          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3>Cryptographic Proof</h3>
            <p>Every roll verified with tamper-proof seals</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📱</div>
            <h3>Universal Device Support</h3>
            <p>iPhone, Android, Tecno—any phone with a camera</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Real-time Duels</h3>
            <p>Live video & instant integrity verification</p>
          </div>
        </div>
      </div>
      <Toast.Container />
    </div>
  );
}
