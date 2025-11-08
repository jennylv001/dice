/** Unified Game Rules Engine (provider-based architecture)
 * Exports new evaluateGameOutcome + transitional legacy wrappers.
 */
import type { GameMode, GameResult, RoomStatePayload, RoundHistory, RoomStage } from "../../../shared/src/types.js";
import { GamePhase, RoomStage as RoomStageEnum } from "../../../shared/src/types.js";

type ScoreComputation = { total: number; highest: number };
const XP_WIN = 50;
const XP_PARTICIPATE = 10;
const XP_PERFECT = 25;

export function evaluateGameOutcome(room: RoomStatePayload): GameResult {
  const scores = room.players
    .filter(p => !p.spectator)
    .map(p => ({ userId: p.userId, ...computeScore(room.roundHistory, p.userId, room.gameMode) }));
  const winnerId = determineWinner(scores, room.gameMode);
  const xpAwards: Record<string, number> = {};
  for (const { userId, total, highest } of scores) {
    let xp = XP_PARTICIPATE;
    if (userId === winnerId) xp += XP_WIN;
    if (isPerfect(total, highest, room.gameMode)) xp += XP_PERFECT;
    xpAwards[userId] = xp;
  }
  return { winnerId, scores, xpAwards };
}

function computeScore(history: RoundHistory[], userId: string, mode: GameMode): ScoreComputation {
  const rounds = history.filter(r => r.userId === userId);
  if (rounds.length === 0) return { total: 0, highest: 0 };
  switch (mode) {
    case "QUICK_DUEL":
    case "PRACTICE": {
      let total = 0; let highest = 0;
      for (const round of rounds) {
        const roundTotal = round.dice.reduce((s, d) => s + d, 0);
        const roundMax = Math.max(...round.dice, 0);
        total += roundTotal;
        highest = Math.max(highest, roundMax);
      }
      return { total, highest };
    }
    default: {
      return {
        total: rounds.reduce((sum, r) => sum + r.dice.reduce((a, b) => a + b, 0), 0),
        highest: rounds.reduce((m, r) => Math.max(m, Math.max(...r.dice, 0)), 0)
      };
    }
  }
}

function determineWinner(scores: Array<ScoreComputation & { userId: string }>, mode: GameMode): string | null {
  if (!scores.length) return null;
  switch (mode) {
    case "QUICK_DUEL":
    case "PRACTICE": {
      const sorted = [...scores].sort((a, b) => b.total === a.total ? b.highest - a.highest : b.total - a.total);
      const top = sorted[0];
      const tie = sorted.some((s, i) => i > 0 && s.total === top.total && s.highest === top.highest);
      return tie ? null : top.userId;
    }
    default: return null;
  }
}

function isPerfect(total: number, highest: number, mode: GameMode) {
  if (mode !== "QUICK_DUEL" && mode !== "PRACTICE") return false;
  return total >= 12 && highest === 6; // simplistic perfect criteria
}

export function calculateLevel(xp: number): number {
  return Math.max(1, Math.floor(xp / 150) + 1);
}

/** Apply awarded XP to a base XP value and derive new level (centralized). */
export function applyXp(baseXp: number, award: number): { xp: number; level: number } {
  const nextXp = Math.max(0, baseXp + Math.max(0, award));
  return { xp: nextXp, level: calculateLevel(nextXp) };
}

// Transitional wrappers (legacy API signature)
export function evaluateGame(gameMode: string, rounds: RoundHistory[], playerIds: string[]): { winner: string | null; scores: Record<string, number>; reason: string; xpRewards: Record<string, number> } {
  const modeMap: Record<string, GameMode> = {
    "quick-duel": "QUICK_DUEL",
    "practice": "PRACTICE"
  };
  const room: RoomStatePayload = {
    roomId: "legacy",
    createdAt: Date.now(),
    stage: RoomStageEnum.COMPLETED as RoomStage,
    hostId: null,
    challengerId: null,
    players: playerIds.map(id => ({ userId: id, name: id, role: "challenger", spectator: false, phase: GamePhase.SEALED, streak: 0, xp: 0, level: 1, avatar: "🎲", diceReady: true, connected: true })),
    order: playerIds,
    currentIdx: 0,
    phase: GamePhase.SEALED,
    roundHistory: rounds,
    turnStartTime: null,
    gameMode: modeMap[gameMode] || "QUICK_DUEL",
    winner: null
  };
  const outcome = evaluateGameOutcome(room);
  return {
    winner: outcome.winnerId,
    scores: Object.fromEntries(outcome.scores.map(s => [s.userId, s.total])),
    reason: outcome.winnerId ? `${outcome.winnerId} wins` : "Tie",
    xpRewards: outcome.xpAwards
  };
}

export function isGameComplete(gameMode: string, rounds: RoundHistory[], playerIds: string[]): boolean {
  if (gameMode === "practice") return rounds.some(r => r.userId === playerIds[0]);
  if (gameMode === "quick-duel") {
    const rollers = new Set(rounds.map(r => r.userId));
    return playerIds.every(id => rollers.has(id));
  }
  return false;
}
