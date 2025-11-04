import React from "react";
import type { GamePhase } from "../../../shared/src/types.js";

const PHASE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  JOINING: { label: "Joining table…", color: "#9fb2c7", icon: "⏳" },
  LOBBY: { label: "In the lobby", color: "#7cf5d3", icon: "👥" },
  VERIFYING: { label: "Checking dice", color: "#ffcd70", icon: "🔍" },
  TURN_READY: { label: "Your moment", color: "#7cf5d3", icon: "🎲" },
  ROLLING: { label: "Rolling now", color: "#ffcd70", icon: "⚡" },
  SEALING: { label: "Sealing proof…", color: "#61dafb", icon: "🔒" },
  SEALED: { label: "Verified ✓", color: "#7cf5d3", icon: "✓" },
  WAITING: { label: "On standby", color: "#9fb2c7", icon: "⏸" }
};

export default function PhaseIndicator({ phase, compact = false }: { phase: GamePhase; compact?: boolean }) {
  const config = PHASE_CONFIG[phase] || PHASE_CONFIG.LOBBY;
  const style: (React.CSSProperties & { "--phase-color"?: string }) = {
    "--phase-color": config.color
  };

  return (
    <div className="phase-indicator" style={style}>
      <span className="phase-icon">{config.icon}</span>
      {!compact && <span className="phase-label">{config.label}</span>}
      <div className="phase-pulse"></div>
    </div>
  );
}
