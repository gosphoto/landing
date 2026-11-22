# Brightness + Contrast (`/adjust`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-baked contrast beside brightness on Госфото result page via one `POST /adjust` that rebakes digital+print from `digital_base.jpg`.

**Architecture:** Extend existing brightness pipeline. Store `meta.contrast` (default 1.0). Canonical endpoint `POST /api/result/{id}/adjust` accepts both factors, rebakes brightness→contrast once. Keep `POST …/brightness` as alias that preserves current contrast. Landing: second slider + shared reset; optimistic `filter: brightness() contrast()`; debounce one POST with both values. No browser storage.

**Tech Stack:** FastAPI + pytest + PIL (`gosphoto-api`); vanilla JS + HTML/CSS (`gosphoto-landing`).

**Spec:** `docs/superpowers/specs/2026-11-22-brightness-contrast-adjust-design.md`

## Global Constraints

- Server SoT for brightness and contrast; no `localStorage` / `sessionStorage` for either
- Both ranges inclusive `[0.7, 1.35]`; outside → HTTP **422**
- Defaults `1.0`; reset when either `|x − 1.0| ≥ 0.01`
- Bake order: brightness then contrast from `digital_base.jpg`
- Canonical write path: `/adjust`; `/brightness` alias keeps current `meta.contrast`
- API ship: commit + push `gosphoto/api` `main` (CI); landing: `gosphoto/landing`
- TDD: failing test before production code
- Work on existing `feat/brightness-slider` branches in both repos (or successor); do not SSH-hotfix VPS

## File map

| File | Role |
| --- | --- |
| `gosphoto-api/app/brightness.py` | Add contrast parse/apply helpers (same module; shared range constants OK) |
| `gosphoto-api/app/results.py` | `rebake_adjust(result_id, brightness, contrast)`; alias thin wrap |
| `gosphoto-api/app/full_render.py` | Apply both factors on paid promote |
| `gosphoto-api/app/main.py` | GET `contrast`; `POST …/adjust`; alias `/brightness` |
| `gosphoto-api/tests/test_brightness.py` | Extend / add contrast + adjust API tests (or `test_adjust.py`) |
| `gosphoto-landing/js/adjust.js` | Dual-slider mount (prefer new file; re-export from `brightness.js` if needed) |
| `gosphoto-landing/js/adjust.test.js` | Node assert helpers |
| `gosphoto-landing/result.html` | Contrast markup + wire `/adjust` |
| `gosphoto-landing/css/styles.css` | Stack second range under brightness |

---

### Task 1: Pure contrast helpers (API) — TDD

**Files:**
- Modify: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-api/app/brightness.py`
- Test: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-api/tests/test_brightness.py`

**Interfaces:**
- Produces: `DEFAULT_CONTRAST = 1.0`, `MIN_CONTRAST = 0.7`, `MAX_CONTRAST = 1.35`, `CONTRAST_EPS = 0.01` (same numeric bounds as brightness)
- Produces: `parse_contrast(value: object) -> float` raises `ValueError` out of range / non-numeric
- Produces: `is_contrast_dirty(contrast: float) -> bool`
- Produces: `apply_contrast(photo: Image.Image, contrast: float) -> Image.Image`
- Produces: `apply_adjust(photo, brightness, contrast) -> Image.Image` — brightness then contrast

- [ ] **Step 1: Write failing tests**

```python
# append to tests/test_brightness.py
from app.brightness import (
    apply_adjust,
    apply_contrast,
    is_contrast_dirty,
    parse_contrast,
)


def test_parse_contrast_valid_and_rejects():
    assert parse_contrast(1.0) == pytest.approx(1.0)
    assert parse_contrast(1.2) == pytest.approx(1.2)
    with pytest.raises(ValueError):
        parse_contrast(2.0)
    with pytest.raises(ValueError):
        parse_contrast("x")


def test_is_contrast_dirty():
    assert is_contrast_dirty(1.0) is False
    assert is_contrast_dirty(1.2) is True


def test_apply_contrast_increases_spread():
    img = Image.new("RGB", (2, 1))
    img.putpixel((0, 0), (80, 80, 80))
    img.putpixel((1, 0), (180, 180, 180))
    out = apply_contrast(img, 1.3)
    assert out.getpixel((1, 0))[0] - out.getpixel((0, 0))[0] > 100


def test_apply_adjust_order_brightness_then_contrast():
    img = Image.new("RGB", (32, 32), (128, 128, 128))
    out = apply_adjust(img, 1.2, 1.2)
    assert out.mode == "RGB"
    assert out.getpixel((0, 0)) != (128, 128, 128)
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-api && PYTHONPATH=. python -m pytest tests/test_brightness.py::test_parse_contrast_valid_and_rejects tests/test_brightness.py::test_apply_adjust_order_brightness_then_contrast -v`  
Expected: import / attribute errors for new symbols

- [ ] **Step 3: Implement helpers in `app/brightness.py`**

```python
DEFAULT_CONTRAST = 1.0
MIN_CONTRAST = 0.7
MAX_CONTRAST = 1.35
CONTRAST_EPS = 0.01


def parse_contrast(value: object) -> float:
    try:
        n = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as e:
        raise ValueError("contrast must be a number") from e
    if not (MIN_CONTRAST <= n <= MAX_CONTRAST):
        raise ValueError(
            f"contrast must be between {MIN_CONTRAST} and {MAX_CONTRAST}"
        )
    return round(n, 4)


def is_contrast_dirty(contrast: float) -> bool:
    return abs(float(contrast) - DEFAULT_CONTRAST) >= CONTRAST_EPS


def apply_contrast(photo: Image.Image, contrast: float) -> Image.Image:
    factor = float(contrast)
    if abs(factor - DEFAULT_CONTRAST) < 1e-6:
        return photo
    return ImageEnhance.Contrast(photo.convert("RGB")).enhance(factor)


def apply_adjust(
    photo: Image.Image, brightness: float, contrast: float
) -> Image.Image:
    return apply_contrast(apply_brightness(photo, brightness), contrast)
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-api && PYTHONPATH=. python -m pytest tests/test_brightness.py -v`  
Expected: all PASS

- [ ] **Step 5: Commit (api repo)**

```bash
cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-api
git add app/brightness.py tests/test_brightness.py
git commit -m "$(cat <<'EOF'
feat(adjust): pure contrast helpers and apply_adjust

EOF
)"
```

---

### Task 2: `rebake_adjust` + brightness alias preserves contrast

**Files:**
- Modify: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-api/app/results.py` (`rebake_brightness` → call shared rebake, or rename to `rebake_adjust`)
- Test: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-api/tests/test_brightness.py` (unit with temp result dir if patterns exist) **or** API tests in Task 3

**Interfaces:**
- Produces: `rebake_adjust(result_id: str, brightness: float, contrast: float) -> dict`
- Produces: `rebake_brightness(result_id, brightness)` → `rebake_adjust(..., brightness, meta_contrast_or_1)`
- Meta patch keys: `brightness`, `contrast` (both rounded 4 dp)

- [ ] **Step 1: Write failing test for meta.contrast persistence**

Prefer an API-level test in Task 3 if unit setup is heavy. Minimal unit sketch if helpers already fixture-based:

```python
def test_rebake_adjust_writes_contrast_meta(tmp_result_with_base):
    # arrange: result_id with digital_base.jpg and meta
    meta = results_mod.rebake_adjust(result_id, 1.1, 1.2)
    assert meta["brightness"] == pytest.approx(1.1)
    assert meta["contrast"] == pytest.approx(1.2)
```

If no tmp fixture yet, skip to Task 3 Step 1 (API test) and implement rebake there first — still TDD via API.

- [ ] **Step 2: Implement `rebake_adjust`**

Replace the enhance body in `rebake_brightness` with:

```python
from .brightness import apply_adjust, DEFAULT_CONTRAST, parse_contrast

def rebake_adjust(result_id: str, brightness: float, contrast: float) -> dict[str, Any]:
    # same guard / load base as rebake_brightness today
    with Image.open(io.BytesIO(base_path.read_bytes())) as src:
        adjusted = apply_adjust(src.convert("RGB"), float(brightness), float(contrast))
        adjusted.load()
    # ... same JPEG encode / preview / print / view paths using `adjusted` ...
    patch["brightness"] = round(float(brightness), 4)
    patch["contrast"] = round(float(contrast), 4)
    # re-read meta + patch (same race-safe pattern as today)
    ...


def rebake_brightness(result_id: str, brightness: float) -> dict[str, Any]:
    meta = load_meta(result_id)
    if meta is None:
        raise FileNotFoundError("result not found")
    try:
        contrast = parse_contrast(meta.get("contrast", DEFAULT_CONTRAST))
    except ValueError:
        contrast = DEFAULT_CONTRAST
    return rebake_adjust(result_id, brightness, contrast)
```

- [ ] **Step 3: Run relevant tests**

Run: `cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-api && PYTHONPATH=. python -m pytest tests/test_brightness.py -v`  
Expected: PASS (existing brightness behavior preserved)

- [ ] **Step 4: Commit**

```bash
cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-api
git add app/results.py tests/test_brightness.py
git commit -m "$(cat <<'EOF'
feat(results): rebake_adjust with brightness then contrast

EOF
)"
```

---

### Task 3: API `GET contrast` + `POST /adjust` + alias

**Files:**
- Modify: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-api/app/main.py`
- Modify: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-api/app/full_render.py` (apply_adjust on promote)
- Test: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-api/tests/test_brightness.py` (or `tests/test_adjust.py`)

**Interfaces:**
- Consumes: `parse_brightness`, `parse_contrast`, `rebake_adjust`, `rebake_brightness`
- Produces: GET payload fields `brightness`, `contrast`
- Produces: `POST /api/result/{id}/adjust` body `{brightness, contrast}`
- Produces: existing `POST …/brightness` unchanged for clients, uses alias

- [ ] **Step 1: Write failing API tests**

```python
def test_get_result_includes_default_contrast(client, seeded_result):
    r = client.get(f"/api/result/{seeded_result}")
    assert r.status_code == 200
    body = r.json()
    assert body["brightness"] == pytest.approx(1.0)
    assert body["contrast"] == pytest.approx(1.0)


def test_post_adjust_sets_both(client, seeded_result_with_base):
    r = client.post(
        f"/api/result/{seeded_result_with_base}/adjust",
        json={"brightness": 1.15, "contrast": 1.2},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["brightness"] == pytest.approx(1.15)
    assert body["contrast"] == pytest.approx(1.2)
    g = client.get(f"/api/result/{seeded_result_with_base}").json()
    assert g["contrast"] == pytest.approx(1.2)


def test_post_adjust_out_of_range_422(client, seeded_result_with_base):
    r = client.post(
        f"/api/result/{seeded_result_with_base}/adjust",
        json={"brightness": 1.0, "contrast": 2.5},
    )
    assert r.status_code == 422


def test_post_brightness_alias_keeps_contrast(client, seeded_result_with_base):
    client.post(
        f"/api/result/{seeded_result_with_base}/adjust",
        json={"brightness": 1.0, "contrast": 1.25},
    )
    r = client.post(
        f"/api/result/{seeded_result_with_base}/brightness",
        json={"brightness": 1.1},
    )
    assert r.status_code == 200
    assert r.json()["contrast"] == pytest.approx(1.25)
    assert r.json()["brightness"] == pytest.approx(1.1)
```

Use the same client/fixtures pattern already in `tests/test_brightness.py` (adapt names to real fixtures).

- [ ] **Step 2: Run — expect FAIL** (404 on `/adjust` or missing `contrast`)

Run: `cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-api && PYTHONPATH=. python -m pytest tests/test_brightness.py -k adjust -v`

- [ ] **Step 3: Wire `main.py`**

In `_result_public_payload` (or wherever brightness is attached):

```python
from .brightness import DEFAULT_CONTRAST, parse_contrast

try:
    body["contrast"] = parse_contrast(meta.get("contrast", DEFAULT_CONTRAST))
except ValueError:
    body["contrast"] = DEFAULT_CONTRAST
```

Add:

```python
class AdjustBody(BaseModel):
    brightness: float = Field(..., ge=0.7, le=1.35)
    contrast: float = Field(..., ge=0.7, le=1.35)


@app.post("/api/result/{result_id}/adjust")
def set_result_adjust(result_id: str, payload: AdjustBody):
    meta0 = load_meta(result_id) if is_valid_result_id(result_id) else None
    if not meta0:
        raise HTTPException(status_code=404, detail="Result not found")
    from . import full_render
    if full_render.public_status(result_id, meta0) == "pending":
        raise HTTPException(
            status_code=409,
            detail="Full-size render is in progress; try again in a moment",
        )
    try:
        meta = results_mod.rebake_adjust(
            result_id, payload.brightness, payload.contrast
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=409,
            detail="digital_base.jpg missing; adjust cannot be applied for this result",
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    results_mod.mirror_result_into_pair(result_id, meta=meta)
    return _result_public_payload(result_id, meta)
```

Leave `set_result_brightness` calling `rebake_brightness` (alias).

In `full_render.py`, where brightness is applied to the promote crop, use `apply_adjust` with both meta values (default contrast 1.0).

- [ ] **Step 4: Run tests — PASS**

Run: `cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-api && PYTHONPATH=. python -m pytest tests/test_brightness.py tests/test_preview_then_full.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-api
git add app/main.py app/full_render.py app/results.py tests/test_brightness.py
git commit -m "$(cat <<'EOF'
feat(api): POST /adjust and contrast on GET

EOF
)"
```

---

### Task 4: Front helpers + `adjust.js` mount — TDD

**Files:**
- Create: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-landing/js/adjust.js`
- Create: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-landing/js/adjust.test.js`
- Modify: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-landing/js/brightness.js` — thin re-export of normalize/isDirty for back-compat OR leave and migrate call sites to `GosphotoAdjust`

**Interfaces:**
- Produces: `normalize`, `isDirty`, `isPairDirty(b, c)`, `DEFAULT/MIN/MAX/EPS`
- Produces: `mount({ root, digitalImg, printImg, resultId, getAdjustUrl, onApplied, onError }) -> { applyFromServer({brightness, contrast}|number), show }`
- `applyFromServer` accepts object `{brightness, contrast}` (number-only brightness deprecated)

- [ ] **Step 1: Write failing node tests**

```javascript
// js/adjust.test.js
const assert = require("assert");
const a = require("./adjust.js");

assert.strictEqual(a.normalize(1.2), 1.2);
assert.strictEqual(a.normalize(9), 1.35);
assert.strictEqual(a.isDirty(1), false);
assert.strictEqual(a.isDirty(1.2), true);
assert.strictEqual(a.isPairDirty(1, 1), false);
assert.strictEqual(a.isPairDirty(1, 1.2), true);
console.log("ok");
```

- [ ] **Step 2: Run — FAIL** (`MODULE_NOT_FOUND`)

Run: `cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-landing && node js/adjust.test.js`

- [ ] **Step 3: Implement `adjust.js`**

Key behaviors (full file in implementation):

- Query `[data-brightness]`, `[data-contrast]`, `[data-adjust-reset]` (also accept legacy `[data-brightness-reset]`)
- `serverB` / `serverC`, `currentB` / `currentC`
- `paint()`:  
  `filter = brightness(currentB/serverB) contrast(currentC/serverC)` — omit a term if ratio ≈ 1; clear filter if both ~1
- `schedule`: debounce 250ms → `POST` JSON `{ brightness: currentB, contrast: currentC }` to `getAdjustUrl(id)` default `/api/result/{id}/adjust`
- Reset: both to `1.0`, then send
- No `localStorage` / `sessionStorage`
- Export `root.GosphotoAdjust`; optionally `root.GosphotoBrightness = GosphotoAdjust` for soft migration

- [ ] **Step 4: Run — PASS**

Run: `cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-landing && node js/adjust.test.js`  
Expected: `ok`  
Also: `rg 'localStorage|sessionStorage' js/adjust.js` → no matches

- [ ] **Step 5: Commit (landing)**

```bash
cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-landing
git add js/adjust.js js/adjust.test.js
git commit -m "$(cat <<'EOF'
feat(adjust): front helpers and dual-slider mount

EOF
)"
```

---

### Task 5: Wire `result.html` + CSS

**Files:**
- Modify: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-landing/result.html`
- Modify: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-landing/css/styles.css`

- [ ] **Step 1: Markup**

Inside `#result-brightness-controls` (keep id or rename to `result-adjust-controls`):

```html
<label class="brightness-label" for="result-contrast">Контраст</label>
<input
  id="result-contrast"
  class="brightness-range"
  data-contrast
  type="range"
  min="0.7"
  max="1.35"
  step="0.01"
  value="1"
/>
<button type="button" class="btn btn-ghost" data-adjust-reset hidden>
  Сбросить
</button>
```

Remove sole dependency on `data-brightness-reset` or keep both attributes on the same button: `data-adjust-reset data-brightness-reset`.

Script tag: `/js/adjust.js?v=20261122-adjust` (can keep brightness.js load only if re-export needed).

- [ ] **Step 2: Boot wiring**

```javascript
adjustCtl = GosphotoAdjust.mount({
  root: document.getElementById("result-brightness-controls"),
  digitalImg: ...,
  printImg: ...,
  resultId,
  getAdjustUrl: (rid) => `/api/result/${rid}/adjust`,
  onApplied: ...,
  onError: ...,
});
adjustCtl.applyFromServer({
  brightness: data.brightness,
  contrast: data.contrast != null ? data.contrast : 1,
});
```

Gate visibility with existing `brightness_editable` (or rename to `adjust_editable` later — YAGNI: reuse flag).

- [ ] **Step 3: CSS**

Stack labels/ranges vertically; reuse `.brightness-controls` gap; no new visual system.

- [ ] **Step 4: Manual smoke locally** (optional against API on feat branch)

- Unpaid: move contrast → preview updates → reset clears both
- Confirm Network: one POST `/adjust` with both fields after debounce

- [ ] **Step 5: Commit**

```bash
cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-landing
git add result.html css/styles.css js/adjust.js
git commit -m "$(cat <<'EOF'
feat(result): contrast slider with shared reset via /adjust

EOF
)"
```

---

### Task 6: Ship API then landing

**Files:** none new — git remotes only

- [ ] **Step 1: Push API branch / merge to `main`**

```bash
cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-api
git push -u origin HEAD
# open PR or merge to main per team habit; deploy only from main CI
```

Wait for green `deploy.yml` on `gosphoto/api`.

- [ ] **Step 2: Push landing**

```bash
cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-landing
git push -u origin HEAD
# merge to main when API is live so /adjust exists
```

- [ ] **Step 3: Prod smoke**

1. New unpaid result with `digital_base` → both sliders visible  
2. Contrast 1.2 + brightness 1.1 → GET returns both  
3. Pay → same values, reset works without browser storage  
4. Old `/brightness` still works if called

---

## Spec coverage check

| Spec item | Task |
| --- | --- |
| `meta.contrast` + range | 1, 2, 3 |
| Bake brightness→contrast | 1 (`apply_adjust`), 2 |
| `POST /adjust` | 3 |
| `/brightness` alias keeps contrast | 2, 3 |
| GET returns both | 3 |
| Dual UI + one reset | 4, 5 |
| Optimistic CSS ratios | 4 |
| No browser storage | 4 |
| Payment does not clear | 3 (`full_render` apply, no meta wipe) |
| Deploy via CI | 6 |
