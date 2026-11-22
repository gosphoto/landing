# Brightness + contrast (`/adjust`) — design

Date: 2026-11-22  
Product: Госфото (`gosphoto-landing` + `gosphoto-api`)  
Status: approved approach (brainstorm: server-baked contrast, endpoint strategy **1**)  
Extends: `docs/superpowers/specs/2026-11-22-brightness-slider-design.md`

## Goal

User can adjust **brightness and contrast** on the result page (before and after payment). Both are baked into JPEGs on the server. One shared reset restores both to default. Browser never persists values; server meta is source of truth.

## Non-goals

- Pan / zoom / reframe
- Separate `/contrast` endpoint or dual concurrent POSTs
- Browser `localStorage` / `sessionStorage` for these values
- Changing the neutral base crop pipeline beyond applying enhance factors

## Source of truth

| Field | Default | Range | Meta key |
| --- | --- | --- | --- |
| Brightness | `1.0` | `0.7` … `1.35` | `meta.brightness` |
| Contrast | `1.0` | `0.7` … `1.35` | `meta.contrast` |

- Dirty / show reset when `|brightness − 1| ≥ 0.01` **or** `|contrast − 1| ≥ 0.01`
- Optimistic CSS is display-only until POST succeeds

## Bake order

From neutral `digital_base.jpg` (RGB):

1. `ImageEnhance.Brightness` with `brightness`
2. `ImageEnhance.Contrast` with `contrast`
3. Encode digital JPEG; derive print 10×15; write previews / paid outputs as today

Same order for CSS preview: `filter: brightness(brRatio) contrast(crRatio)` where each ratio is `slider / serverValue` (images already contain server bake).

## API (`gosphoto-api`)

### `GET /api/result/{id}`

Return:

- `brightness`: number (existing)
- `contrast`: number — from meta, or `1.0` if missing

### `POST /api/result/{id}/adjust` (canonical)

Body:

```json
{ "brightness": 1.0, "contrast": 1.0 }
```

- Both fields required numbers in `[0.7, 1.35]`; outside → **422** (no silent clamp on the wire)
- Persist both (round to 4 decimal places)
- Single rebake from neutral base with brightness → contrast
- Update unpaid previews always; if paid, also digital/print downloads
- Response: public result payload including both fields + updated URLs
- Reset = POST `{ "brightness": 1.0, "contrast": 1.0 }`

### `POST /api/result/{id}/brightness` (compat alias)

- Keep working during transition
- Accept `{ "brightness": number }` as today
- Rebake using **current** `meta.contrast` (default 1.0) + new brightness
- Prefer landing to call `/adjust` only after this ships

### Payment

Payment flows must not clear or alter `brightness` / `contrast`.

## UI (`gosphoto-landing` / `result.html`)

- Block under digital preview (unpaid + paid)
- Label «Яркость» + range (`data-brightness`)
- Label «Контраст» + range (`data-contrast`)
- One button «Сбросить» (`data-adjust-reset`), hidden when neither is dirty
- On either input: update CSS filter on digital + print; debounce ~250ms → one `POST /adjust` with **both** current slider values
- On 200: cache-bust images; `applyFromServer({ brightness, contrast })`
- On error: revert both sliders + filter to last server pair
- Module: extend `js/brightness.js` → rename conceptually to adjust helpers (file may become `js/adjust.js` **or** keep `brightness.js` exporting `GosphotoAdjust` / dual API — prefer one module `js/adjust.js` with thin re-export from old name if needed for cache)

## Cross-payment

Unpaid adjust → pay → GET returns same pair → sliders, filter, reset match. No browser storage bridge.

## Testing (TDD)

### API — pytest

1. GET defaults: brightness `1.0`, contrast `1.0`
2. POST `/adjust` with contrast `1.2` → pixels differ from baseline; meta saved
3. POST both dirty → single rebake reflects both
4. POST out of range → 422
5. Reset both to `1.0`
6. Alias `/brightness` preserves existing contrast in meta
7. Paid path updates download files

### Front

- Helpers: `normalize`, `isDirty` for both; combined dirty for reset
- No storage APIs in module
- `node` smoke tests extended

## Repos / deploy

- API: `gosphoto/api` → push `main` → Actions → VPS (no SSH hotfix)
- Landing: `gosphoto/landing` → deploy workflow
- Implement on `feat/brightness-slider` (or successor) then merge/push per existing brightness work

## Decisions locked

| Topic | Decision |
| --- | --- |
| Product mode | A — server-baked contrast like brightness |
| Endpoint | **1** — canonical `/adjust`; `/brightness` alias |
| Range | Same as brightness `0.7…1.35` |
| Reset | One button resets both |
| Bake order | Brightness then contrast |
| POST shape | Always send both current values |
