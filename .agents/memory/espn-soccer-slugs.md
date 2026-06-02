---
name: ESPN soccer slugs
description: Working ESPN scoreboard slugs for soccer — wrong slugs return HTML silently
---

## Working slugs (confirmed 2026-06-02)

| slug | what it covers |
|---|---|
| `fifa.friendly` | International friendlies / pre-WC warm-ups (NOT `fifa.friendly.i`) |
| `fifa.world` | FIFA World Cup proper |

## How to verify a slug
```bash
curl -s "https://site.api.espn.com/apis/site/v2/sports/soccer/<slug>/scoreboard?dates=20260602" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log((d.events||[]).length, 'events')"
```
A bad slug returns HTML (starts with `<!DOCTYPE`) — the JSON parse throws.

## API-Football (API_FOOTBALL_KEY)
The free plan only covers seasons 2022–2024. Cannot use for current-season intl fixtures.
`api-football.ts` is kept in `artifacts/api-server/src/lib/` for future paid-plan use.

**Why:** `fifa.friendly.i` was assumed to be the right slug but is not a valid ESPN endpoint. `fifa.friendly` is the correct one. Always test slugs live before committing.
