# Kismet Dice Integrity System

Cloudflare Workers + Durable Objects powered real-time dice verification and duel platform.

## Packages
- `kismet/app`: React + Vite frontend.
- `kismet/worker`: Cloudflare Worker (API + signaling + TURN proxy) & Durable Object `RoomDO`.
- `kismet/shared`: Shared TypeScript types, crypto, stimuli builder.

## Recent Improvements
- Stable WebRTC negotiation (deterministic initiator; no dual-offer race).
- Shorter stimulus sequence (1400ms) for faster roll sealing.
- Simplified user phase vocabulary: Setup, Ready, Rolling, Sealed.
- Integrity badge tiers (High / Medium / Low) replacing raw percent spam.

See `kismet/USER_JOURNEY_MAP.md` for mini-map & rationale.

## Development
```bash
cd kismet/app && npm install && npm run dev
cd ../worker && npm install && npm run dev  # requires wrangler auth
```

## Deployment
```bash
# Worker
cd kismet/worker
wrangler secret put TURN_TOKEN_ID
wrangler secret put TURN_API_TOKEN
npm run deploy

# Pages (from kismet/app)
npm run build
# Upload dist/ via Cloudflare Pages dashboard or:
npx wrangler pages deploy dist --project-name kismet-app
```

## Security Notes
TURN API token must not be committed. Use Wrangler secrets. Audit `wrangler.toml` before pushes.

## License
Proprietary (adjust as needed).
