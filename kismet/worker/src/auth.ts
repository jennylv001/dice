import { kvGet, kvPutTTL } from "./kv.js";
import type { Env } from "./kv.js";
import type { UserProfile, AuthToken } from "./types.js";

type StoredCredential = {
  userId: string;
  salt: string;
  hash: string;
  createdAt: number;
};

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const PROFILE_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

export async function signUp(env: Env, params: { email: string; password: string; name: string; avatar?: string }): Promise<
  | { ok: true; profile: UserProfile; token: AuthToken }
  | { ok: false; error: string }
> {
  const email = normaliseEmail(params.email);
  if (!email) return { ok: false, error: "invalid_email" };
  const existing = await kvGet<StoredCredential>(env.KISMET_KV, kvKeyCredential(email));
  if (existing) return { ok: false, error: "email_exists" };

  const userId = `usr_${crypto.randomUUID()}`;
  const salt = randomToken();
  const hash = await hashPassword(params.password, salt);
  const createdAt = Date.now();

  const profile: UserProfile = {
    id: userId,
    email,
    name: params.name.trim().slice(0, 64) || "Roller",
    avatar: sanitiseAvatar(params.avatar),
    xp: 0,
    level: 1,
    createdAt
  };

  await kvPutTTL(env.KISMET_KV, kvKeyCredential(email), { userId, salt, hash, createdAt }, PROFILE_TTL_SECONDS);
  await kvPutTTL(env.KISMET_KV, kvKeyProfile(userId), profile, PROFILE_TTL_SECONDS);

  const token = await issueToken(env, userId);
  return { ok: true, profile, token };
}

export async function login(env: Env, params: { email: string; password: string }): Promise<
  | { ok: true; profile: UserProfile; token: AuthToken }
  | { ok: false; error: string }
> {
  const email = normaliseEmail(params.email);
  if (!email) return { ok: false, error: "invalid_email" };
  const credential = await kvGet<StoredCredential>(env.KISMET_KV, kvKeyCredential(email));
  if (!credential) return { ok: false, error: "not_found" };

  const hash = await hashPassword(params.password, credential.salt);
  if (hash !== credential.hash) return { ok: false, error: "invalid_password" };

  const profile = await kvGet<UserProfile>(env.KISMET_KV, kvKeyProfile(credential.userId));
  if (!profile) return { ok: false, error: "profile_missing" };

  const token = await issueToken(env, credential.userId);
  return { ok: true, profile, token };
}

export async function getProfileByToken(env: Env, token: string): Promise<UserProfile | null> {
  const session = await kvGet<AuthToken>(env.KISMET_KV, kvKeySession(token));
  if (!session) return null;
  if (session.expiresAt < Date.now()) return null;
  return kvGet<UserProfile>(env.KISMET_KV, kvKeyProfile(session.userId));
}

export async function getProfileById(env: Env, userId: string): Promise<UserProfile | null> {
  return kvGet<UserProfile>(env.KISMET_KV, kvKeyProfile(userId));
}

export async function updateProfile(env: Env, profile: UserProfile): Promise<void> {
  await kvPutTTL(env.KISMET_KV, kvKeyProfile(profile.id), profile, PROFILE_TTL_SECONDS);
}

export function sanitiseAvatar(value?: string): string {
  const fallback = "🎲";
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 4);
}

function kvKeyCredential(email: string) {
  return `auth:cred:${email}`;
}

function kvKeyProfile(userId: string) {
  return `auth:profile:${userId}`;
}

function kvKeySession(token: string) {
  return `auth:session:${token}`;
}

async function issueToken(env: Env, userId: string): Promise<AuthToken> {
  const token = randomToken();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + TOKEN_TTL_SECONDS * 1000;
  const record: AuthToken = { token, userId, issuedAt, expiresAt };
  await kvPutTTL(env.KISMET_KV, kvKeySession(token), record, TOKEN_TTL_SECONDS);
  return record;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(new Uint8Array(digest));
}

function bufferToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bufferToHex(bytes);
}

function normaliseEmail(email?: string): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return null;
  return trimmed;
}
