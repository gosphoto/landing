(function (root) {
  const DEFAULT = 1;
  const MIN = 0.7;
  const MAX = 1.35;
  const EPS = 0.01;
  const DEBOUNCE_MS = 250;

  function normalize(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT;
    return Math.min(MAX, Math.max(MIN, n));
  }
  function isDirty(value) {
    return Math.abs(normalize(value) - DEFAULT) >= EPS;
  }
  function bustUrl(url, token) {
    if (!url) return "";
    const base = String(url).replace(/([?&])bv=[^&]*&?/, "$1").replace(/[?&]$/, "");
    return base + (base.indexOf("?") === -1 ? "?" : "&") + "bv=" + token;
  }
  function pickUrls(data) {
    const paid = !!(data && data.paid);
    const digital =
      (paid && data.digital_url) ||
      (data && data.preview_digital_url) ||
      (data && data.digital_url) ||
      "";
    const print =
      (paid && data.print_url) ||
      (data && data.preview_print_url) ||
      (data && data.print_url) ||
      "";
    return { digital, print };
  }

  /**
   * Wire the brightness slider. State lives only in memory (server is the source of truth).
   * Images served by the API already have `serverValue` baked in, so the optimistic
   * CSS filter is the ratio slider / serverValue.
   */
  function mount(opts) {
    const o = opts || {};
    const rootEl = o.root;
    if (!rootEl) return null;
    const input = rootEl.querySelector("[data-brightness]");
    const resetBtn = rootEl.querySelector("[data-brightness-reset]");
    if (!input) return null;
    const imgs = [o.digitalImg, o.printImg].filter(Boolean);
    const getUrl =
      o.getBrightnessUrl ||
      function (id) {
        return "/api/result/" + id + "/brightness";
      };

    let serverValue = DEFAULT;
    let current = DEFAULT;
    let timer = null;
    let inflight = 0;
    let seq = 0;

    function paint() {
      const ratio = current / serverValue;
      const f = Math.abs(ratio - 1) < 0.0005 ? "" : "brightness(" + ratio + ")";
      imgs.forEach(function (img) {
        img.style.filter = f;
      });
      input.value = String(current);
      if (resetBtn) resetBtn.hidden = !isDirty(current);
    }

    function applyFromServer(value) {
      serverValue = normalize(value);
      // Don't clobber an edit the user is making right now.
      if (timer || inflight) return;
      current = serverValue;
      paint();
    }

    function show() {
      rootEl.hidden = false;
    }

    async function send(value) {
      const mySeq = ++seq;
      inflight += 1;
      const id = o.resultId;
      try {
        const res = await fetch(getUrl(id), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brightness: value }),
        });
        const data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok || data.ok === false) throw new Error("brightness_failed");
        if (mySeq !== seq) return; // newer edit in flight; it will settle state
        serverValue = normalize(data.brightness != null ? data.brightness : value);
        current = serverValue;
        const urls = pickUrls(data);
        const token = Date.now().toString(36);
        if (o.digitalImg && urls.digital) o.digitalImg.src = bustUrl(urls.digital, token);
        if (o.printImg && urls.print) o.printImg.src = bustUrl(urls.print, token);
        paint();
        if (typeof o.onApplied === "function") o.onApplied(data, token);
      } catch (e) {
        if (mySeq !== seq) return;
        current = serverValue;
        paint();
        if (typeof o.onError === "function") o.onError(e);
      } finally {
        inflight -= 1;
      }
    }

    function schedule(value) {
      current = normalize(value);
      paint();
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        send(current);
      }, DEBOUNCE_MS);
    }

    input.addEventListener("input", function () {
      schedule(input.value);
    });
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        current = DEFAULT;
        paint();
        send(DEFAULT);
      });
    }

    return { applyFromServer: applyFromServer, show: show };
  }

  const api = { DEFAULT, MIN, MAX, EPS, DEBOUNCE_MS, normalize, isDirty, mount };
  root.GosphotoBrightness = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
