import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "../../../shared/src/types.js";
import { apiLogin, apiSignUp } from "../net/api";

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; token: string; profile: UserProfile; expiresAt: number };

type SignUpPayload = { email: string; password: string; name?: string; avatar?: string };

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  signUp: (payload: SignUpPayload) => Promise<void>;
  logout: () => void;
  updateProfile: (profile: UserProfile) => void;
  guest: (name?: string) => void; // create guest session
};

const AUTH_STORAGE_KEY = "kismet.auth.v1";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) {
        setState({ status: "unauthenticated" });
        return;
      }
      const parsed = JSON.parse(raw) as { token?: string; profile?: UserProfile; expiresAt?: number } | null;
      if (parsed?.token && parsed.profile && parsed.expiresAt && parsed.expiresAt > Date.now()) {
        setState({ status: "authenticated", token: parsed.token, profile: parsed.profile, expiresAt: parsed.expiresAt });
      } else {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        setState({ status: "unauthenticated" });
      }
    } catch {
      setState({ status: "unauthenticated" });
    }
  }, []);

  const persist = useCallback((token: string, profile: UserProfile, expiresAt: number) => {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify({ token, profile, expiresAt });
    window.localStorage.setItem(AUTH_STORAGE_KEY, payload);
  }, []);

  const clear = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    persist(res.token, res.profile, res.expiresAt);
    setState({ status: "authenticated", token: res.token, profile: res.profile, expiresAt: res.expiresAt });
  }, [persist]);

  const signUp = useCallback(async (payload: SignUpPayload) => {
    const res = await apiSignUp(payload);
    persist(res.token, res.profile, res.expiresAt);
    setState({ status: "authenticated", token: res.token, profile: res.profile, expiresAt: res.expiresAt });
  }, [persist]);

  const logout = useCallback(() => {
    clear();
    setState({ status: "unauthenticated" });
  }, [clear]);

  const updateProfile = useCallback((profile: UserProfile) => {
    setState(prev => {
      if (prev.status !== "authenticated") return prev;
      persist(prev.token, profile, prev.expiresAt);
      return { ...prev, profile };
    });
  }, [persist]);

  const guest = useCallback((name?: string) => {
    const id = `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const profile: UserProfile = {
      id,
      email: `${id}@guest.invalid`,
      name: name || `Guest-${Math.random().toString(36).slice(2,5)}`,
      avatar: "🎲",
      xp: 0,
      level: 1,
      createdAt: Date.now(),
      isGuest: true
    };
    // guest token synthetic short-lived (30m) just for client gating; server may treat missing token as guest.
    const token = `guest.${btoa(id).replace(/=+/g,'')}`;
    const expiresAt = Date.now() + 30 * 60 * 1000;
    persist(token, profile, expiresAt);
    setState({ status: "authenticated", token, profile, expiresAt });
  }, [persist]);

  const value = useMemo<AuthContextValue>(() => ({ state, login, signUp, logout, updateProfile, guest }), [state, login, signUp, logout, updateProfile, guest]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
