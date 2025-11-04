import React from "react";

type Props = {
  xp: number;
  streak: number;
  level?: number;
};

export default function PlayerStats({ xp, streak, level }: Props) {
  const computedLevel = level ?? Math.floor(xp / 100) + 1;
  const xpInLevel = xp % 100;
  const xpToNext = 100;
  const progress = (xpInLevel / xpToNext) * 100;

  return (
    <div className="player-stats">
      <div className="stat-row">
        <span className="stat-label">Level</span>
        <span className="stat-value level-badge">{computedLevel}</span>
      </div>
      <div className="stat-row">
        <span className="stat-label">XP</span>
        <span className="stat-value">{xp}</span>
      </div>
      <div className="xp-progress-wrap">
        <div className="xp-progress-bar">
          <div className="xp-progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="xp-progress-text">{xpInLevel} / {xpToNext}</div>
      </div>
      {streak > 0 && (
        <div className="streak-badge">
          <span className="streak-icon">🔥</span>
          <span className="streak-value">{streak}x Streak</span>
        </div>
      )}
    </div>
  );
}
