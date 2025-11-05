import React, { useState } from "react";

const AVATAR_OPTIONS = [
  "🎲", "🎯", "🎰", "🃏", "🎪", "🎭", "🎨", "🎸",
  "🚀", "⚡", "🔥", "💎", "👑", "🦁", "🐉", "🦅",
  "🌟", "⭐", "✨", "💫", "🌈", "🎃", "🎄", "🎁"
];

type Props = {
  selected: string;
  onSelect: (avatar: string) => void;
};

export default function AvatarSelector({ selected, onSelect }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="avatar-selector">
      <label className="label">Avatar</label>
      <button
        type="button"
        className="avatar-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select avatar"
      >
        <span className="avatar-display">{selected || "🎲"}</span>
        <span className="avatar-label">Choose</span>
      </button>
      
      {isOpen && (
        <div className="avatar-grid" role="listbox" aria-label="Avatar options">
          {AVATAR_OPTIONS.map(avatar => (
            <button
              key={avatar}
              type="button"
              className={`avatar-option ${selected === avatar ? "selected" : ""}`}
              onClick={() => {
                onSelect(avatar);
                setIsOpen(false);
              }}
              role="option"
              aria-selected={selected === avatar}
            >
              {avatar}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
