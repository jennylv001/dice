import React from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export default function ConnectionStatusIndicator({ status }: { status: ConnectionStatus }) {
  if (status === "connected") {
    return null; // Don't show anything when connected normally
  }

  const statusConfig = {
    connecting: {
      text: "Connecting...",
      className: "status-connecting",
      icon: "🔄"
    },
    disconnected: {
      text: "Disconnected",
      className: "status-disconnected",
      icon: "⚠️"
    },
    reconnecting: {
      text: "Reconnecting...",
      className: "status-reconnecting",
      icon: "🔄"
    }
  };

  const config = statusConfig[status];

  return (
    <div className={`connection-status ${config.className}`}>
      <span className="status-icon">{config.icon}</span>
      <span className="status-text">{config.text}</span>
    </div>
  );
}
