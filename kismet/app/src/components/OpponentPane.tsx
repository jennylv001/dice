import React from "react";
import type { PlayerState, RoomStage } from "../../../shared/src/types.js";

type Thumb = { t_ms: number; luma64x36_b64: string } | null;
type Result = { values: number[]; score: number } | null;

type Props = {
  opponent: PlayerState | undefined;
  lastThumb: Thumb;
  lastResult: Result;
  stage: RoomStage;
};

export default function OpponentPane({ opponent, lastThumb, lastResult, stage }: Props) {
  const w = 128, h = 72;
  const imageUrl = lastThumb ? toCanvasData(lastThumb.luma64x36_b64, w, h) : null;
  const title = opponent ? opponent.name : "Awaiting challenger";
  const diceReady = opponent?.diceReady ?? false;

  return (
    <section className="card opponent-card" aria-live="polite" aria-label="Opponent status">
      <header className="card-header">
        <p className="eyebrow">Your rival</p>
        <h2>{title}</h2>
        {!opponent && <p className="card-sub">Share your table code. The duel awaits a worthy opponent.</p>}
      </header>
      <div className="opponent-body">
        <div className="thumb" role="img" aria-label={imageUrl ? "Opponent thumbnail" : "No thumbnail yet"}>
          {imageUrl ? <img src={imageUrl} width={w} height={h} alt="Opponent roll frame" /> : <span>No snapshot yet</span>}
        </div>
        <div className="opponent-stats">
          <div className="dice-stack" aria-label="Opponent dice values">
            {lastResult && lastResult.values.length > 0
              ? lastResult.values.map((v, i) => <span key={i} className="value-chip" aria-label={`Die ${i + 1} value ${v}`}>{v}</span>)
              : <span className="value-chip">—</span>}
          </div>
          <div className="rank-row">
            <span className={`rank-chip${diceReady ? " is-ready" : ""}`}>{diceReady ? "Dice locked" : "Dice needed"}</span>
            <span className="seal-score" aria-label="Seal confidence">{lastResult ? `${Math.round(lastResult.score * 100)}% verified` : stageCopy(stage)}</span>
          </div>
          <div className="stat-bar" aria-hidden="true"><div className="stat-fill" style={{ width: `${(lastResult?.score ?? 0) * 100}%` }} /></div>
        </div>
      </div>
    </section>
  );
}

function toCanvasData(b64: string, W: number, H: number) {
  try {
    const raw = atob(b64);
    const smallW = 64, smallH = 36;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const imgDataSmall = ctx.createImageData(smallW, smallH);
    for (let i = 0; i < smallW * smallH; i++) {
      const v = raw.charCodeAt(i);
      imgDataSmall.data[i * 4 + 0] = v;
      imgDataSmall.data[i * 4 + 1] = v;
      imgDataSmall.data[i * 4 + 2] = v;
      imgDataSmall.data[i * 4 + 3] = 255;
    }
    const tmp = document.createElement("canvas"); tmp.width = smallW; tmp.height = smallH;
    const tctx = tmp.getContext("2d")!;
    tctx.putImageData(imgDataSmall, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, W, H);
    return canvas.toDataURL("image/png");
  } catch { return null; }
}

function stageCopy(stage: RoomStage): string {
  switch (stage) {
    case "AWAITING_OPPONENT": return "Setting the stage";
    case "AWAITING_DICE": return "Prepping dice";
    case "READY": return "Battle ready";
    case "IN_PROGRESS": return "In the zone";
    case "COMPLETED": return "Game over";
    default: return stage;
  }
}
