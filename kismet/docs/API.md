# Kismet API Documentation

## Base URL
Production: `https://your-pages-domain.pages.dev`
Local Dev: `http://localhost:5173` (proxies to Worker at `:8787`)

## Authentication
Most endpoints require a `token` parameter. Tokens are generated when creating or joining a room and must be included in subsequent requests.

## Rate Limits
| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/start-roll` | 5 requests | 60 seconds |
| `/api/submit-roll` | 5 requests | 60 seconds |
| `/api/rooms/{roomId}/join` | 10 requests | 60 seconds |
| WebSocket connections | 5 connections | 300 seconds |

Rate limit headers:
- `retry-after`: Seconds until rate limit resets
- Response status: `429 Too Many Requests`

---

## REST API Endpoints

### Create Room

**POST** `/api/rooms`

Creates a new game room and returns host credentials.

**Request Body**:
```json
{
  "hostName": "Player1"  // Optional, defaults to auto-generated name
}
```

**Response** (200):
```json
{
  "roomId": "abc123xyz",
  "playerId": "host-uuid",
  "token": "auth-token-xyz",
  "playerName": "Player1",
  "room": {
    "roomId": "abc123xyz",
    "stage": "AWAITING_OPPONENT",
    "players": [...],
    ...
  }
}
```

**Error Responses**:
- `500`: Room creation failed

---

### List Open Rooms

**GET** `/api/rooms/open`

Returns list of rooms awaiting opponents.

**Response** (200):
```json
{
  "rooms": [
    {
      "roomId": "abc123",
      "hostName": "Player1",
      "createdAt": 1699123456789
    }
  ]
}
```

---

### Join Room

**POST** `/api/rooms/{roomId}/join`

Join an existing room as challenger or spectator.

**Path Parameters**:
- `roomId` (string): The room ID to join

**Request Body**:
```json
{
  "name": "Player2",
  "role": "challenger"  // or "spectator"
}
```

**Response** (200):
```json
{
  "roomId": "abc123",
  "playerId": "challenger-uuid",
  "token": "auth-token-xyz",
  "playerName": "Player2",
  "room": { ... }
}
```

**Error Responses**:
- `400`: Missing name parameter
- `404`: Room not found
- `409`: Room already full

---

### Get Room State

**GET** `/api/rooms/{roomId}`

Retrieve current room state.

**Path Parameters**:
- `roomId` (string): The room ID

**Response** (200):
```json
{
  "room": {
    "roomId": "abc123",
    "createdAt": 1699123456789,
    "stage": "IN_PROGRESS",
    "hostId": "host-uuid",
    "challengerId": "challenger-uuid",
    "players": [
      {
        "userId": "host-uuid",
        "name": "Player1",
        "role": "host",
        "spectator": false,
        "phase": "ROLLING",
        "xp": 150,
        "diceReady": true,
        "connected": true
      }
    ],
    "order": ["host-uuid", "challenger-uuid"],
    "currentIdx": 0,
    "phase": "ROLLING",
    "roundHistory": [],
    "turnStartTime": 1699123500000
  }
}
```

---

### Start Roll

**POST** `/api/start-roll`

Request nonces and stimulus schedule to begin a roll.

**Request Body**:
```json
{
  "roomId": "abc123",
  "userId": "player-uuid",
  "token": "auth-token"
}
```

**Response** (200):
```json
{
  "nonces_b64u": {
    "session": "base64url-encoded-nonce",
    "stim": "base64url-encoded-stim-nonce"
  },
  "schedule": {
    "durMs": 1400,
    "luma": [1.0, 1.01, 0.99, ...],  // 60fps brightness modulation
    "barcode": [0, 0, 1, 0, 1, ...],  // Frame indices for barcode
    "haptics": [300, 800, 1200],      // Vibration timestamps (ms)
    "chirps": [
      { "tMs": 450, "freq": 17300 },
      { "tMs": 950, "freq": 19300 }
    ]
  },
  "round_id": "round-hash"
}
```

**Error Responses**:
- `400`: Missing parameters
- `403`: Unauthorized (invalid token)
- `429`: Rate limit exceeded

**Notes**:
- Nonces expire in 120 seconds
- Each nonce can only be used once
- Stimulus schedule is deterministic from stim nonce

---

### Submit Roll

**POST** `/api/submit-roll?roomId={roomId}&userId={userId}&token={token}`

Submit completed proof after roll.

**Query Parameters**:
- `roomId` (string): Room ID
- `userId` (string): Player ID
- `token` (string): Auth token

**Request Body**: See [Proof Schema](#proof-schema)

**Response** (200):
```json
{
  "ok": true
}
```

**Error Responses**:
- `400`: Proof verification failed
  ```json
  {
    "ok": false,
    "reason": "visual_liveness" | "insufficient_channels" | "tumble_low" | "sig_invalid" | "nonce_mismatch" | "version_mismatch"
  }
  ```
- `403`: Unauthorized
- `429`: Rate limit exceeded

**Verification Steps**:
1. Check protocol version (must be 1)
2. Verify nonce match with stored values
3. Verify liveness thresholds:
   - `r_luma >= 0.82` (visual correlation)
   - `barcode_err <= 0.25` (barcode detection)
   - `haptic_imu_ms <= 10` (haptic-IMU alignment)
   - `chirp_snr >= 6` (audio chirp detection)
   - `vio_imu_dev <= 0.35` (visual-inertial odometry)
   - `tumble_count >= 2` per die
4. Verify ECDSA signature (P-256)
5. Check Merkle root sizes (32 bytes each)
6. Calculate integrity score

---

### TURN Credentials

**POST** `/api/turn`

Get TURN server credentials for WebRTC (if needed for NAT traversal).

**Request Body**:
```json
{
  "roomId": "abc123",
  "userId": "player-uuid",
  "token": "auth-token"
}
```

**Response** (200):
```json
{
  "iceServers": [
    {
      "urls": "turn:turn.cloudflare.com:3478",
      "username": "timestamp:user",
      "credential": "hmac-token"
    }
  ]
}
```

**Notes**:
- Currently returns STUN-only on free tier
- TURN requires Cloudflare TURN service subscription

---

## WebSocket API

### Connection

**URL**: `wss://your-domain.pages.dev/api/room/{roomId}?playerId={playerId}&token={token}`

**Authentication**:
- `playerId` query parameter
- `token` query parameter (must match player's token)

**Connection Flow**:
1. Client opens WebSocket connection
2. Server validates credentials
3. If valid, connection accepted
4. Client sends `join` message
5. Server broadcasts `joined` confirmation
6. Periodic `ping`/`pong` for heartbeat

---

### Messages from Client

#### Join Room
```json
{
  "t": "join",
  "p": {
    "roomId": "abc123",
    "userId": "player-uuid",
    "spectator": false,
    "token": "auth-token",
    "role": "host" | "challenger" | "spectator"
  }
}
```

#### Ready to Start
```json
{
  "t": "ready"
}
```

#### Dice Status Update
```json
{
  "t": "dice_status",
  "p": {
    "ready": true  // Dice detected and stable
  }
}
```

#### Start Verification
```json
{
  "t": "start_verification"
}
```
*Only host can send, requires challenger present*

#### WebRTC Offer
```json
{
  "t": "rtc_offer",
  "p": {
    "sdp": "v=0\r\no=- ..."
  }
}
```

#### WebRTC Answer
```json
{
  "t": "rtc_answer",
  "p": {
    "sdp": "v=0\r\no=- ..."
  }
}
```

#### WebRTC ICE Candidate
```json
{
  "t": "rtc_ice",
  "p": {
    "candidate": {
      "candidate": "candidate:...",
      "sdpMid": "0",
      "sdpMLineIndex": 0
    }
  }
}
```

#### Heartbeat Ping
```json
{
  "t": "ping"
}
```
*Automatically sent every 5 seconds by client*

---

### Messages from Server

#### Joined Confirmation
```json
{
  "t": "joined",
  "p": {
    "roomId": "abc123",
    "you": "player-uuid",
    "opp": "opponent-uuid",  // null if no opponent yet
    "spectator": false
  }
}
```

#### Your Turn
```json
{
  "t": "your_turn",
  "p": {
    "round_id": "round-hash"
  }
}
```

#### Phase Update
```json
{
  "t": "phase",
  "p": {
    "phase": "ROLLING" | "SEALING" | "SEALED" | "WAITING" | ...,
    "userId": "player-uuid"  // Optional, whose phase changed
  }
}
```

#### Opponent Result
```json
{
  "t": "opp_result",
  "p": {
    "match_id": "abc123",
    "round_id": "round-hash",
    "roller_user_id": "opponent-uuid",
    "opponent_user_id": "",
    "timestamp_server": 1699123500000,
    "dice_values": [6, 4, 3],
    "proof_digest_b64u": "base64url-proof-hash",
    "device_sig_b64u": "base64url-signature",
    "integrity_scores": {
      "overall": 0.87,
      "per_die": [0.85, 0.90, 0.86]
    },
    "ui_meta": {
      "fx_seed_b64u": "random-seed-for-effects"
    }
  }
}
```

#### Opponent Thumbnail
```json
{
  "t": "opp_thumb",
  "p": {
    "t_ms": 1234,
    "luma64x36_b64": "base64-encoded-thumbnail"
  }
}
```
*Thumbnail is 64×36 grayscale image*

#### Room State Update
```json
{
  "t": "state",
  "p": {
    // Full RoomStatePayload (see GET /api/rooms/{roomId})
  }
}
```

#### Room Stage Update
```json
{
  "t": "room_stage",
  "p": {
    "stage": "AWAITING_OPPONENT" | "AWAITING_DICE" | "READY" | "IN_PROGRESS" | "COMPLETED"
  }
}
```

#### Toast Notification
```json
{
  "t": "toast",
  "p": {
    "kind": "info" | "warn" | "error",
    "text": "Connection restored"
  }
}
```

#### WebRTC Messages
Relayed from other peer:
```json
{ "t": "rtc_offer", "p": { "from": "peer-uuid", "sdp": "..." } }
{ "t": "rtc_answer", "p": { "from": "peer-uuid", "sdp": "..." } }
{ "t": "rtc_ice", "p": { "from": "peer-uuid", "candidate": {...} } }
```

#### Heartbeat Pong
```json
{
  "t": "pong"
}
```
*Response to client ping, confirms connection alive*

---

## Data Schemas

### Proof Schema
```typescript
{
  version: 1,
  dice: [
    {
      id: "d0",
      value: 6,           // 1-6
      confidence: 0.85,   // 0-1
      settle_t_ms: 1234,
      tumble_count: 3     // Must be >= 2
    }
  ],
  stream_roots: {
    video: "base64url-merkle-root",   // 32 bytes
    imu: "base64url-merkle-root",
    audio: "base64url-merkle-root"
  },
  liveness: {
    r_luma: 0.87,           // Correlation coefficient
    barcode_err: 0.15,      // Error rate
    haptic_imu_ms: 5.2,     // Alignment delay (ms)
    chirp_snr: 8.5,         // SNR in dB
    vio_imu_dev: 0.25       // VIO deviation
  },
  channels: {
    video: true,
    audio: true,
    haptics: true,
    imu: true
  },
  timing: {
    t_start: 0,
    t_settle: 1234,
    t_send: 1500
  },
  nonces: {
    session: "base64url-nonce",
    stim: "base64url-stim-nonce"
  },
  webauthn: {
    publicKeyJwk: { kty: "EC", crv: "P-256", x: "...", y: "..." },
    attestationFmt: "webcrypto",
    signatureB64u: "base64url-ecdsa-signature"
  },
  audit: {
    frames: [
      {
        t_ms: 0,
        luma64x36_b64: "base64-thumbnail"
      },
      {
        t_ms: 600,
        luma64x36_b64: "base64-thumbnail"
      },
      {
        t_ms: 1400,
        luma64x36_b64: "base64-thumbnail"
      }
    ]
  }
}
```

### Game Phases
```
JOINING         → Initial connection state
LOBBY           → Waiting in room
VERIFYING       → Checking dice are visible/stable
TURN_READY      → Ready to roll
ROLLING         → Currently rolling
SEALING         → Computing proof
SEALED          → Proof submitted
WAITING         → Waiting for opponent
```

### Room Stages
```
AWAITING_OPPONENT → Host waiting for challenger
AWAITING_DICE     → Both present, waiting for dice detection
READY             → Dice detected, ready to start
IN_PROGRESS       → Game in progress
COMPLETED         → Game finished
```

---

## Error Codes

| Code | Reason | Description |
|------|--------|-------------|
| 400 | `missing_params` | Required parameters not provided |
| 400 | `version_mismatch` | Proof protocol version != 1 |
| 400 | `nonce_mismatch` | Nonces don't match stored values |
| 400 | `nonces_missing_or_expired` | Nonces not found or TTL expired |
| 400 | `visual_liveness` | Failed luma or barcode checks |
| 400 | `insufficient_channels` | Strict mode requires ≥2 channels |
| 400 | `tumble_low` | Die tumble count < 2 |
| 400 | `barcode_audit_fail` | Audit frames don't match barcode |
| 400 | `sig_invalid` | ECDSA signature verification failed |
| 400 | `root_size` | Merkle root size != 32 bytes |
| 403 | `unauthorized` | Invalid or missing auth token |
| 404 | `not_found` | Room or resource not found |
| 409 | `room_full` | Room already has max players |
| 429 | `rate_limit_exceeded` | Too many requests, retry later |
| 500 | `internal_error` | Server error |

---

## Best Practices

### Client Implementation

1. **Always handle reconnection**
   - Implement exponential backoff
   - Max 5 reconnection attempts
   - Show user feedback on connection status

2. **Rate limit awareness**
   - Respect 429 responses
   - Use `retry-after` header
   - Implement client-side throttling

3. **WebSocket heartbeat**
   - Send ping every 5 seconds
   - Expect pong within 10 seconds
   - Reconnect if no pong received

4. **Error handling**
   - Parse error responses
   - Show user-friendly messages
   - Log errors for debugging

5. **Proof generation**
   - Use provided stimulus schedule exactly
   - Collect all available channels
   - Include 3+ audit frames
   - Sign with WebCrypto (never expose private key)

### Security

1. **Never expose tokens**
   - Store tokens securely (not localStorage)
   - Don't log tokens
   - Rotate tokens on rejoin

2. **Validate server responses**
   - Check response types
   - Validate JSON structure
   - Handle malformed data gracefully

3. **Use HTTPS/WSS**
   - Never use HTTP in production
   - Verify TLS certificates
   - Enable HSTS

## Support

For issues or questions:
- Check [Architecture Documentation](./ARCHITECTURE.md)
- Review [Threat Model](./THREAT.md)
- See [Operations Guide](./OPERATIONS.md)
