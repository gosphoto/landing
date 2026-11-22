# Brightness slider (server SoT) — design

Date: 2026-11-22  
Product: Госфото (`gosphoto-landing` + `gosphoto-api`)  
Status: approved in brainstorm

## Goal

User can adjust photo brightness on the result page before and after payment. When brightness is not default, a reset button appears. After payment, the same brightness comes from the server (not the browser). Both digital 35×45 and print 10×15 use one setting. Brightness is baked into JPEGs on the server.

## Non-goals

- Pan / zoom / full frame editor (3x4ru-style `reframe`)
- Resume (300 ₽) product
- Storing brightness in `localStorage` / `sessionStorage`
- Playwright E2E as a merge blocker (optional follow-up)

## Source of truth

- Server: `meta.brightness` (float), default `1.0`
- Browser never persists the chosen level; after pay / F5 / new tab, UI reads `GET /api/result/{id}` only
- Optimistic CSS `filter: brightness()` is display-only until POST succeeds; it is not storage

## Range

- Min `0.7`, max `1.35`, default `1.0` (same semantics as CSS `filter: brightness()` / PIL `ImageEnhance.Brightness`)
- Dirty / show reset when `|brightness − 1.0| ≥ 0.01`

## API (`gosphoto-api`)

### `GET /api/result/{id}`

Add field:

- `brightness`: number — from meta, or `1.0` if missing

### `POST /api/result/{id}/brightness`

Body: `{ "brightness": number }`

- Validate range `[0.7, 1.35]` inclusive; outside → **422** (no silent clamp on the wire)
- Persist `meta.brightness` (rounded, e.g. 4 decimal places)
- Rebake from a **neutral base frame** (brightness not permanently burned into the base; each bake reapplies the factor from the neutral source)
- Always update unpaid previews: `preview_digital.jpg`, `preview_print.jpg` (and view assets if present)
- If paid / full frame ready: also update `digital.jpg`, `print.jpg` (and full outputs already on disk)
- Response: public result payload including `brightness` and updated preview/download URLs
- Reset = same endpoint with `brightness: 1.0`
- Payment endpoints do not clear or alter `brightness`

### Bake pipeline (sketch)

1. Load neutral passport crop (pre-brightness canonical)
2. Apply brightness factor
3. Encode digital JPEG; build print 10×15 from the brightened passport
4. Regenerate preview JPEGs from those bytes
5. Write files + meta

## UI (`gosphoto-landing` / `result.html`)

- Controls under the digital preview, visible for unpaid and paid
- Label «Яркость», `input[type=range]` (`data-brightness`), min/max/step as above
- Button «Сбросить» (`data-brightness-reset`), `hidden` when not dirty
- On input: apply CSS filter immediately to digital + print images; debounce ~250ms → POST
- On 200: cache-bust image URLs from response; align filter/slider to server `brightness`
- On POST error: revert slider + filter to last known server value
- Logic in `js/brightness.js` (keep `result.html` thin)
- Optional Metrika: `brightness_change`, `brightness_reset`

## Cross-payment behavior

1. User sets brightness unpaid → POST succeeds → meta + previews updated
2. User pays → redirect `?paid=1` / boot
3. `GET` returns same `brightness` → slider, filter, and reset visibility match
4. No browser storage bridge

## Testing (TDD)

### API (primary) — pytest in `gosphoto-api`

1. GET default `brightness === 1.0`
2. POST `1.25` → meta + pixels brighter than baseline; print also affected
3. POST `1.0` → reset
4. POST `2.5` → 422
5. Unpaid: previews update; digital download still paywalled
6. After pay: digital + print files reflect brightness

### Front (secondary)

- Unit-test pure helpers (`normalizeBrightness`, `isDirty`) via small node/vitest harness if added; no storage APIs in module

## Repos / deploy

- API changes: commit + push `gosphoto/api` `main` → GitHub Actions → VPS (no SSH hotfix)
- Landing: commit + push `gosphoto/landing` → its deploy workflow

## Open decisions locked in brainstorm

| Topic | Decision |
| --- | --- |
| Products | Digital + print, one brightness |
| Persistence | Server only |
| Latency UX | Optimistic CSS filter + debounced POST |
| Scope | Brightness-only endpoint (not full reframe) |
