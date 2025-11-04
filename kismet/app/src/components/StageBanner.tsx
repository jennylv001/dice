import React from "react";
import type { RoomStage } from "../../../shared/src/types.js";

type Props = {
  stage: RoomStage;
  roomId: string;
  onLeave: () => void;
};

const stageCopy: Record<RoomStage, { title: string; body: string }> = {
  AWAITING_OPPONENT: {
    title: "Table set, challenger wanted",
    body: "Share your table code. Your opponent is out there, waiting to test their luck."
  },
  AWAITING_DICE: {
    title: "Show us what you've got",
    body: "Hold your real dice steady. Both players must be verified before the battle begins."
  },
  READY: {
    title: "All systems go",
    body: "Dice verified. Cameras rolling. The server's picking who goes first."
  },
  IN_PROGRESS: {
    title: "The duel is live",
    body: "Turns are rolling. Keep your dice and camera visible throughout the match."
  },
  COMPLETED: {
    title: "Victory or defeat — it's sealed",
    body: "Match history saved. Leave or start fresh with another challenger."
  }
};

export default function StageBanner({ stage, roomId, onLeave }: Props) {
  const copy = stageCopy[stage];
  return (
    <div className="stage-banner" role="status" aria-live="polite">
      <div className="stage-meta">
        <span className="stage-label">Table {roomId}</span>
        <strong className="stage-title">{copy.title}</strong>
        <p className="stage-body">{copy.body}</p>
      </div>
      <button className="btn ghost" type="button" onClick={onLeave}>Bail out</button>
    </div>
  );
}
