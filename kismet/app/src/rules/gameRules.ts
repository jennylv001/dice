/**
 * Game Rules Engine for Kismet Dice Games
 * Implements rule enforcement and winner determination for different game modes
 */

import type { RoundHistory } from "../../../shared/src/types.js";

export type GameResult = {
  winner: string | null;  // userId of winner, null if tie
  scores: Record<string, number>;  // userId -> final score
  reason: string;  // Human-readable explanation
  xpRewards: Record<string, number>;  // userId -> XP earned
};

/**
 * Quick Duel Rules:
 * - Each player rolls once
 * - Highest total wins
 * - Ties go to highest single die
 * - Winner gets 50 XP, loser gets 10 XP
 */
export function evaluateQuickDuel(
  rounds: RoundHistory[],
  playerIds: string[]
): GameResult {
  if (rounds.length < playerIds.length) {
    return {
      winner: null,
      scores: {},
      reason: "Waiting for all players to roll",
      xpRewards: {}
    };
  }

  // Get most recent roll for each player
  const playerRolls: Record<string, { dice: number[]; timestamp: number }> = {};
  
  for (const round of rounds) {
    if (!playerRolls[round.userId] || round.timestamp > playerRolls[round.userId].timestamp) {
      playerRolls[round.userId] = {
        dice: round.dice,
        timestamp: round.timestamp
      };
    }
  }

  // Calculate scores (sum of dice)
  const scores: Record<string, number> = {};
  const maxDie: Record<string, number> = {};
  
  for (const playerId of playerIds) {
    const roll = playerRolls[playerId];
    if (roll) {
      scores[playerId] = roll.dice.reduce((sum, die) => sum + die, 0);
      maxDie[playerId] = Math.max(...roll.dice);
    } else {
      scores[playerId] = 0;
      maxDie[playerId] = 0;
    }
  }

  // Determine winner
  const maxScore = Math.max(...Object.values(scores));
  const winners = playerIds.filter(id => scores[id] === maxScore);

  let winner: string | null = null;
  let reason = "";

  if (winners.length === 1) {
    winner = winners[0];
    reason = `${winner} wins with ${maxScore} total!`;
  } else {
    // Tie-breaker: highest single die
    const maxDieValue = Math.max(...winners.map(id => maxDie[id]));
    const tiebreakWinners = winners.filter(id => maxDie[id] === maxDieValue);
    
    if (tiebreakWinners.length === 1) {
      winner = tiebreakWinners[0];
      reason = `${winner} wins on tiebreaker (highest die: ${maxDieValue})!`;
    } else {
      winner = null;
      reason = `Perfect tie! Both players rolled ${maxScore} total with highest die ${maxDieValue}`;
    }
  }

  // Calculate XP rewards
  const xpRewards: Record<string, number> = {};
  for (const playerId of playerIds) {
    if (playerId === winner) {
      xpRewards[playerId] = 50;  // Winner XP
    } else {
      xpRewards[playerId] = 10;  // Participation XP
    }
  }

  // Bonus XP for perfect roll (all 6s)
  for (const playerId of playerIds) {
    const roll = playerRolls[playerId];
    if (roll && roll.dice.every(die => die === 6)) {
      xpRewards[playerId] += 25;  // Perfect roll bonus
    }
  }

  return {
    winner,
    scores,
    reason,
    xpRewards
  };
}

/**
 * Practice Mode Rules:
 * - Single player
 * - No winner determination
 * - Fixed XP reward for completion
 */
export function evaluatePractice(
  rounds: RoundHistory[],
  playerId: string
): GameResult {
  const playerRounds = rounds.filter(r => r.userId === playerId);
  
  if (playerRounds.length === 0) {
    return {
      winner: null,
      scores: {},
      reason: "Practice session in progress",
      xpRewards: {}
    };
  }

  const lastRoll = playerRounds[playerRounds.length - 1];
  const total = lastRoll.dice.reduce((sum, die) => sum + die, 0);
  
  return {
    winner: playerId,
    scores: { [playerId]: total },
    reason: `Practice roll complete! Total: ${total}`,
    xpRewards: { [playerId]: 5 }  // Small XP for practice
  };
}

/**
 * Main game evaluation function
 * Routes to appropriate rules based on game mode
 */
export function evaluateGame(
  gameMode: string,
  rounds: RoundHistory[],
  playerIds: string[]
): GameResult {
  switch (gameMode) {
    case "quick-duel":
      return evaluateQuickDuel(rounds, playerIds);
    
    case "practice":
      return evaluatePractice(rounds, playerIds[0] || "unknown");
    
    // Future game modes
    case "craps":
    case "liars-dice":
    case "yahtzee":
    case "bunco":
      return {
        winner: null,
        scores: {},
        reason: `${gameMode} rules not yet implemented`,
        xpRewards: {}
      };
    
    default:
      return {
        winner: null,
        scores: {},
        reason: "Unknown game mode",
        xpRewards: {}
      };
  }
}

/**
 * Check if game is complete based on game mode rules
 */
export function isGameComplete(
  gameMode: string,
  rounds: RoundHistory[],
  playerIds: string[]
): boolean {
  switch (gameMode) {
    case "quick-duel":
      // Complete when all players have rolled at least once
      const playerRolls = new Set(rounds.map(r => r.userId));
      return playerIds.every(id => playerRolls.has(id));
    
    case "practice":
      // Complete after first roll
      return rounds.length > 0;
    
    default:
      return false;
  }
}
