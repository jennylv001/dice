import React from "react";

type GameMode = {
  id: string;
  name: string;
  description: string;
  icon: string;
  players: string;
  duration: string;
  difficulty: "Easy" | "Medium" | "Hard";
  color: string;
  available: boolean;
};

const gameModes: GameMode[] = [
  {
    id: "craps",
    name: "Craps",
    description: "Classic casino dice game with pass/don't pass betting",
    icon: "🎲",
    players: "2-8",
    duration: "10-20 min",
    difficulty: "Medium",
    color: "var(--accent)",
    available: false
  },
  {
    id: "liars-dice",
    name: "Liar's Dice",
    description: "Bluff your way to victory with sealed rolls and challenges",
    icon: "🎭",
    players: "2-6",
    duration: "15-30 min",
    difficulty: "Medium",
    color: "var(--accent-2)",
    available: false
  },
  {
    id: "yahtzee",
    name: "Yahtzee",
    description: "Score big with strategic re-rolls and category combos",
    icon: "🎯",
    players: "1-4",
    duration: "20-30 min",
    difficulty: "Easy",
    color: "var(--accent-warm)",
    available: false
  },
  {
    id: "bunco",
    name: "Bunco",
    description: "Fast-paced team rolling with round targets",
    icon: "🎊",
    players: "4-12",
    duration: "15-25 min",
    difficulty: "Easy",
    color: "var(--success)",
    available: false
  },
  {
    id: "quick-duel",
    name: "Quick Duel",
    description: "Head-to-head dice showdown with instant results",
    icon: "⚡",
    players: "2",
    duration: "2-5 min",
    difficulty: "Easy",
    color: "var(--accent)",
    available: true
  },
  {
    id: "practice",
    name: "Practice Roll",
    description: "Test your dice and camera setup without opponents",
    icon: "🎯",
    players: "1",
    duration: "1-2 min",
    difficulty: "Easy",
    color: "var(--muted)",
    available: true
  }
];

type Props = {
  onSelectMode: (modeId: string) => void;
  onBack?: () => void;
};

export default function GameModeSelect({ onSelectMode, onBack }: Props) {
  return (
    <div className="game-mode-screen">
      <div className="mode-header">
        {onBack && (
          <button type="button" className="btn ghost" onClick={onBack} aria-label="Go back">
            ← Back
          </button>
        )}
        <div>
          <h1 className="mode-title">Choose Your Game</h1>
          <p className="mode-subtitle">Select a game mode to begin your dice journey</p>
        </div>
      </div>

      <div className="mode-grid">
        {gameModes.map(mode => (
          <button
            key={mode.id}
            type="button"
            className={`game-card ${!mode.available ? "disabled" : ""}`}
            onClick={() => mode.available && onSelectMode(mode.id)}
            disabled={!mode.available}
            aria-label={`${mode.name}: ${mode.description}`}
          >
            <div className="game-card-header">
              <div className="game-icon" style={{ color: mode.color }}>
                {mode.icon}
              </div>
              {!mode.available && (
                <span className="badge-soon">Coming Soon</span>
              )}
            </div>

            <div className="game-card-body">
              <h3 className="game-name">{mode.name}</h3>
              <p className="game-description">{mode.description}</p>
            </div>

            <div className="game-card-footer">
              <div className="game-meta">
                <span className="meta-item">
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 8a3 3 0 100-6 3 3 0 000 6zm2.735 1.5A4.994 4.994 0 018 8.5c-1.01 0-1.926.3-2.7.8C3.79 10.076 3 11.415 3 13h10c0-1.585-.79-2.924-2.265-3.5z"/>
                  </svg>
                  {mode.players}
                </span>
                <span className="meta-item">
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8 14s-6-5.686-6-9a6 6 0 1112 0c0 3.314-6 9-6 9zm0-6.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/>
                  </svg>
                  {mode.duration}
                </span>
                <span className={`badge-difficulty badge-${mode.difficulty.toLowerCase()}`}>
                  {mode.difficulty}
                </span>
              </div>
            </div>

            {mode.available && (
              <div className="game-card-overlay" aria-hidden="true">
                <span className="play-text">Play Now →</span>
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="mode-info card">
        <div className="info-icon">💡</div>
        <div>
          <h3>New to Kismet?</h3>
          <p>Start with <strong>Quick Duel</strong> or <strong>Practice Roll</strong> to learn the basics. More game modes coming soon!</p>
        </div>
      </div>
    </div>
  );
}
