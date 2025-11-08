import type { GameMode, GameResult, RoomStatePayload, RoundHistory } from "./types.js";

type ScoreComputation = {
  total: number;
  highest: number;
};

const XP_WIN = 50;
const XP_PARTICIPATE = 10;
const XP_PERFECT = 25;

export function evaluateGameOutcome(room: RoomStatePayload): GameResult {
  const scores = room.players
    .filter(player => !player.spectator)
    .map(({ userId }) => ({ userId, ...computeScore(room.roundHistory, userId, room.gameMode) }));

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

export function calculateLevel(xp: number): number {
  // Simple leveling curve: level up every 150 XP, min level 1.
  return Math.max(1, Math.floor(xp / 150) + 1);
}

function computeScore(history: RoundHistory[], userId: string, mode: GameMode): ScoreComputation {
  const rounds = history.filter(entry => entry.userId === userId);
  if (rounds.length === 0) return { total: 0, highest: 0 };

  switch (mode) {
    case "QUICK_DUEL":
    case "PRACTICE": {
      let total = 0;
      let highest = 0;
      for (const round of rounds) {
        const roundTotal = round.dice.reduce((sum, die) => sum + die, 0);
        const roundMax = Math.max(...round.dice, 0);
        total += roundTotal;
        highest = Math.max(highest, roundMax);
      }
      return { total, highest };
    }
    default:
      // Placeholder for future mode-specific scoring rules.
      return {
        total: rounds.reduce((sum, round) => sum + round.dice.reduce((a, b) => a + b, 0), 0),
        highest: rounds.reduce((max, round) => Math.max(max, Math.max(...round.dice, 0)), 0)
      };
  }
}

function determineWinner(scores: Array<ScoreComputation & { userId: string }>, mode: GameMode): string | null {
  if (scores.length === 0) return null;

  switch (mode) {
    case "QUICK_DUEL":
    case "PRACTICE": {
      const sorted = [...scores].sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return b.highest - a.highest;
      });
      const top = sorted[0];
      const isTie = sorted.some((score, index) => index > 0 && score.total === top.total && score.highest === top.highest);
      return isTie ? null : top.userId;
    }
    default:
      return null;
  }
}

function isPerfect(total: number, highest: number, mode: GameMode) {
  if (mode !== "QUICK_DUEL" && mode !== "PRACTICE") return false;
  // Perfect roll requires all dice showing 6 in a standard two-die duel (total 12).
  return total >= 12 && highest === 6;
}
