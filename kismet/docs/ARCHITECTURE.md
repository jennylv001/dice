# Kismet System Architecture

## Overview
Kismet is a remote competitive dice-rolling platform that ensures integrity through Physical Proof of Roll (PPoR) v1 "ROLLSEAL" technology. The system enables distant players to compete fairly using real physical dice.

## High-Level Architecture

```
┌─────────────────┐         ┌──────────────────┐
│   Browser App   │◄───────►│  Cloudflare      │
│   (React/Vite)  │  HTTPS  │  Pages (Static)  │
└────────┬────────┘         └──────────────────┘
         │
         │ WebSocket/API
         ▼
┌─────────────────────────────────────────────┐
│         Cloudflare Worker (Edge)            │
│  ┌────────────┐  ┌─────────────────────┐   │
│  │  Router    │  │  Rate Limiter       │   │
│  │  API       │  │  Auth               │   │
│  └────┬───────┘  └──────────┬──────────┘   │
│       │                     │               │
│       ▼                     ▼               │
│  ┌──────────────────────────────────────┐  │
│  │    Durable Object (Room DO)          │  │
│  │  - WebSocket Hub                     │  │
│  │  - Game State Management             │  │
│  │  - Turn Orchestration                │  │
│  │  - WebRTC Signaling                  │  │
│  └──────────────────────────────────────┘  │
└──────┬──────────────────┬───────────────────┘
       │                  │
       ▼                  ▼
┌─────────────┐    ┌──────────────┐
│  KV Store   │    │   (Future)   │
│  - Nonces   │    │   R2 Storage │
│  - XP       │    │   - Audits   │
│  - Rate     │    │   - History  │
│    Limits   │    └──────────────┘
└─────────────┘
```

## Component Details

### 1. Frontend (Browser App)
**Location**: `kismet/app/`

**Tech Stack**:
- React 18 with TypeScript
- Vite for bundling
- WebRTC for optional live video
- Web APIs: Camera, Microphone, IMU, Haptics

**Key Features**:
- Physical dice detection and tracking
- Multi-modal liveness verification
- Proof generation and signing
- WebSocket communication with reconnection
- Turn-based UI state management

**Main Components**:
- `JoinCard.tsx` - Room entry
- `DuelView.tsx` - Main game view
- `CameraRoller.tsx` - Dice capture and proof generation
- `OpponentPane.tsx` - Opponent state display
- `LiveRTC.tsx` - WebRTC video streaming

### 2. Worker (Edge API)
**Location**: `kismet/worker/`

**Responsibilities**:
- HTTP API endpoints
- Rate limiting
- Authentication/authorization
- Proof verification
- Routing to Durable Objects

**Key Files**:
- `index.ts` - Entry point
- `router.ts` - API routing
- `verify.ts` - Proof verification logic
- `ratelimit.ts` - Rate limiting middleware
- `turn.ts` - TURN server integration

### 3. Durable Object (Room DO)
**Location**: `kismet/worker/src/do_room.ts`

**Responsibilities**:
- WebSocket connection management
- Room state persistence
- Turn orchestration
- Player synchronization
- WebRTC signaling relay
- Heartbeat/ping-pong

**State Management**:
- Room metadata (ID, stage, created time)
- Player list with roles and states
- Turn order and current turn index
- Round history
- Connection status

### 4. Shared Code
**Location**: `kismet/shared/`

**Contents**:
- Type definitions
- Cryptographic utilities
- Merkle tree implementation
- Stimulus generation
- Liveness thresholds
- Protocol constants

## Data Flow

### Roll Submission Flow
```
1. Client requests roll → /api/start-roll
2. Worker generates nonces (session + stimulus)
3. Worker stores nonces in KV (TTL: 120s)
4. Client receives nonces + stimulus schedule
5. Client executes roll with multi-modal capture
6. Client generates Merkle roots + liveness metrics
7. Client signs proof with WebCrypto
8. Client submits proof → /api/submit-roll
9. Worker verifies:
   - Nonce match
   - Signature validity
   - Liveness thresholds
   - Stimulus correlation
10. Worker forwards to DO → /do/submit
11. DO broadcasts to opponent
12. DO advances turn
```

### WebSocket Communication Flow
```
1. Client connects to /api/room/{roomId}
2. DO authenticates via token
3. Client sends "join" message
4. DO adds to client map
5. Periodic ping/pong for heartbeat
6. On disconnect: exponential backoff reconnection
7. On reconnect: rejoin with same credentials
```

## Security Architecture

### Multi-Layer Security

1. **Transport Security**
   - HTTPS/WSS only (enforced via CSP)
   - Cloudflare TLS termination
   - No mixed content

2. **Authentication**
   - Token-based per player per room
   - Token generated on join
   - Token required for all authenticated endpoints
   - Tokens don't persist across sessions

3. **Rate Limiting**
   - Per-IP + per-user tracking
   - Sliding window algorithm
   - KV-backed with TTL
   - Limits: 5 rolls/min, 10 joins/min

4. **Proof Integrity**
   - Nonce-based stimulus (prevents replay)
   - Multi-modal liveness (6 independent checks)
   - Merkle roots for audit trail
   - ECDSA signature (P-256)
   - Server-side verification

5. **Anti-Cheat Mechanisms**
   - Unpredictable visual stimuli (luma modulation, barcode)
   - Audio chirps at random frequencies/times
   - Haptic-IMU alignment verification
   - Visual-Inertial Odometry correlation
   - Minimum tumble count requirement
   - Statistical anomaly detection

## Deployment Architecture

### Cloudflare Free Tier
- **Pages**: Static frontend hosting
- **Workers**: Edge compute for API
- **Durable Objects**: Stateful coordination
- **KV**: Ephemeral data storage
- **(Future) R2**: Long-term audit storage

### Regions
- Edge deployment worldwide
- Smart placement for DO instances
- KV replication across edge network

### Monitoring
- Worker observability enabled
- Metrics: roll latency, rejection rate, connection count
- Error tracking via toast messages (client-side)
- Future: Sentry integration

## Scalability Considerations

### Current Limits
- **Durable Object**: 1 per room (by design)
- **WebSocket**: Unlimited concurrent per DO
- **KV Operations**: Rate limited by Cloudflare
- **Worker CPU**: 50ms per request (10ms typical)

### Scaling Strategy
1. Horizontal scaling via room sharding (automatic)
2. KV caching with edge replication
3. R2 for cold storage (tournament history)
4. Analytics via Workers Analytics Engine

## Future Enhancements

### Planned Features
1. **Persistent Identity**
   - User accounts with OAuth
   - Cross-session profiles
   - Reputation system

2. **Advanced Matchmaking**
   - Skill-based matching
   - Tournament brackets
   - Seasonal leaderboards

3. **Enhanced Audit**
   - R2 storage for full roll videos
   - Dispute resolution system
   - ML-based anomaly detection

4. **Mobile Optimization**
   - Native apps (iOS/Android)
   - Push notifications
   - Offline mode

5. **Observability**
   - Comprehensive metrics dashboards
   - Alerting system
   - Performance profiling

## Development Workflow

### Local Development
```bash
# Terminal 1 - Worker
cd kismet
npm run dev:worker

# Terminal 2 - App
npm run dev:app
```

### Deployment
```bash
# Deploy Worker
npm run deploy:worker

# Build & Deploy App
npm run build:app
npx wrangler pages deploy app/dist
```

### Testing Strategy
- Unit tests: Critical path functions
- Integration tests: API endpoints
- E2E tests: Full roll submission flow
- Load tests: Concurrent users per room

## Performance Targets

### SLOs (Service Level Objectives)
- **Roll Latency**: p50 < 800ms, p95 < 1.3s
- **Verification**: p95 < 15ms per roll
- **WebSocket RTT**: p95 < 100ms
- **Availability**: 99.9% uptime

### Resource Budgets
- **Worker Memory**: < 128MB per request
- **DO Memory**: < 10MB per room
- **KV Reads**: < 10 per roll
- **KV Writes**: < 5 per roll

## Security Considerations

### Threat Model
1. **Replay Attacks**: Mitigated by nonces (TTL 120s)
2. **Deepfake/Video Spoof**: Multi-modal liveness detection
3. **Sensor Spoofing**: Cross-modal correlation checks
4. **Man-in-the-Middle**: TLS/WSS enforcement
5. **DoS**: Rate limiting + Cloudflare DDoS protection

### Privacy
- No full video storage (only Merkle roots + thumbnails)
- Audit frames: 64×36 grayscale only
- Optional R2 storage (7-day retention)
- No PII collection (pseudonymous user IDs)

## Operational Runbook

### Common Issues

1. **Connection Drops**
   - Automatic reconnection with exponential backoff
   - Max 5 attempts, then manual refresh required

2. **Rate Limit Hit**
   - 429 response with retry-after header
   - Client shows toast with countdown

3. **Proof Rejection**
   - Detailed reason in response
   - Client can retry roll
   - Strict mode requires ≥2 independent channels

4. **WebRTC Failure**
   - Falls back to thumbnail-only mode
   - STUN-only (no TURN on free tier)
   - NAT traversal may fail (expected)

### Monitoring Checklist
- [ ] Worker error rate < 1%
- [ ] Average roll latency < 1s
- [ ] WebSocket connection success rate > 95%
- [ ] Proof verification pass rate > 80%
- [ ] KV operation success rate > 99.9%

## References
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Durable Objects Guide](https://developers.cloudflare.com/durable-objects/)
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Physical Proof of Roll (PPoR) Whitepaper](./docs/THREAT.md)
