# Deploy Kismet (Cloudflare Free-Tier, npm)

## Prereqs
- Cloudflare account with Pages + Workers
- Node 20+, **npm** 9+
- `npx wrangler --version` (installed automatically when run)

## 1) Install (root)
```bash
npm install
```

## 2) Create KV namespace (dev + prod)
```
npx wrangler kv namespace create KISMET_KV --preview
npx wrangler kv namespace create KISMET_KV
```

Copy preview_id and id into `infra/wrangler.toml` under `[[kv_namespaces]]`.

## 3) Local dev

Terminal A (Worker):
```
npm run dev:worker
```

Terminal B (App):
```
npm run dev:app
```

Open http://localhost:5173 (dev server proxies `/api/*` to Worker dev).

## 4) Deploy Worker (HTTPS by default)
```
npm run deploy:worker
```

## 5) Deploy App via Pages

Option A — CLI:
```
npm run build:app
npx wrangler pages deploy app/dist
```

Option B — Dashboard:

Create a Pages project for `/app`, build command: `npm run build`, output: `dist`.

## 6) Route /api/* to Worker

Cloudflare Dashboard → Workers Routes → Add:

Pattern: `<your-pages-domain>/api/*`

Service: `kismet-worker`

This ensures same-origin HTTPS → WSS.

## 7) TLS / “Not secure” Fix Checklist

Cloudflare Dashboard → SSL/TLS → Overview: set Full (strict).

Edge Certificates: turn on Always Use HTTPS and Automatic HTTPS Rewrites.

(Optional) HSTS: enable after confirming TLS working.

If using a custom domain for Pages, attach it in Pages → Custom Domains and wait for the Active certificate state. Do not gray-cloud (bypass) the DNS record—orange-cloud (proxied) required for managed certs.

## 8) Validate Production

Visit your Pages domain via https.

Open two devices/tabs, join the same room, roll once; opponent sees Sealed in <1s.

(Optional) Toggle Live View (WebRTC) on both ends; if NAT allows STUN, you’ll see live video. Otherwise thumbnails continue to work.

You do not need TURN for core functionality. WebRTC is optional and independent of proof integrity.
