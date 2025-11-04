import React from "react";
import type { RoundHistory } from "../../../shared/src/types.js";

type Props = {
  history: RoundHistory[];
  userId: string;
};

export default function RoundTimeline({ history, userId }: Props) {
  if (!history.length) return null;

  return (
    <div className="round-timeline">
      <h4>Recent Rounds</h4>
      <div className="timeline-list">
        {history.slice().reverse().map((round, idx) => {
          const isYou = round.userId === userId;
          const scoreClass = round.score >= 0.8 ? "score-high" : round.score >= 0.5 ? "score-mid" : "score-low";
          
          return (
            <div key={round.round_id} className={`timeline-item ${isYou ? "is-you" : ""}`}>
              <div className="timeline-meta">
                <span className="timeline-user">{isYou ? "You" : round.userId}</span>
                <span className="timeline-time">{formatRelativeTime(round.timestamp)}</span>
              </div>
              <div className="timeline-dice">
                {round.dice.map((val, i) => (
                  <span key={i} className="dice-pip">{val}</span>
                ))}
              </div>
              <div className={`timeline-score ${scoreClass}`}>
                {Math.round(round.score * 100)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatRelativeTime(ts: number): string {
  const delta = Date.now() - ts;
  const sec = Math.floor(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}
