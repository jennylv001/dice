import React from "react";
import type { GameResult } from "../rules/gameRules";

type Props = {
  result: GameResult;
  playerNames: Record<string, string>;  // userId -> name
  onPlayAgain: () => void;
  onLeave: () => void;
};

export default function GameResults({ result, playerNames, onPlayAgain, onLeave }: Props) {
  const isWinner = (userId: string) => userId === result.winner;

  return (
    <div className="game-results-overlay">
      <div className="game-results-card">
        <div className="results-header">
          {result.winner ? (
            <>
              <div className="trophy-icon">🏆</div>
              <h2 className="results-title">Victory!</h2>
              <p className="results-subtitle">{playerNames[result.winner] || result.winner} wins!</p>
            </>
          ) : (
            <>
              <div className="trophy-icon">🤝</div>
              <h2 className="results-title">It's a Tie!</h2>
              <p className="results-subtitle">Perfectly matched!</p>
            </>
          )}
        </div>

        <div className="results-body">
          <p className="results-reason">{result.reason}</p>

          <div className="results-scores">
            {Object.entries(result.scores).map(([userId, score]) => (
              <div key={userId} className={`score-row ${isWinner(userId) ? "winner" : ""}`}>
                <span className="player-name">
                  {isWinner(userId) && "👑 "}
                  {playerNames[userId] || userId}
                </span>
                <span className="player-score">{score} points</span>
                <span className="player-xp">+{result.xpRewards[userId] || 0} XP</span>
              </div>
            ))}
          </div>
        </div>

        <div className="results-actions">
          <button type="button" className="btn primary" onClick={onPlayAgain}>
            Play Again
          </button>
          <button type="button" className="btn ghost" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
