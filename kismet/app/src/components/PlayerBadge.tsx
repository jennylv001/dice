import React, { useMemo } from "react";
import clsx from "clsx";
import DefaultAvatar from "../assets/default-avatar.svg";

type Size = "lg" | "md" | "sm";
type Orientation = "horizontal" | "vertical";

type Props = {
  name: string;
  level?: number;
  avatar?: string;
  subtitle?: string;
  size?: Size;
  orientation?: Orientation;
  accent?: React.ReactNode;
};

export default function PlayerBadge({ name, level, avatar, subtitle, size = "md", orientation = "horizontal", accent }: Props) {
  const initials = useMemo(() => {
    if (!name) return "?";
    const words = name.trim().split(/\s+/).slice(0, 2);
    return words.map(part => part[0]?.toUpperCase() || "").join("") || name[0]?.toUpperCase() || "?";
  }, [name]);
  const hasAvatar = Boolean(avatar);

  return (
    <div
      className={clsx(
        "player-badge",
        `player-badge--${size}`,
        `player-badge--${orientation}`,
        accent && `player-badge--accent-${accent}`
      )}
      tabIndex={0}
      aria-label={subtitle ? `${name}, ${subtitle}` : name}
      role="group"
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.currentTarget.click();
        }
      }}
    >
      <span
        className="player-badge__avatar"
        role={hasAvatar ? undefined : "img"}
        aria-label={hasAvatar ? undefined : `${name} avatar placeholder`}
        style={{ outline: 'none' }}
      >
        {hasAvatar
          ? <img src={avatar} alt={`${name} avatar`} loading="lazy" style={{ borderRadius: '50%' }} />
          : <img src={DefaultAvatar} alt="Default avatar" style={{ width: "100%", height: "100%" }} />}
      </span>
      <span className="player-badge__info">
        <span className="player-badge__name" style={{ color: '#222', fontWeight: 600 }}>{name}</span>
        {typeof level === "number" && (
          <span
            className="player-badge__level"
            aria-label={`Level ${level}`}
            style={{ color: '#005a9e', background: '#e6f7ff', borderRadius: 4, padding: '0 4px' }}
          >
            Lvl {level}
          </span>
        )}
        {subtitle && <span className="player-badge__subtitle" style={{ color: '#555' }}>{subtitle}</span>}
      </span>
      {accent && <span className="player-badge__accent">{accent}</span>}
    </div>
  );
}