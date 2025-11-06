import React, { useEffect, useState } from "react";
import { apiListOpenRooms, type OpenRoomEntry } from "../net/api";

type Props = {
  onJoinRoom: (roomId: string) => void;
  onCreateRoom: () => void;
  onBack: () => void;
};

export default function RoomList({ onJoinRoom, onCreateRoom, onBack }: Props) {
  const [rooms, setRooms] = useState<OpenRoomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadRooms() {
      try {
        setLoading(true);
        const result = await apiListOpenRooms();
        if (!cancelled) {
          setRooms(result);
        }
      } catch (error) {
        console.error("Failed to load rooms:", error);
        if (!cancelled) {
          setRooms([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadRooms();

    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      setRefreshKey(k => k + 1);
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshKey]);

  const getRoomStatus = (room: OpenRoomEntry): "waiting" | "active" | "full" => {
    // Simple heuristic based on room data
    // In a real implementation, this would come from the server
    return "waiting";
  };

  const getTimeSince = (timestamp: number): string => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="room-list-container">
      <div className="room-list-header">
        <button type="button" className="btn ghost" onClick={onBack} style={{ marginBottom: "var(--space-4)" }}>
          ← Back to Game Selection
        </button>
        <h1 className="room-list-title">Available Rooms</h1>
        <p className="room-list-subtitle">Join an existing duel or create your own table</p>
      </div>

      <div style={{ marginBottom: "var(--space-6)" }}>
        <button type="button" className="btn primary" onClick={onCreateRoom}>
          + Create New Room
        </button>
      </div>

      {loading ? (
        <div className="loading-state" style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--muted)" }}>
          <div style={{ fontSize: "2rem", marginBottom: "var(--space-3)" }}>🎲</div>
          <p>Loading active rooms...</p>
        </div>
      ) : rooms.length > 0 ? (
        <div className="room-grid">
          {rooms.map(room => {
            const status = getRoomStatus(room);
            return (
              <button
                key={room.roomId}
                type="button"
                className="room-card"
                onClick={() => onJoinRoom(room.roomId)}
              >
                <div className="room-card-header">
                  <div className="room-id">{room.roomId.toUpperCase()}</div>
                  <div className={`room-status ${status}`}>
                    <span className="room-status-dot" />
                    {status === "waiting" && "Waiting"}
                    {status === "active" && "Active"}
                    {status === "full" && "Full"}
                  </div>
                </div>

                <div className="room-info">
                  <div className="room-host">
                    <span className="room-host-avatar">🎲</span>
                    <span className="room-host-name">{room.hostName}</span>
                  </div>

                  <div className="room-meta">
                    <span className="room-meta-item">
                      <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M8 8a3 3 0 100-6 3 3 0 000 6zm2.735 1.5A4.994 4.994 0 018 8.5c-1.01 0-1.926.3-2.7.8C3.79 10.076 3 11.415 3 13h10c0-1.585-.79-2.924-2.265-3.5z"/>
                      </svg>
                      1/2 players
                    </span>
                    <span className="room-meta-item">
                      <svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="2" fill="none"/>
                        <path d="M8 3v5l3 3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
                      </svg>
                      {getTimeSince(room.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="room-actions">
                  <span className="btn-text" style={{ color: "var(--accent)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
                    Join Room →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">🎲</div>
          <p className="empty-state-text">No active rooms</p>
          <p className="empty-state-hint">Create a new room to start a duel</p>
        </div>
      )}
    </div>
  );
}
