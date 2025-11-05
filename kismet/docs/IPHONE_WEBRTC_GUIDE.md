# iPhone WebRTC & WebSocket Integration Guide

## Executive Summary

This document provides comprehensive guidance for ensuring robust WebRTC and WebSocket connections on iOS devices (iPhone/iPad), with specific focus on Safari's implementation quirks, iOS permissions, and network resilience strategies.

## iOS/Safari-Specific Considerations

### 1. WebRTC Support Matrix

**iOS Safari WebRTC Capabilities:**

| Feature | iOS 11-13 | iOS 14-15 | iOS 16+ | Notes |
|---------|-----------|-----------|---------|-------|
| getUserMedia (camera) | ✅ | ✅ | ✅ | Requires HTTPS |
| getUserMedia (mic) | ✅ | ✅ | ✅ | Requires HTTPS |
| RTCPeerConnection | ✅ | ✅ | ✅ | STUN/TURN support |
| RTCDataChannel | ✅ | ✅ | ✅ | For non-media data |
| Screen Capture | ❌ | ❌ | ✅ | iOS 16+ only |
| Multiple cameras | ⚠️ | ✅ | ✅ | Limited on older devices |
| H.264 codec | ✅ | ✅ | ✅ | Preferred over VP8/VP9 |
| WebSocket over TLS | ✅ | ✅ | ✅ | WSS required |

### 2. Permission Handling

**Camera/Microphone Permissions:**

```typescript
// Best practice: Request permissions with user context
async function requestMediaPermissions(videoConfig: MediaTrackConstraints) {
  try {
    // iOS requires specific constraints to avoid permission denial
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },  // Rear camera
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 60 }
      },
      audio: {
        echoCancellation: false,  // Critical for chirp detection
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: { ideal: 48000 }
      }
    });
    
    // iOS Safari: Permissions persist until browser restart or cache clear
    return stream;
  } catch (error) {
    if (error.name === "NotAllowedError") {
      // User denied permission - show instructions to enable in Settings
      return handlePermissionDenied();
    } else if (error.name === "NotFoundError") {
      // Device has no camera (rare on iPhone)
      return handleNoCamera();
    }
    throw error;
  }
}

function handlePermissionDenied(): void {
  // iOS-specific guidance
  showDialog({
    title: "Camera Access Required",
    message: "To play Kismet, enable camera access:\n\n" +
             "1. Open iPhone Settings\n" +
             "2. Scroll to Safari\n" +
             "3. Tap Camera\n" +
             "4. Select 'Allow'\n\n" +
             "Then refresh this page.",
    actions: [
      { label: "Open Settings", url: "app-settings:" },  // Deep link (may not work)
      { label: "Later", dismissible: true }
    ]
  });
}
```

**Device Motion/Orientation (IMU):**

```typescript
// iOS 13+ requires explicit permission for devicemotion events
async function requestMotionPermission(): Promise<boolean> {
  if (typeof DeviceMotionEvent !== "undefined" && 
      typeof (DeviceMotionEvent as any).requestPermission === "function") {
    // iOS 13+ requires user gesture to trigger permission request
    try {
      const response = await (DeviceMotionEvent as any).requestPermission();
      return response === "granted";
    } catch (error) {
      console.warn("Motion permission denied or unsupported:", error);
      return false;
    }
  }
  // Older iOS or non-iOS: no permission needed
  return true;
}

// Trigger from user interaction (button click)
document.getElementById("enable-imu-btn")?.addEventListener("click", async () => {
  const granted = await requestMotionPermission();
  if (granted) {
    window.addEventListener("devicemotion", handleMotionEvent);
  } else {
    Toast.push("warn", "IMU access denied. Integrity scores may be lower.");
  }
});
```

### 3. WebRTC Connection Optimization

**STUN/TURN Server Configuration:**

```typescript
interface TURNConfig {
  iceServers: RTCIceServer[];
  iceCandidatePoolSize?: number;
  iceTransportPolicy?: "all" | "relay";
}

// Current implementation (app/src/components/LiveRTC.tsx)
const FALLBACK_STUN = [{ urls: "stun:stun.l.google.com:19302" }];

async function getOptimalIceServers(): Promise<RTCIceServer[]> {
  try {
    // Fetch TURN credentials from worker API
    const turnResponse = await apiGetTurnServers();
    if (turnResponse.iceServers?.length) {
      return turnResponse.iceServers;
    }
  } catch (error) {
    console.warn("TURN unavailable, falling back to public STUN:", error);
  }
  
  // iOS-optimized STUN servers (lower latency for US/EU)
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" }
  ];
}

// Create RTCPeerConnection with iOS-friendly config
function createPeerConnection(iceServers: RTCIceServer[]): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize: 10,  // Pre-gather candidates
    iceTransportPolicy: "all",  // Try STUN first, TURN if needed
    bundlePolicy: "max-bundle",  // Reduce port usage
    rtcpMuxPolicy: "require"  // Multiplex RTP/RTCP
  });
}
```

**Handling iOS Network Transitions:**

```typescript
// iOS switches between WiFi/Cellular frequently
class ResilientPeerConnection {
  private pc: RTCPeerConnection;
  private reconnectAttempts = 0;
  private maxReconnects = 3;
  
  constructor(config: RTCConfiguration) {
    this.pc = new RTCPeerConnection(config);
    this.setupConnectionMonitoring();
  }
  
  private setupConnectionMonitoring() {
    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState;
      console.log("ICE connection state:", state);
      
      if (state === "disconnected" || state === "failed") {
        this.handleDisconnection();
      } else if (state === "connected" || state === "completed") {
        this.reconnectAttempts = 0;  // Reset on success
      }
    };
    
    // iOS-specific: Listen for network change events
    if ("connection" in navigator) {
      (navigator as any).connection?.addEventListener("change", () => {
        console.log("Network type changed:", (navigator as any).connection.effectiveType);
        this.handleNetworkTransition();
      });
    }
  }
  
  private async handleDisconnection() {
    if (this.reconnectAttempts >= this.maxReconnects) {
      Toast.push("error", "Connection lost. Please check your network and refresh.");
      return;
    }
    
    this.reconnectAttempts++;
    Toast.push("info", `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnects})`);
    
    // ICE restart negotiation
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      // Send offer to peer via WebSocket signaling
      sendSignalingMessage({ type: "offer", sdp: offer.sdp });
    } catch (error) {
      console.error("ICE restart failed:", error);
    }
  }
  
  private handleNetworkTransition() {
    // Proactively gather new ICE candidates when network changes
    const sender = this.pc.getSenders()[0];
    if (sender) {
      sender.replaceTrack(sender.track);  // Triggers new candidate gathering
    }
  }
}
```

**Low-Resolution Optimization:**

```typescript
// Current implementation uses 320x180 @ 24fps
// Further optimization for poor connections:
async function adaptiveVideoConstraints(connectionQuality: "poor" | "fair" | "good"): Promise<MediaTrackConstraints> {
  const configs = {
    poor: {
      width: { ideal: 240 },
      height: { ideal: 135 },
      frameRate: { ideal: 15 }
    },
    fair: {
      width: { ideal: 320 },
      height: { ideal: 180 },
      frameRate: { ideal: 24 }
    },
    good: {
      width: { ideal: 640 },
      height: { ideal: 360 },
      frameRate: { ideal: 30 }
    }
  };
  
  return {
    ...configs[connectionQuality],
    facingMode: { ideal: "environment" }
  };
}

// Dynamically adjust based on connection stats
async function monitorConnectionQuality(pc: RTCPeerConnection) {
  setInterval(async () => {
    const stats = await pc.getStats();
    let totalBytesReceived = 0;
    let packetsLost = 0;
    
    stats.forEach(report => {
      if (report.type === "inbound-rtp" && report.mediaType === "video") {
        totalBytesReceived = report.bytesReceived;
        packetsLost = report.packetsLost;
      }
    });
    
    const quality = packetsLost > 100 ? "poor" : (packetsLost > 30 ? "fair" : "good");
    if (quality === "poor") {
      Toast.push("warn", "Connection quality degraded. Reducing video quality.");
      // Trigger constraint adjustment
    }
  }, 5000);  // Check every 5 seconds
}
```

### 4. WebSocket Resilience

**Connection Lifecycle Management:**

```typescript
// Enhanced version of app/src/net/ws.ts
class ResilientWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private reconnectAttempts = 0;
  private messageQueue: string[] = [];
  private onMessageCallback: (msg: any) => void;
  private heartbeatInterval: number | null = null;
  
  constructor(url: string, onMessage: (msg: any) => void) {
    this.url = url;
    this.onMessageCallback = onMessage;
    this.connect();
  }
  
  private connect() {
    try {
      this.ws = new WebSocket(this.url);
      
      this.ws.onopen = () => {
        console.log("WebSocket connected");
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        this.flushMessageQueue();
        this.startHeartbeat();
      };
      
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.onMessageCallback(msg);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
      
      this.ws.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        this.stopHeartbeat();
        
        // Don't reconnect if intentionally closed
        if (event.code !== 1000) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error("WebSocket connection failed:", error);
      this.scheduleReconnect();
    }
  }
  
  private scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  }
  
  private startHeartbeat() {
    // iOS Safari suspends inactive tabs; heartbeat keeps connection alive
    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ t: "ping" }));
      }
    }, 30000);  // Every 30 seconds
  }
  
  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  send(message: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      // Queue message for when connection restores
      this.messageQueue.push(message);
      if (this.messageQueue.length > 100) {
        this.messageQueue.shift();  // Drop oldest
      }
    }
  }
  
  private flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift()!;
      this.ws?.send(msg);
    }
  }
  
  close() {
    this.stopHeartbeat();
    this.ws?.close(1000, "Client disconnect");
  }
}
```

**iOS Background/Foreground Handling:**

```typescript
// iOS suspends WebSocket connections when app goes to background
// Implement reconnection on foreground return
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    console.log("App returned to foreground");
    // Check WebSocket state and reconnect if needed
    if (wsConnection.readyState !== WebSocket.OPEN) {
      wsConnection.reconnect();
    }
    
    // Refresh room state from server
    apiGetRoom(currentRoomId).then(updateRoomState);
  } else {
    console.log("App went to background");
    // Optionally close connection to save battery
    // wsConnection.close();
  }
});

// iOS-specific: Listen for page cache (bfcache) events
window.addEventListener("pageshow", (event) => {
  if ((event as any).persisted) {
    // Page restored from bfcache (user pressed back button)
    console.log("Page restored from cache, checking connections");
    verifyConnectionsAndReconnect();
  }
});
```

### 5. State Management & Synchronization

**Eventual Consistency with Durable Objects:**

```typescript
// Current state sync via WebSocket messages (see worker/src/do_room.ts)
// Enhanced with conflict resolution for iOS network interruptions

interface StateUpdate {
  version: number;  // Incremental version number
  timestamp: number;
  updates: Partial<RoomStatePayload>;
}

class StateSynchronizer {
  private localState: RoomStatePayload;
  private stateVersion = 0;
  private pendingUpdates: StateUpdate[] = [];
  
  handleServerState(serverState: RoomStatePayload, version: number) {
    if (version <= this.stateVersion) {
      // Stale update, ignore
      return;
    }
    
    // Merge server state with optimistic local updates
    const merged = this.mergeStates(serverState, this.pendingUpdates);
    this.localState = merged;
    this.stateVersion = version;
    
    // Clear pending updates that were acknowledged
    this.pendingUpdates = this.pendingUpdates.filter(u => u.version > version);
  }
  
  private mergeStates(server: RoomStatePayload, pending: StateUpdate[]): RoomStatePayload {
    let merged = { ...server };
    
    // Apply pending updates in order
    for (const update of pending) {
      // Custom merge logic per field to avoid conflicts
      if (update.updates.players) {
        merged.players = this.mergePlayers(merged.players, update.updates.players);
      }
      // ... other fields
    }
    
    return merged;
  }
  
  private mergePlayers(server: PlayerState[], local: PlayerState[]): PlayerState[] {
    // Keep server as source of truth for most fields
    // Preserve local optimistic updates for user's own state
    const merged = [...server];
    const localUserId = getCurrentUserId();
    const localPlayer = local.find(p => p.userId === localUserId);
    
    if (localPlayer) {
      const serverIndex = merged.findIndex(p => p.userId === localUserId);
      if (serverIndex >= 0) {
        // Merge: keep server's XP/streak, keep local's phase/diceReady
        merged[serverIndex] = {
          ...merged[serverIndex],
          phase: localPlayer.phase,
          diceReady: localPlayer.diceReady
        };
      }
    }
    
    return merged;
  }
}
```

**Optimistic UI Updates:**

```typescript
// Show immediate feedback for user actions, reconcile with server later
function handleDiceReadyToggle(ready: boolean) {
  // Optimistic update to local state
  updateLocalPlayerState({ diceReady: ready });
  
  // Send to server
  const ws = getWebSocket();
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ t: "dice_status", p: { ready } }));
  } else {
    // Queue for retry
    queueStateUpdate({ diceReady: ready });
  }
  
  // Server will broadcast authoritative state back
  // If there's a mismatch, reconcile with server's version
}
```

### 6. Error Handling & User Feedback

**iOS-Specific Error Messages:**

```typescript
interface ErrorContext {
  code: string;
  userMessage: string;
  technicalDetails: string;
  suggestedAction: string;
  iOSSpecific: boolean;
}

const errorHandlers: Record<string, ErrorContext> = {
  CAMERA_PERMISSION_DENIED: {
    code: "CAMERA_PERMISSION_DENIED",
    userMessage: "Camera access is required to play Kismet.",
    technicalDetails: "getUserMedia NotAllowedError",
    suggestedAction: "Enable camera access in iPhone Settings > Safari > Camera",
    iOSSpecific: true
  },
  MOTION_PERMISSION_DENIED: {
    code: "MOTION_PERMISSION_DENIED",
    userMessage: "Motion sensors improve roll integrity.",
    technicalDetails: "DeviceMotionEvent.requestPermission denied",
    suggestedAction: "Enable Motion & Orientation in iPhone Settings > Safari",
    iOSSpecific: true
  },
  WEBRTC_CONNECTION_FAILED: {
    code: "WEBRTC_CONNECTION_FAILED",
    userMessage: "Live video connection failed. Using thumbnails instead.",
    technicalDetails: "RTCPeerConnection failed after 3 STUN/TURN attempts",
    suggestedAction: "Check WiFi/cellular connection. Video is optional for gameplay.",
    iOSSpecific: false
  },
  WEBSOCKET_TIMEOUT: {
    code: "WEBSOCKET_TIMEOUT",
    userMessage: "Connection to game server lost.",
    technicalDetails: "WebSocket readyState !== OPEN after 30s",
    suggestedAction: "Check network connection and refresh page.",
    iOSSpecific: false
  },
  LOW_INTEGRITY_ROLL: {
    code: "LOW_INTEGRITY_ROLL",
    userMessage: "Roll quality was low. Try better lighting.",
    technicalDetails: "Liveness score < 0.5 (poor luma correlation)",
    suggestedAction: "Ensure good lighting, steady camera, and clear dice view.",
    iOSSpecific: false
  }
};

function showError(errorCode: string, additionalContext?: any) {
  const error = errorHandlers[errorCode];
  if (!error) {
    console.error("Unknown error code:", errorCode);
    return;
  }
  
  // Log for debugging
  console.error(`[${error.code}] ${error.technicalDetails}`, additionalContext);
  
  // Show user-friendly message
  Toast.push("error", error.userMessage);
  
  // Offer detailed help if iOS-specific
  if (error.iOSSpecific && isIOS()) {
    setTimeout(() => {
      showHelpDialog({
        title: "iOS Setup Help",
        message: error.suggestedAction,
        actions: [
          { label: "Got it", dismissible: true },
          { label: "View Tutorial", url: "/help/ios-permissions" }
        ]
      });
    }, 2000);
  }
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || 
         (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);  // iPad on iOS 13+
}
```

### 7. Performance Optimization

**Memory Management (iOS Safari < 1GB limit for web apps):**

```typescript
// Aggressive memory cleanup for video frames
class FrameBuffer {
  private frames: Uint8ClampedArray[] = [];
  private maxFrames = 120;  // 2 seconds @ 60fps
  
  addFrame(frame: Uint8ClampedArray) {
    this.frames.push(frame);
    if (this.frames.length > this.maxFrames) {
      // Drop oldest frame and allow GC
      this.frames.shift();
    }
  }
  
  clear() {
    // Help GC by explicitly nulling references
    this.frames.length = 0;
  }
  
  getRecentFrames(count: number): Uint8ClampedArray[] {
    return this.frames.slice(-count);
  }
}

// Avoid memory leaks with video elements
function cleanupVideoElement(videoEl: HTMLVideoElement) {
  const stream = videoEl.srcObject as MediaStream;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  videoEl.srcObject = null;
  videoEl.load();  // Force release of resources
}
```

**Battery Optimization:**

```typescript
// Reduce frame rate when not actively rolling
class AdaptiveCapture {
  private captureRate = 60;  // fps
  
  adjustCaptureRate(isActive: boolean) {
    if (isActive) {
      this.captureRate = 60;  // Full speed during roll
    } else {
      this.captureRate = 15;  // Low speed when idle (for preview)
    }
    // Update requestAnimationFrame tick rate
  }
  
  pauseWhenBackgrounded() {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.captureRate = 0;  // Stop capture
      } else {
        this.captureRate = 15;  // Resume at low rate
      }
    });
  }
}
```

### 8. Testing & Debugging

**iOS Safari Remote Debugging:**

1. **Enable Web Inspector on iPhone:**
   - Settings > Safari > Advanced > Web Inspector: ON

2. **Connect to Mac:**
   - Connect iPhone via USB
   - Open Safari on Mac > Develop menu > [Your iPhone] > [Page URL]

3. **Console Logging:**
```typescript
// iOS Safari console has limited history
// Log critical events to localStorage for post-mortem analysis
class PersistentLogger {
  private logs: string[] = [];
  private maxLogs = 1000;
  
  log(level: "info" | "warn" | "error", message: string, data?: any) {
    const entry = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
    console[level](entry, data);
    
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    // Persist to localStorage
    try {
      localStorage.setItem("kismet_logs", JSON.stringify(this.logs.slice(-100)));
    } catch {
      // localStorage full or unavailable
    }
  }
  
  exportLogs(): string {
    return this.logs.join("\n");
  }
}

// Add debug panel for beta testers
function showDebugPanel() {
  const logs = new PersistentLogger().exportLogs();
  const diagnostics = {
    userAgent: navigator.userAgent,
    webRTCSupport: "RTCPeerConnection" in window,
    webSocketSupport: "WebSocket" in window,
    cameraCount: navigator.mediaDevices?.enumerateDevices ? "checking..." : "unavailable",
    networkType: (navigator as any).connection?.effectiveType,
    memoryUsage: (performance as any).memory?.usedJSHeapSize
  };
  
  showModal({
    title: "Debug Info",
    content: `
      <h3>System Info</h3>
      <pre>${JSON.stringify(diagnostics, null, 2)}</pre>
      <h3>Recent Logs</h3>
      <pre>${logs}</pre>
      <button onclick="copyToClipboard(this.previousElementSibling.textContent)">Copy Logs</button>
    `
  });
}
```

**Network Simulation:**

```typescript
// Test resilience under poor conditions
// iOS doesn't have native network throttling like Chrome DevTools
// Simulate latency/packet loss in code for testing:

class NetworkSimulator {
  private latencyMs = 0;
  private packetLossRate = 0;
  
  setConditions(latency: number, loss: number) {
    this.latencyMs = latency;
    this.packetLossRate = loss;
  }
  
  async simulateRequest<T>(request: () => Promise<T>): Promise<T> {
    // Simulate packet loss
    if (Math.random() < this.packetLossRate) {
      throw new Error("Simulated packet loss");
    }
    
    // Simulate latency
    if (this.latencyMs > 0) {
      await new Promise(r => setTimeout(r, this.latencyMs));
    }
    
    return request();
  }
}

// Usage in development:
const simulator = new NetworkSimulator();
simulator.setConditions(500, 0.1);  // 500ms latency, 10% loss

const apiCall = simulator.simulateRequest(() => apiGetRoom(roomId));
```

## Deployment Checklist

**Pre-Launch iOS Verification:**

- [ ] Test on physical iPhone devices (not just simulator)
  - [ ] iPhone SE (2020) - oldest supported model
  - [ ] iPhone 12 Pro - typical mid-range
  - [ ] iPhone 15 Pro Max - latest flagship
- [ ] Test on different iOS versions
  - [ ] iOS 15 (minimum supported)
  - [ ] iOS 16
  - [ ] iOS 17 (latest)
- [ ] Test network conditions
  - [ ] WiFi (strong signal)
  - [ ] WiFi (weak signal, 1-2 bars)
  - [ ] 5G cellular
  - [ ] 4G LTE cellular
  - [ ] 3G cellular (if still supported in region)
  - [ ] WiFi → Cellular transition
- [ ] Test permission flows
  - [ ] Fresh install (all permissions denied)
  - [ ] Permissions granted then revoked
  - [ ] Motion permission denied but camera allowed
- [ ] Test lifecycle events
  - [ ] App backgrounded during roll
  - [ ] Phone locked/unlocked
  - [ ] Incoming phone call interruption
  - [ ] Low power mode enabled
- [ ] Test edge cases
  - [ ] Multiple tabs open (Safari background tab throttling)
  - [ ] Safari private browsing mode
  - [ ] Content blockers enabled
  - [ ] VPN active
- [ ] Performance benchmarks
  - [ ] Roll-to-seal time < 3 seconds (p50) on iPhone 12+
  - [ ] WebRTC connection establishment < 5 seconds (p95)
  - [ ] WebSocket reconnection < 2 seconds (p95)
  - [ ] Memory usage < 150MB sustained

## Known Issues & Workarounds

### Issue 1: Safari Suspends Timers in Background
**Problem:** `setTimeout` and `setInterval` throttled to ~1 second when tab inactive.

**Workaround:**
```typescript
// Use Web Workers for critical timers
const worker = new Worker("/timer-worker.js");
worker.postMessage({ action: "startTimer", interval: 100 });
worker.onmessage = (e) => {
  if (e.data.tick) {
    handleCriticalTimer();
  }
};
```

### Issue 2: WebRTC Fails on Cellular with Strict NAT
**Problem:** Some cellular carriers (e.g., T-Mobile) block UDP, preventing STUN.

**Workaround:**
- Implement TURN server fallback (Cloudflare, Twilio)
- Gracefully degrade to thumbnail-only mode
- Show clear error message: "Live video unavailable on current network"

### Issue 3: Camera Orientation Incorrect
**Problem:** Video element shows rotated image on some iPhones.

**Workaround:**
```css
/* CSS transform based on detected orientation */
video.ios-landscape {
  transform: rotate(90deg);
}
```

```typescript
// Detect and apply correction
window.addEventListener("orientationchange", () => {
  const orientation = (screen as any).orientation?.type || 
                     (window.orientation === 90 || window.orientation === -90 ? "landscape" : "portrait");
  videoEl.classList.toggle("ios-landscape", orientation.includes("landscape"));
});
```

### Issue 4: Audio Context Requires User Gesture
**Problem:** `AudioContext` won't start until user interaction on iOS.

**Workaround:**
```typescript
// Resume on first touch
let audioContextResumed = false;
document.addEventListener("touchstart", async () => {
  if (!audioContextResumed && audioCtx.state === "suspended") {
    await audioCtx.resume();
    audioContextResumed = true;
  }
}, { once: true });
```

## Future Enhancements

### iOS 17+ Features to Leverage

1. **Lock Screen Widgets:** Show current match status
2. **Live Activities:** Real-time turn notifications
3. **SharePlay:** Multi-player sessions via FaceTime
4. **App Clips:** Instant access without full install
5. **WebPush (iOS 16.4+):** Push notifications for match invites

### Progressive Web App (PWA) Improvements

```json
// manifest.webmanifest enhancements
{
  "display": "standalone",
  "orientation": "portrait",
  "ios": {
    "splash_screens": [
      {
        "src": "/splash-iphone-x.png",
        "media": "(device-width: 375px) and (device-height: 812px)"
      }
    ]
  },
  "prefer_related_applications": false
}
```

## Summary

Ensuring robust WebRTC and WebSocket connections on iPhone requires:

1. **Permission Handling:** Explicit user consent flows with clear instructions
2. **Connection Resilience:** Automatic reconnection with exponential backoff
3. **Network Adaptivity:** Graceful degradation under poor conditions
4. **State Synchronization:** Optimistic updates with eventual consistency
5. **Performance Optimization:** Memory management and battery conservation
6. **Thorough Testing:** Physical devices across iOS versions and networks

The current Kismet implementation has a solid foundation. The additions in this guide (resilient WebSocket class, iOS-specific error handling, adaptive video quality) will further harden the experience for iPhone users, ensuring that dice duels remain fair, fast, and frustration-free even on cellular connections.

---

*Last Updated: 2025-11-05*  
*Target Platforms: iOS 15+, Safari 15+*  
*Testing Coverage: iPhone SE (2020) through iPhone 15 Pro Max*
