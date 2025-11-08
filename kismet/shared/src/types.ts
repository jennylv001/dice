export type Nonces = { session: string; stim: string };

export enum GamePhase {
  JOINING = "JOINING",
  LOBBY = "LOBBY",
  VERIFYING = "VERIFYING",
  TURN_READY = "TURN_READY",
  ROLLING = "ROLLING",
  SEALING = "SEALING",
  SEALED = "SEALED",
  WAITING = "WAITING"
}

export enum RoomStage {
  AWAITING_OPPONENT = "AWAITING_OPPONENT",
  AWAITING_DICE = "AWAITING_DICE",
  READY = "READY",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED"
}

export type PlayerRole = "host" | "challenger" | "spectator";

export type DiceValue = {
  id: string;
  value: number;
  confidence: number;
  settle_t_ms: number;
  tumble_count: number;
};

export type Liveness = {
  r_luma: number;
  barcode_err: number;
  haptic_imu_ms: number;
  chirp_snr: number;
  vio_imu_dev: number;
};

export type Channels = { video: boolean; audio: boolean; haptics: boolean; imu: boolean };

export type StreamRoots = { video: string; imu: string; audio: string };
export type AuditFrame = { t_ms: number; luma64x36_b64: string };

export type Proof = {
  version: number;
  dice: DiceValue[];
  stream_roots: StreamRoots;
  liveness: Liveness;
  channels: Channels;
  timing: { t_start: number; t_settle: number; t_send: number };
  nonces: Nonces;
  webauthn: { publicKeyJwk: JsonWebKey; attestationFmt: "webcrypto"; signatureB64u: string };
  audit: { frames: AuditFrame[] };
};

export type RPv1 = {
  match_id: string;
  round_id: string;
  roller_user_id: string;
  opponent_user_id: string;
  timestamp_server: number;
  dice_values: number[];
  proof_digest_b64u: string;
  device_sig_b64u: string;
  integrity_scores: { overall: number; per_die: number[] };
  ui_meta: { fx_seed_b64u: string };
};

export type RoundHistory = {
  round_id: string;
  userId: string;
  dice: number[];
  score: number;
  timestamp: number;
};

export type PlayerState = {
  userId: string;
  name: string;
  role: PlayerRole;
  spectator: boolean;
  phase: GamePhase;
  streak: number;
  xp: number;
  level: number; // authoritative level derived from xp
  avatar: string; // avatar URL or emoji
  diceReady: boolean;
  connected: boolean;
};

export type RoomStatePayload = {
  roomId: string;
  createdAt: number;
  stage: RoomStage;
  hostId: string | null;
  challengerId: string | null;
  players: PlayerState[];
  order: string[];
  currentIdx: number;
  phase: GamePhase;
  roundHistory: RoundHistory[];
  turnStartTime: number | null;
  gameMode: GameMode; // unified enum
  winner: string | null; // null until resolved
};

export type GameMode =
  | "QUICK_DUEL"
  | "PRACTICE"
  | "CRAPS"
  | "LIARS_DICE"
  | "YAHTZEE"
  | "BUNCO";

export type GameResult = {
  winnerId: string | null;
  scores: Array<{ userId: string; total: number; highest: number }>;
  xpAwards: Record<string, number>;
};

export type UserProfile = {
  id: string;
  email: string;
  name: string;
  avatar: string;
  xp: number;
  level: number;
  createdAt: number;
  isGuest?: boolean; // guest profiles do not persist server-side
};

export type AuthToken = {
  token: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
};

export type ApiStartRollRes = {
  nonces_b64u: Nonces;
  schedule: { luma: number[]; barcode: number[]; haptics: number[]; chirps: { tMs: number; freq: number }[]; durMs: number };
  round_id: string;
};

export type JoinPayload = { roomId: string; userId: string; spectator?: boolean; token: string; role: PlayerRole };

export type WSFromClient =
  | { t: "join"; p: JoinPayload }
  | { t: "ready" }
  | { t: "start_verification" }
  | { t: "rtc_want"; p: { enable: boolean } }
  | { t: "rtc_offer"; p: { sdp: string } }
  | { t: "rtc_answer"; p: { sdp: string } }
  | { t: "rtc_ice"; p: { candidate: RTCIceCandidateInit } }
  | { t: "dice_status"; p: { ready: boolean } }
  | { t: "ping" };

export type WSFromServer =
  | { t: "joined"; p: { roomId: string; you: string; opp?: string; spectator?: boolean } }
  | { t: "your_turn"; p: { round_id: string } }
  | { t: "phase"; p: { phase: GamePhase; userId?: string } }
  | { t: "opp_result"; p: RPv1 }
  | { t: "opp_thumb"; p: { t_ms: number; luma64x36_b64: string } }
  | { t: "rtc_want"; p: { from: string; enable: boolean } }
  | { t: "rtc_offer"; p: { from: string; sdp: string } }
  | { t: "rtc_answer"; p: { from: string; sdp: string } }
  | { t: "rtc_ice"; p: { from: string; candidate: RTCIceCandidateInit } }
  | { t: "state"; p: RoomStatePayload }
  | { t: "room_stage"; p: { stage: RoomStage } }
  | { t: "toast"; p: { kind: "info" | "warn" | "error"; text: string } }
  | { t: "pong" };
