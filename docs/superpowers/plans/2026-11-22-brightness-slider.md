# Brightness Slider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users adjust result brightness on Госфото before/after pay; bake into digital+print on the server; show reset when dirty; never store brightness in the browser.

**Architecture:** Store a neutral `digital_base.jpg` per result. `POST /api/result/{id}/brightness` validates range, saves `meta.brightness`, rebakes preview (and paid digital/print) from that base via PIL `ImageEnhance.Brightness`. Landing shows a range slider + reset; optimistic CSS filter until POST returns; UI always rehydrates from GET.

**Tech Stack:** FastAPI + pytest (`gosphoto-api`); vanilla JS + HTML/CSS (`gosphoto-landing`); PIL brightness (same semantics as CSS `filter: brightness()`).

**Spec:** `docs/superpowers/specs/2026-11-22-brightness-slider-design.md`

## Global Constraints

- Server is source of truth for brightness; no `localStorage` / `sessionStorage` for the level
- Range inclusive `[0.7, 1.35]`; outside → HTTP **422** (no silent clamp on the wire)
- Default `1.0`; reset button when `|brightness − 1.0| ≥ 0.01`
- One brightness applies to both 35×45 and 10×15; resume product out of scope
- API ship via commit/push to `gosphoto/api` `main` (CI deploy); landing via `gosphoto/landing`
- TDD: failing test before production code

## File map

| File | Role |
| --- | --- |
| `gosphoto-api/app/brightness.py` | Normalize/validate helpers + `apply_brightness` (PIL) |
| `gosphoto-api/app/results.py` | Persist `digital_base.jpg`, update brightness meta, rebake helpers |
| `gosphoto-api/app/main.py` | Expose `brightness` on GET; `POST …/brightness`; save base on process |
| `gosphoto-api/app/full_render.py` | After promote crop, write/update base + apply `meta.brightness` |
| `gosphoto-api/tests/test_brightness.py` | Unit + API tests |
| `gosphoto-landing/js/brightness.js` | Slider UI module (no storage) |
| `gosphoto-landing/js/brightness.test.js` | Node assert tests for pure helpers |
| `gosphoto-landing/result.html` | Markup + wire module |
| `gosphoto-landing/css/styles.css` | Minimal control styles |

---

### Task 1: Pure brightness helpers (API) — TDD

**Files:**
- Create: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-api/app/brightness.py`
- Test: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-api/tests/test_brightness.py`

**Interfaces:**
- Produces: `DEFAULT_BRIGHTNESS: float = 1.0`, `MIN_BRIGHTNESS = 0.7`, `MAX_BRIGHTNESS = 1.35`, `BRIGHTNESS_EPS = 0.01`
- Produces: `parse_brightness(value: object) -> float` raises `ValueError` if missing/non-finite/out of range
- Produces: `is_dirty(brightness: float) -> bool`
- Produces: `apply_brightness(photo: Image.Image, brightness: float) -> Image.Image` (assumes already-validated factor; no-op near 1.0)

- [ ] **Step 1: Write failing tests**

```python
# tests/test_brightness.py
import io
import pytest
from PIL import Image

from app.brightness import (
    DEFAULT_BRIGHTNESS,
    apply_brightness,
    is_dirty,
    parse_brightness,
)


def test_parse_brightness_default_and_valid():
    assert parse_brightness(1.0) == pytest.approx(1.0)
    assert parse_brightness(1.25) == pytest.approx(1.25)
    assert parse_brightness(0.7) == pytest.approx(0.7)
    assert parse_brightness(1.35) == pytest.approx(1.35)


def test_parse_brightness_rejects_out_of_range():
    with pytest.raises(ValueError):
        parse_brightness(2.5)
    with pytest.raises(ValueError):
        parse_brightness(0.5)
    with pytest.raises(ValueError):
        parse_brightness("bright")


def test_is_dirty():
    assert is_dirty(1.0) is False
    assert is_dirty(1.009) is False
    assert is_dirty(1.25) is True


def test_apply_brightness_brightens_mid_gray():
    img = Image.new("RGB", (32, 32), (128, 128, 128))
    out = apply_brightness(img, 1.25)
    assert out.getpixel((0, 0))[0] > 128
    same = apply_brightness(img, 1.0)
    assert same.getpixel((0, 0)) == (128, 128, 128)
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-api && python -m pytest tests/test_brightness.py -v`  
Expected: import error / module missing

- [ ] **Step 3: Minimal implementation**

```python
# app/brightness.py
from __future__ import annotations

from PIL import Image, ImageEnhance

DEFAULT_BRIGHTNESS = 1.0
MIN_BRIGHTNESS = 0.7
MAX_BRIGHTNESS = 1.35
BRIGHTNESS_EPS = 0.01


def parse_brightness(value: object) -> float:
    try:
        n = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError) as e:
        raise ValueError("brightness must be a number") from e
    if not (MIN_BRIGHTNESS <= n <= MAX_BRIGHTNESS):
        raise ValueError(
            f"brightness must be between {MIN_BRIGHTNESS} and {MAX_BRIGHTNESS}"
        )
    return round(n, 4)


def is_dirty(brightness: float) -> bool:
    return abs(float(brightness) - DEFAULT_BRIGHTNESS) >= BRIGHTNESS_EPS


def apply_brightness(photo: Image.Image, brightness: float) -> Image.Image:
    factor = float(brightness)
    if abs(factor - DEFAULT_BRIGHTNESS) < 1e-6:
        return photo
    return ImageEnhance.Brightness(photo.convert("RGB")).enhance(factor)
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `python -m pytest tests/test_brightness.py -v`  
Expected: all PASS

- [ ] **Step 5: Commit (gosphoto-api)**

```bash
cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-api
git add app/brightness.py tests/test_brightness.py
git commit -m "feat(brightness): pure helpers with TDD"
```

---

### Task 2: Persist `digital_base.jpg` + meta.brightness default on save

**Files:**
- Modify: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-api/app/results.py`
- Modify: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-api/app/main.py` (`_run_preview_stages` / process save path)
- Test: extend `tests/test_brightness.py` and/or `tests/test_preview_then_full.py`

**Interfaces:**
- Consumes: passport crop JPEG bytes at output size
- Produces: `results.write_digital_base(result_id, jpeg_bytes) -> None`
- Produces: on `save_preview_result` / process, file `digital_base.jpg` (internal; not in public ALLOWED download list unless needed)
- Produces: `meta.brightness = 1.0` when missing at save time
- Modify `_run_preview_stages` to also return `digital_base_jpeg` via `encode_jpeg(cropped, …)` (same dims as paid crop)

- [ ] **Step 1: Failing test — base file exists after preview save helper**

```python
def test_save_preview_can_store_digital_base(tmp_path, monkeypatch):
    from app import config, results
    from PIL import Image
    import io

    monkeypatch.setattr(config, "RESULTS_DIR", tmp_path / "results")
    monkeypatch.setattr(config, "RESULTS_ENABLED", True)
    monkeypatch.setattr(config, "PAIRS_DIR", tmp_path / "pairs")

    def jpeg(size=(70, 90), color=(100, 110, 120)):
        buf = io.BytesIO()
        Image.new("RGB", size, color).save(buf, format="JPEG", quality=90)
        return buf.getvalue()

    base = jpeg()
    rid = results.save_preview_result(
        jpeg(size=(48, 60)),
        jpeg(size=(80, 50)),
        meta={"doc_type": "passport_rf"},
        digital_base_jpeg=base,
    )
    assert rid
    folder = results.result_dir(rid)
    assert (folder / "digital_base.jpg").read_bytes() == base
    meta = results.load_meta(rid)
    assert meta.get("brightness") == pytest.approx(1.0)
```

- [ ] **Step 2: Run — expect FAIL** (`digital_base_jpeg` unexpected / file missing)

- [ ] **Step 3: Implement**
  - Add optional `digital_base_jpeg: bytes | None = None` to `save_preview_result` (and `save_result` if used)
  - Write `digital_base.jpg` when provided
  - Ensure meta gets `"brightness": 1.0` if not already set
  - In `_run_preview_stages`, after crop: `digital_base_jpeg = encode_jpeg(cropped, max_bytes=…, dpi=dpi)` and return it
  - Pass it into `save_preview_result` from `_run_process_pipeline`

- [ ] **Step 4: Tests PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(results): store digital_base.jpg and default brightness"
```

---

### Task 3: Rebake from base (results helper) — TDD

**Files:**
- Modify: `gosphoto-api/app/results.py` (or `app/brightness.py` orchestration)
- Modify: `gosphoto-api/app/main.py` only if print helpers need import from results
- Test: `tests/test_brightness.py`

**Interfaces:**
- Produces: `rebake_brightness(result_id: str, brightness: float) -> dict` meta  
  Steps inside:
  1. Load `digital_base.jpg` (404/error if missing)
  2. PIL open → `apply_brightness` → encode digital JPEG bytes
  3. Decode brightened to BGR → `_print_payload` / `make_print_sheet_bgr` + encode print
  4. Write `preview_digital.jpg`, `preview_print.jpg` via `make_preview_jpeg`
  5. Regenerate `view_digital.jpg` via `make_view_jpeg` if that path is used unpaid
  6. If `digital.jpg` exists: overwrite `digital.jpg` + `print.jpg`
  7. Set `meta.brightness`, `_write_meta`, return meta

- [ ] **Step 1: Failing test**

```python
def test_rebake_brightness_updates_previews_and_meta(tmp_path, monkeypatch):
    from app import config, results
    from app.brightness import rebake_brightness  # or results.rebake_brightness
    from PIL import Image
    import io

    monkeypatch.setattr(config, "RESULTS_DIR", tmp_path / "results")
    monkeypatch.setattr(config, "RESULTS_ENABLED", True)
    monkeypatch.setattr(config, "PAIRS_DIR", tmp_path / "pairs")

    def jpeg(color, size=(70, 90)):
        buf = io.BytesIO()
        Image.new("RGB", size, color).save(buf, format="JPEG", quality=95)
        return buf.getvalue()

    base = jpeg((80, 80, 80))
    rid = results.save_preview_result(
        jpeg((80, 80, 80), size=(48, 60)),
        jpeg((80, 80, 80), size=(100, 60)),
        meta={"doc_type": "passport_rf"},
        digital_base_jpeg=base,
    )
    before = Image.open(io.BytesIO((results.result_dir(rid) / "preview_digital.jpg").read_bytes())).convert("RGB")
    meta = results.rebake_brightness(rid, 1.25)
    assert meta["brightness"] == pytest.approx(1.25)
    after = Image.open(io.BytesIO((results.result_dir(rid) / "preview_digital.jpg").read_bytes())).convert("RGB")
    # mid pixel should lighten
    bx = before.getpixel((before.size[0] // 2, before.size[1] // 2))[0]
    ax = after.getpixel((after.size[0] // 2, after.size[1] // 2))[0]
    assert ax > bx
    assert (results.result_dir(rid) / "preview_print.jpg").is_file()
```

- [ ] **Step 2: Run — FAIL (missing rebake)**

- [ ] **Step 3: Implement `results.rebake_brightness`** using `app.brightness.apply_brightness`, existing `make_preview_jpeg` / `make_view_jpeg`, and print sheet helpers (import from `print_sheet` / `main._print_payload` carefully to avoid cycles — prefer `print_sheet` + local JPEG encode)

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(results): rebake digital+print from digital_base"
```

---

### Task 4: GET exposes `brightness` + POST endpoint — TDD

**Files:**
- Modify: `gosphoto-api/app/main.py` (`_result_public_payload`, new route)
- Test: `tests/test_brightness.py` with FastAPI `TestClient` against real app **or** mini-app pattern from `test_payments.py` that calls real `rebake_brightness` + payload helper

**Interfaces:**
- Produces: GET body field `brightness: float`
- Produces: `POST /api/result/{result_id}/brightness` body model:

```python
class BrightnessBody(BaseModel):
    brightness: float = Field(..., ge=0.7, le=1.35)
```

  Response: `_result_public_payload(...)` after rebake  
  Missing result → 404; missing base → 409/404 with clear detail

- [ ] **Step 1: Failing API tests**

```python
def test_get_result_includes_default_brightness(client_with_preview_result):
    r = client_with_preview_result.get(f"/api/result/{rid}")
    assert r.status_code == 200
    assert r.json()["brightness"] == pytest.approx(1.0)


def test_post_brightness_updates_and_rejects_oob(client_with_preview_result):
    bad = client_with_preview_result.post(
        f"/api/result/{rid}/brightness", json={"brightness": 2.5}
    )
    assert bad.status_code == 422
    ok = client_with_preview_result.post(
        f"/api/result/{rid}/brightness", json={"brightness": 1.25}
    )
    assert ok.status_code == 200
    assert ok.json()["brightness"] == pytest.approx(1.25)
    meta = results.load_meta(rid)
    assert meta["brightness"] == pytest.approx(1.25)
    # unpaid: digital still locked
    assert ok.json().get("digital_url") in (None,)
    reset = client_with_preview_result.post(
        f"/api/result/{rid}/brightness", json={"brightness": 1.0}
    )
    assert reset.json()["brightness"] == pytest.approx(1.0)
```

(Implement a local fixture that writes preview+base via `save_preview_result` and mounts `TestClient(app)` from `app.main`.)

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Wire payload + route**

```python
# in _result_public_payload
from .brightness import DEFAULT_BRIGHTNESS, parse_brightness
try:
    body["brightness"] = parse_brightness(meta.get("brightness", DEFAULT_BRIGHTNESS))
except ValueError:
    body["brightness"] = DEFAULT_BRIGHTNESS

@app.post("/api/result/{result_id}/brightness")
def set_result_brightness(result_id: str, payload: BrightnessBody):
    ...
    meta = results.rebake_brightness(result_id, payload.brightness)
    return _result_public_payload(result_id, meta)
```

Note: Pydantic `Field(ge=0.7, le=1.35)` yields 422 for out-of-range; still call `parse_brightness` inside rebake for defense.

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(api): GET/POST result brightness"
```

---

### Task 5: Paid path keeps brightness — TDD

**Files:**
- Modify: `gosphoto-api/app/full_render.py` (`promote_paid_from_edit_gemini`)
- Test: `tests/test_brightness.py`

**Behavior:**
1. After crop+encode of paid digital, write/update `digital_base.jpg` (neutral)
2. Apply `meta.brightness` (default 1.0) before writing final `digital.jpg` / `print.jpg` / previews
3. Test: set brightness unpaid → mark paid / call promote → digital mean luminance reflects 1.25; GET still returns 1.25; reset POST after pay works on full files

- [ ] **Step 1: Failing test** `test_brightness_survives_paid_promote`

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement promote brightness apply + base refresh**

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(full_render): apply stored brightness on paid promote"
```

---

### Task 6: Front pure helpers — TDD

**Files:**
- Create: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-landing/js/brightness.js`
- Create: `/Users/antonbutov/Documents/MYPROJECTS/gosphoto-landing/js/brightness.test.js`

**Interfaces (browser + node):**
- Export via `globalThis.GosphotoBrightness = { normalize, isDirty, DEFAULT, MIN, MAX }` for page script
- Also `module.exports` when `typeof module !== "undefined"` for node test

```javascript
// brightness.js (helpers only in this task)
(function (root) {
  const DEFAULT = 1;
  const MIN = 0.7;
  const MAX = 1.35;
  const EPS = 0.01;
  function normalize(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT;
    return Math.min(MAX, Math.max(MIN, n));
  }
  function isDirty(value) {
    return Math.abs(normalize(value) - DEFAULT) >= EPS;
  }
  const api = { DEFAULT, MIN, MAX, EPS, normalize, isDirty };
  root.GosphotoBrightness = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
```

- [ ] **Step 1: Write `brightness.test.js`**

```javascript
const assert = require("assert");
const b = require("./brightness.js");
assert.strictEqual(b.normalize(1.25), 1.25);
assert.strictEqual(b.normalize(9), 1.35);
assert.strictEqual(b.isDirty(1), false);
assert.strictEqual(b.isDirty(1.2), true);
console.log("ok");
```

- [ ] **Step 2: `node js/brightness.test.js` — FAIL until file exists**

- [ ] **Step 3: Implement helpers in `brightness.js`**

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit (gosphoto-landing)**

```bash
cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-landing
git add js/brightness.js js/brightness.test.js
git commit -m "feat(brightness): front helpers with node tests"
```

---

### Task 7: Wire slider UI on `result.html`

**Files:**
- Modify: `gosphoto-landing/result.html` (markup under digital product + script include + boot hook)
- Modify: `gosphoto-landing/js/brightness.js` (mount function)
- Modify: `gosphoto-landing/css/styles.css`
- Cache-bust query on script/css

**UI contract:**
- Markup after digital guide / before download link:

```html
<div class="brightness-controls" id="result-brightness-controls" hidden>
  <label class="brightness-label" for="result-brightness">Яркость</label>
  <input
    id="result-brightness"
    class="brightness-range"
    data-brightness
    type="range"
    min="0.7"
    max="1.35"
    step="0.01"
    value="1"
  />
  <button type="button" class="btn btn-ghost" data-brightness-reset hidden>
    Сбросить
  </button>
</div>
```

- `GosphotoBrightness.mount({ root, digitalImg, printImg, resultId, getBrightnessUrl, onApplied })`
  - Shows controls when result loaded
  - `applyFromServer(brightness)` sets slider, filter, reset visibility — **no storage**
  - input → CSS filter on both images → debounce 250ms → `POST /api/result/{id}/brightness` JSON
  - on 200 → update img `src` with cache-bust from response URLs; sync slider/filter
  - on error → revert to last server brightness
  - reset → POST `1.0`
- In existing `boot`/render path after GET: `applyFromServer(data.brightness)`; show controls

- [ ] **Step 1:** Add a small node test for “mount is a function” / dirty→reset visibility helper if extracted; else manual checklist after wire (API already covered)

- [ ] **Step 2:** Implement mount + HTML/CSS + call from result boot (no localStorage keys anywhere in the module — grep to verify)

- [ ] **Step 3:** `node js/brightness.test.js` still PASS; grep `localStorage|sessionStorage` in `brightness.js` → no matches

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(result): brightness slider with server-backed reset"
```

---

### Task 8: Smoke + deploy path

- [ ] **Step 1:** Run API suite subset:

```bash
cd /Users/antonbutov/Documents/MYPROJECTS/gosphoto-api
python -m pytest tests/test_brightness.py tests/test_preview_then_full.py tests/test_payments.py -v
```

Expected: PASS

- [ ] **Step 2:** Run front helpers: `node js/brightness.test.js` → `ok`

- [ ] **Step 3:** Push only when user asks (`gosphoto-api` then `gosphoto-landing`); wait for green Actions per deploy-via-commits rule

- [ ] **Step 4:** Manual smoke on staging/prod after CI: unpaid slider → reset visible → pay → same brightness + reset without browser storage

---

## Spec coverage check

| Spec requirement | Task |
| --- | --- |
| Server SoT / no browser storage | 4, 5, 7 |
| Range 0.7–1.35 + 422 | 1, 4 |
| Reset when dirty | 6, 7 |
| Bake digital + print | 3, 5 |
| Optimistic CSS + debounce POST | 7 |
| Survive payment via GET | 5, 7 |
| TDD | 1–6 |
| Resume out of scope | — |
| Deploy via CI commits | 8 |

## Placeholder / consistency review

- Endpoint name: `/brightness` (not `/reframe`) everywhere
- Meta field: `brightness` (float)
- Base file: `digital_base.jpg` (neutral, rewritten on paid promote)
- Front global: `GosphotoBrightness`
