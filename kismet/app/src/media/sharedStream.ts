// Singleton camera stream management to avoid competing getUserMedia calls between
// verification capture (CameraRoller) and LiveRTC peer connection.
// Provides lazy acquisition and reuse; supports listeners for availability changes.
export type SharedCameraStream = {
  get: () => Promise<MediaStream>;
  release: () => void; // reference-count release (for future use)
  onReady: (cb: (s: MediaStream) => void) => () => void;
};

let stream: MediaStream | null = null;
let acquiring: Promise<MediaStream> | null = null;
const listeners = new Set<(s: MediaStream) => void>();

async function acquire(): Promise<MediaStream> {
  if (stream) return stream;
  if (acquiring) return acquiring;
  acquiring = (async () => {
    // Prefer environment camera, fallback gracefully.
    const primary: MediaStreamConstraints = { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, min: 24 } } as any, audio: false };
    const fallback: MediaStreamConstraints = { video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, min: 24 } } as any, audio: false };
    try {
      stream = await navigator.mediaDevices.getUserMedia(primary);
    } catch (err) {
      stream = await navigator.mediaDevices.getUserMedia(fallback);
    }
    // Attach ended handlers to auto-clear and allow reacquisition.
    stream.getVideoTracks().forEach(t => {
      t.addEventListener("ended", () => {
        stream = null;
        acquiring = null;
      });
    });
    for (const cb of listeners) cb(stream);
    return stream;
  })();
  try {
    return await acquiring;
  } finally {
    acquiring = null; // allow future re-acquisition if stream dropped
  }
}

export const sharedCamera: SharedCameraStream = {
  get: acquire,
  release() {
    // For potential future ref counting; currently we keep stream alive for session.
  },
  onReady(cb) {
    listeners.add(cb);
    if (stream) cb(stream);
    return () => listeners.delete(cb);
  }
};
