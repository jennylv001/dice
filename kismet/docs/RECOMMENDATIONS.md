# Kismet Implementation Recommendations

## Best Practices for Production Deployment

This document provides contextual recommendations for implementing Kismet in a production environment for real human users.

---

## 1. Security Hardening

### 1.1 Secrets Management
**Current**: TURN credentials removed from config ✅  
**Recommendation**: 
- Use Wrangler secrets for ALL sensitive values
- Rotate credentials quarterly
- Monitor for secret exposure in logs

```bash
# Set secrets securely
wrangler secret put TURN_TOKEN_ID
wrangler secret put TURN_API_TOKEN
wrangler secret put AUDIT_ENCRYPTION_KEY  # For R2
```

### 1.2 Rate Limiting Tuning
**Current**: Basic limits implemented ✅  
**Recommendation**:
- Monitor actual usage patterns
- Adjust limits based on legitimate use cases
- Implement gradual penalties (not hard blocks)
- Add IP reputation scoring

```typescript
// Adaptive rate limiting based on user behavior
const LIMITS = {
  START_ROLL: {
    trusted: { max: 10, windowSec: 60 },
    normal: { max: 5, windowSec: 60 },
    suspicious: { max: 2, windowSec: 60 }
  }
};
```

### 1.3 Proof Verification
**Current**: Multi-modal liveness checks ✅  
**Recommendation**:
- Log rejection reasons for analysis
- Build statistical profiles per user
- Flag anomalies (e.g., 100% perfect scores)
- Implement challenge rounds for suspicious patterns

---

## 2. User Experience Enhancements

### 2.1 Connection Reliability
**Current**: WebSocket reconnection implemented ✅  
**Recommendation**:
- Show connection quality indicator (RTT, packet loss)
- Prefetch next round nonces during opponent's turn
- Queue actions during brief disconnects
- Notify opponents of peer disconnection

```typescript
// Connection quality feedback
type ConnectionQuality = "excellent" | "good" | "poor" | "critical";

function assessQuality(latency: number, reconnects: number): ConnectionQuality {
  if (latency < 50 && reconnects === 0) return "excellent";
  if (latency < 150 && reconnects < 2) return "good";
  if (latency < 300 && reconnects < 5) return "poor";
  return "critical";
}
```

### 2.2 Loading States
**Recommendation**: Add loading indicators for:
- Room creation/joining
- Roll submission
- Proof verification
- Opponent result fetching

```tsx
// Example loading button component
<button disabled={loading} className={loading ? 'loading' : ''}>
  {loading ? <><span className="spinner" /> Verifying...</> : 'Roll Dice'}
</button>
```

### 2.3 Error Recovery
**Recommendation**: Provide actionable guidance:

| Error | User-Friendly Message | Action |
|-------|----------------------|--------|
| `visual_liveness` | "Lighting issue detected. Try brighter environment." | Retry with tips |
| `insufficient_channels` | "Enable microphone and motion sensors." | Show settings guide |
| `rate_limit_exceeded` | "Too many attempts. Wait 30s." | Show countdown |
| `nonce_expired` | "Session timed out. Restart roll." | Auto-restart |

### 2.4 Turn Timeouts
**Recommendation**: Implement graceful timeouts:
```typescript
const TURN_TIMEOUT_MS = 60_000; // 60 seconds

// In Durable Object
if (Date.now() - this.data.turnStartTime > TURN_TIMEOUT_MS) {
  this.skipTurn("timeout");
  this.broadcastToast("warn", "Turn skipped due to inactivity");
}
```

---

## 3. Game Design Improvements

### 3.1 Matchmaking
**Recommendation**: Implement skill-based matching:
```typescript
type PlayerSkillBracket = "beginner" | "intermediate" | "advanced" | "expert";

function calculateSkill(xp: number, winRate: number): PlayerSkillBracket {
  const score = xp * winRate;
  if (score < 100) return "beginner";
  if (score < 500) return "intermediate";
  if (score < 2000) return "advanced";
  return "expert";
}
```

### 3.2 Tournament Support
**Recommendation**: Add bracket structure:
```typescript
interface Tournament {
  id: string;
  name: string;
  startTime: number;
  bracket: TournamentNode[];
  participants: string[];
  rules: {
    bestOf: number;          // Best of N rounds
    timePerRoll: number;     // Seconds
    minIntegrity: number;    // Required score
  };
}
```

### 3.3 Achievements & Progression
**Recommendation**: Gamification elements:
```typescript
const ACHIEVEMENTS = {
  FIRST_WIN: { xp: 50, badge: "🏆" },
  PERFECT_ROLL: { xp: 100, badge: "⭐" }, // 0.95+ integrity
  STREAK_5: { xp: 200, badge: "🔥" },
  MARATHON: { xp: 500, badge: "🎖️" }  // 50 rolls
};
```

---

## 4. Monitoring & Observability

### 4.1 Metrics to Track
**Recommendation**: Implement comprehensive telemetry:

```typescript
// Key metrics
interface RollMetrics {
  timestamp: number;
  userId: string;
  roomId: string;
  
  // Performance
  captureLatency: number;    // Client-side
  verifyLatency: number;     // Server-side
  totalLatency: number;      // End-to-end
  
  // Quality
  integrityScore: number;
  channelsUsed: string[];
  
  // Outcome
  accepted: boolean;
  rejectionReason?: string;
}
```

**Dashboard Views**:
- Real-time active rooms
- Average roll latency (p50, p95, p99)
- Proof acceptance rate
- Most common rejection reasons
- User retention (DAU, WAU, MAU)

### 4.2 Error Tracking
**Recommendation**: Integrate Sentry or similar:

```typescript
// In worker
import * as Sentry from '@sentry/cloudflare';

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.ENVIRONMENT,
  tracesSampleRate: 0.1
});

// Capture proof rejections
if (!res.ok) {
  Sentry.captureMessage('Proof rejected', {
    level: 'warning',
    extra: {
      reason: res.reason,
      userId,
      integrityScores: proof.liveness
    }
  });
}
```

### 4.3 Alerting
**Recommendation**: Set up alerts for:
- Worker error rate > 5%
- Average latency > 2s
- Proof rejection rate > 40%
- KV failure rate > 1%
- DO memory > 100MB

---

## 5. Data Persistence

### 5.1 Game History
**Recommendation**: Store in R2 for tournaments:

```typescript
// Audit record structure
interface AuditRecord {
  roundId: string;
  timestamp: number;
  roomId: string;
  participants: string[];
  
  rolls: {
    userId: string;
    proof: Proof;
    result: RPv1;
  }[];
  
  // Compressed video frames (optional)
  videoArchive?: {
    url: string;        // R2 URL
    retention: number;  // Days
  };
}

// Upload to R2 after round
await env.AUDIT_BUCKET.put(
  `audits/${roomId}/${roundId}.json`,
  JSON.stringify(audit),
  { expirationTtl: 7 * 24 * 60 * 60 } // 7 days
);
```

### 5.2 User Profiles
**Recommendation**: Persistent identity with OAuth:

```typescript
interface UserProfile {
  id: string;
  authProvider: "google" | "github" | "discord";
  authId: string;
  
  displayName: string;
  avatarUrl?: string;
  
  stats: {
    totalRolls: number;
    avgIntegrity: number;
    winRate: number;
    currentStreak: number;
    longestStreak: number;
  };
  
  preferences: {
    hapticEnabled: boolean;
    videoQuality: "low" | "medium" | "high";
    autoReady: boolean;
  };
  
  createdAt: number;
  lastSeen: number;
}
```

### 5.3 Leaderboards
**Recommendation**: KV-based leaderboard:

```typescript
// Update after each roll
await env.KISMET_KV.put(
  `leaderboard:weekly:${getUserWeek()}`,
  JSON.stringify(topUsers),
  { expirationTtl: 7 * 24 * 60 * 60 }
);

// Query leaderboard
const leaderboard = await env.KISMET_KV.get<LeaderboardEntry[]>(
  `leaderboard:weekly:${getUserWeek()}`
);
```

---

## 6. Mobile Optimization

### 6.1 Progressive Web App
**Recommendation**: Enhance manifest.webmanifest:

```json
{
  "name": "Kismet Dice",
  "short_name": "Kismet",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "categories": ["games", "entertainment"],
  "screenshots": [
    {
      "src": "/screenshots/gameplay.png",
      "sizes": "750x1334",
      "type": "image/png"
    }
  ],
  "shortcuts": [
    {
      "name": "Quick Roll",
      "url": "/quick-roll",
      "icons": [{ "src": "/dice-icon.png", "sizes": "96x96" }]
    }
  ]
}
```

### 6.2 Camera Handling
**Recommendation**: Device-specific optimizations:

```typescript
// iOS Safari workarounds
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

const constraints = {
  video: {
    facingMode: { ideal: "environment" },
    frameRate: { ideal: isIOS ? 30 : 60 },  // iOS limited
    width: { ideal: isIOS ? 720 : 1280 },
    height: { ideal: isIOS ? 1280 : 720 }
  }
};

// Request motion permission on iOS
if (isIOS && typeof DeviceMotionEvent.requestPermission === 'function') {
  const permission = await DeviceMotionEvent.requestPermission();
  if (permission !== 'granted') {
    showToast('warn', 'Motion sensors needed for anti-cheat');
  }
}
```

### 6.3 Battery Optimization
**Recommendation**: Reduce computation when on battery:

```typescript
const onBattery = !navigator.getBattery || 
  (await navigator.getBattery()).charging === false;

if (onBattery) {
  // Lower frame rate
  videoFrameRate = 30;
  // Skip optional channels
  audioEnabled = false;
  // Reduce audit frames
  auditFrameCount = 2;
}
```

---

## 7. Accessibility

### 7.1 Screen Readers
**Recommendation**: Add ARIA labels:

```tsx
<button
  onClick={rollDice}
  aria-label="Roll dice"
  aria-busy={rolling}
  aria-live="polite"
  aria-describedby="roll-status"
>
  Roll
</button>

<div id="roll-status" role="status" aria-live="polite">
  {rolling ? "Rolling in progress..." : "Ready to roll"}
</div>
```

### 7.2 Keyboard Navigation
**Recommendation**: Full keyboard support:

```typescript
// Focus management
const focusTrapRef = useFocusTrap({ active: modalOpen });

// Shortcuts
useKeyboard({
  'r': () => rollDice(),
  'Escape': () => closeModal(),
  'ArrowUp': () => selectPrevious(),
  'ArrowDown': () => selectNext()
});
```

### 7.3 Color Blind Mode
**Recommendation**: Alternative color schemes:

```css
[data-theme="deuteranopia"] {
  --accent: #ffcc00;     /* Yellow instead of green */
  --error: #cc00ff;      /* Purple instead of red */
}
```

---

## 8. Advanced Anti-Cheat

### 8.1 Behavioral Analysis
**Recommendation**: ML-based anomaly detection:

```typescript
// Collect behavioral features
interface BehavioralFeatures {
  avgRollTime: number;
  timeBetweenRolls: number;
  mouseMovementEntropy: number;
  cameraMovementVariance: number;
  integrityScoreConsistency: number;
}

// Flag suspicious patterns
if (features.integrityScoreConsistency > 0.95) {
  // Too consistent = possibly pre-recorded
  flagForReview(userId, "high_consistency");
}

if (features.mouseMovementEntropy < 0.1) {
  // Too robotic = possibly automated
  flagForReview(userId, "low_entropy");
}
```

### 8.2 Challenge Rounds
**Recommendation**: Random verification challenges:

```typescript
// 1 in 20 rolls gets extra scrutiny
if (Math.random() < 0.05) {
  const challenge = {
    type: "captcha" | "live_gesture" | "voice_prompt",
    prompt: "Please show thumbs up to camera",
    timeoutMs: 10000
  };
  
  await sendChallenge(userId, challenge);
}
```

### 8.3 Peer Review
**Recommendation**: Community verification:

```typescript
// Flag suspicious rolls for peer review
if (integrityScore < 0.6 && highStakesMatch) {
  await submitForReview({
    roundId,
    videoClips: auditFrames,
    reviewers: 3,  // Random players
    requiredConsensus: 2
  });
}
```

---

## 9. Performance Optimization

### 9.1 Client-Side Caching
**Recommendation**: Cache static resources:

```typescript
// Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('kismet-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/styles.css',
        '/assets/dice-icon.svg',
        '/assets/sounds/chirp.mp3'
      ]);
    })
  );
});
```

### 9.2 Worker Optimization
**Recommendation**: Reduce cold starts:

```typescript
// Keep Workers warm with periodic pings
const WARMUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

export default {
  async scheduled(controller: ScheduledController, env: Env) {
    // Ping critical DOs to keep them warm
    const criticalRooms = await getCriticalRooms(env);
    await Promise.all(
      criticalRooms.map(roomId => pingRoom(env, roomId))
    );
  }
};
```

### 9.3 KV Optimization
**Recommendation**: Batch operations:

```typescript
// Instead of multiple individual puts
await Promise.all([
  env.KISMET_KV.put(key1, val1),
  env.KISMET_KV.put(key2, val2),
  env.KISMET_KV.put(key3, val3)
]);

// Use batch writes (coming soon to KV)
// await env.KISMET_KV.putMultiple([
//   [key1, val1],
//   [key2, val2],
//   [key3, val3]
// ]);
```

---

## 10. Testing Strategy

### 10.1 Unit Tests
**Recommendation**: Test critical functions:

```typescript
// verify.test.ts
describe('verifyProof', () => {
  it('accepts valid proof', async () => {
    const proof = createValidProof();
    const result = await verifyProof(proof, nonces, true);
    expect(result.ok).toBe(true);
  });
  
  it('rejects low luma correlation', async () => {
    const proof = createProof({ r_luma: 0.5 });
    const result = await verifyProof(proof, nonces, true);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('visual_liveness');
  });
});
```

### 10.2 Integration Tests
**Recommendation**: Test API endpoints:

```typescript
// router.test.ts
describe('POST /api/start-roll', () => {
  it('returns nonces for authenticated user', async () => {
    const response = await request(env)
      .post('/api/start-roll')
      .send({ roomId, userId, token });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('nonces_b64u');
    expect(response.body).toHaveProperty('schedule');
  });
  
  it('rejects rate limited user', async () => {
    // Make 6 requests (limit is 5)
    for (let i = 0; i < 6; i++) {
      await request(env).post('/api/start-roll').send({ roomId, userId, token });
    }
    
    const response = await request(env)
      .post('/api/start-roll')
      .send({ roomId, userId, token });
    
    expect(response.status).toBe(429);
  });
});
```

### 10.3 E2E Tests
**Recommendation**: Use Playwright:

```typescript
// gameplay.spec.ts
test('complete dice roll flow', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Create Room');
  
  const roomId = await page.textContent('[data-testid="room-id"]');
  
  // Simulate second player in different context
  const page2 = await context.newPage();
  await page2.goto('/');
  await page2.fill('[placeholder="Room ID"]', roomId);
  await page2.click('text=Join');
  
  // Host rolls
  await page.click('text=Roll Dice');
  await page.waitForSelector('[data-testid="sealed-badge"]');
  
  // Challenger sees result
  await page2.waitForSelector('[data-testid="opponent-result"]');
  expect(await page2.textContent('[data-testid="dice-values"]')).toBeTruthy();
});
```

---

## Implementation Priority

### Phase 1: Must Have (Week 1-2)
1. ✅ Rate limiting
2. ✅ WebSocket reconnection
3. ✅ Comprehensive documentation
4. ⏳ Loading states & error messages
5. ⏳ Turn timeouts

### Phase 2: Should Have (Week 3-4)
1. Monitoring & metrics
2. User authentication
3. Persistent history (R2)
4. Leaderboards
5. Mobile optimizations

### Phase 3: Nice to Have (Week 5-6)
1. Tournament system
2. Advanced anti-cheat (ML)
3. Achievement system
4. Accessibility improvements
5. Comprehensive tests

---

## Maintenance Guidelines

### Regular Tasks
- [ ] Review rate limit effectiveness (weekly)
- [ ] Analyze proof rejection patterns (weekly)
- [ ] Check KV usage and optimize (monthly)
- [ ] Rotate secrets (quarterly)
- [ ] Review security advisories (monthly)
- [ ] Update dependencies (monthly)

### Incident Response
1. High error rate → Check Worker logs
2. Slow performance → Review DO memory usage
3. Proof rejections spike → Check client versions
4. WebSocket drops → Investigate network issues

---

**For questions or suggestions, please open an issue or discussion on GitHub.**
