# Production Runbook (Human Tasks + Requirements)

You must complete these items. Nothing is assumed.

## A) Tooling
- Node 20+, npm 9+ (`node -v`, `npm -v`)
- Cloudflare account with Pages & Workers
- `npx wrangler` (installed automatically when invoked)

## B) Install
```bash
npm install
```

## C) Cloudflare Resources

KV namespace

```
npx wrangler kv namespace create KISMET_KV --preview
npx wrangler kv namespace create KISMET_KV
```

Paste preview_id and id into `infra/wrangler.toml` under `[[kv_namespaces]]`.

(Optional) R2 — only for tournaments dispute storage. Not required for core.

## D) Local Dev (optional)

Worker:
```
npm run dev:worker
```

App:
```
npm run dev:app
```

Visit http://localhost:5173

## E) Deploy

Worker:
```
npm run deploy:worker
```

App (Pages):
```
npm run build:app
npx wrangler pages deploy app/dist
```

Route:

Cloudflare → Workers → Routes → Add:
Pattern: `<your-pages-domain>/api/*` → Service: `kismet-worker`

Alternative (if Pages route not added yet): set an API base pointing directly to the worker domain and skip the route for now.

In `app/.env` (create from `.env.example`):
```
VITE_API_BASE="https://kismet-worker.devv-handler.workers.dev"
```

Rebuild the app after changing env values.

## F) TLS / HTTPS (Fix “Not secure”)

Cloudflare → SSL/TLS → Overview: set Full (strict)

Edge Certificates: enable Always Use HTTPS + Automatic HTTPS Rewrites

(Optional) enable HSTS (only after HTTPS confirmed)

Pages Custom Domain: attach domain and wait for “Active certificate.”

Ensure orange-cloud proxy on DNS records (Cloudflare must terminate SSL).

## G) Permissions

Players must allow Camera and Microphone (mic used for chirp SNR).

(Optional) Motion permission for IMU (iOS Safari: Settings → Motion & Orientation).

## H) How to Play

Open your HTTPS Pages URL.

Both players enter the same Room ID and distinct Names → Join.

When it’s your turn, roll dice naturally; you’ll feel a snap-lock; opponent sees Sealed and a pixel-thumb instantly (<1s).

(Optional) Toggle Live View (WebRTC) on both ends for live low-res video. If NAT blocks STUN, thumbnails still function.

## I) Operations

Threshold tuning: `shared/src/constants.ts` → redeploy

XP counters: `rank:<user>:xp` in KV

Observability: enable Workers logs; monitor rejections/latency

## J) Support

If WebRTC fails to connect: disable Live View; it’s optional. The proof system, thumbnails, and gameplay remain fully functional.
