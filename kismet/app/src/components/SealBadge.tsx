import React from "react";

function tier(score: number | null): { label: string; color: string } {
  if (score === null) return { label: "Ready", color: "#9fb2c7" };
  if (score >= 0.8) return { label: "Integrity: High", color: "#2fbf71" };
  if (score >= 0.5) return { label: "Integrity: Medium", color: "#f2a100" };
  return { label: "Integrity: Low", color: "#d9534f" };
}

export default function SealBadge({ score }: { score: number | null }) {
  const t = tier(score);
  return <div className="seal" style={{ color: t.color }}>{t.label}</div>;
}
