# Mobile Dev Origin

**Date:** 2026-04-30
**Scope:** Next.js dev server mobile access

## Summary

- Investigated mobile Safari/Chromium access to `http://10.10.0.16:3000/` staying on `加载中…`.
- Found Next dev was rejecting `/_next/webpack-hmr` from the LAN host because `allowedDevOrigins` only included localhost.
- Added `NEXT_ALLOWED_DEV_ORIGINS` support in `next.config.ts` so LAN testing origins can be allowed without hardcoding machine-specific IPs.
- Restarted the dev server in a detached `tmux` session with `NEXT_ALLOWED_DEV_ORIGINS=10.10.0.16` and `--hostname 0.0.0.0 --port 3000`.

## Verification

- Before the change, Playwright mobile repro stayed on `/` with body `加载中…` and the console showed failed HMR WebSocket handshakes.
- `curl -H 'Origin: http://10.10.0.16:3000' http://10.10.0.16:3000/_next/webpack-hmr` returned `403 Unauthorized` before restart with the allowed origin.
- After restart, Playwright mobile reached `/login`, the console showed `[HMR] connected`, and the body contained `xReader` and `使用 GitHub 登录`.
- `cd web && pnpm exec eslint next.config.ts` passed.
- `cd web && pnpm build` passed.
