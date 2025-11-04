# Operations

## SLOs
- p50 settle→opponent render ≤ 800ms (LTE), p95 ≤ 1300ms
- Worker verify p95 ≤ 15ms/roll
- KV ops success ≥ 99.9%

## Rate Limits (recommend)
- `/api/start-roll`: 5/min/user
- `/api/submit-roll`: 5/min/user
- WebSockets: 2 per IP

## Metrics
- Rejection reasons, liveness aggregates, latency (submit→broadcast)
- KV: `rank:<user>:xp` counters

## Threshold Adjustment
- Edit `shared/src/constants.ts` (liveness)
- `STRICT_MODE` in `wrangler.toml` (≥2 independent channels for ranked)

## Privacy
- Only Merkle roots + tiny audit frames (64×36 luma) leave device
- No full video storage; R2 optional for tournaments (7-day retention)
