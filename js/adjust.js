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
  function isPairDirty(b, c) {
    return isDirty(b) || isDirty(c);
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
   * Wire brightness + contrast sliders. State lives only in memory (server is source of truth).
   * Images from the API already have serverB/serverC baked in; CSS filter is the ratio current/server.
   */
  function mount(opts) {
    const o = opts || {};
    const rootEl = o.root;
    if (!rootEl) return null;
    const inputB = rootEl.querySelector("[data-brightness]");
    const inputC = rootEl.querySelector("[data-contrast]");
    const resetBtn =
      rootEl.querySelector("[data-adjust-reset]") ||
      rootEl.querySelector("[data-brightness-reset]");
    if (!inputB || !inputC) return null;
    const imgs = [o.digitalImg, o.printImg].filter(Boolean);
    const getUrl =
      o.getAdjustUrl ||
      function (id) {
        return "/api/result/" + id + "/adjust";
      };

    let serverB = DEFAULT;
    let serverC = DEFAULT;
    let currentB = DEFAULT;
    let currentC = DEFAULT;
    let timer = null;
    let inflight = 0;
    let seq = 0;

    function paint() {
      const ratioB = currentB / serverB;
      const ratioC = currentC / serverC;
      const parts = [];
      if (Math.abs(ratioB - 1) >= 0.0005) parts.push("brightness(" + ratioB + ")");
      if (Math.abs(ratioC - 1) >= 0.0005) parts.push("contrast(" + ratioC + ")");
      const f = parts.join(" ");
      imgs.forEach(function (img) {
        img.style.filter = f;
      });
      inputB.value = String(currentB);
      inputC.value = String(currentC);
      if (resetBtn) resetBtn.hidden = !isPairDirty(currentB, currentC);
    }

    function applyFromServer(value) {
      if (value != null && typeof value === "object") {
        serverB = normalize(value.brightness);
        serverC = normalize(value.contrast != null ? value.contrast : DEFAULT);
      } else {
        serverB = normalize(value);
      }
      if (timer || inflight) return;
      currentB = serverB;
      currentC = serverC;
      paint();
    }

    function show() {
      rootEl.hidden = false;
    }

    async function send(brightness, contrast) {
      const mySeq = ++seq;
      inflight += 1;
      const id = o.resultId;
      try {
        const res = await fetch(getUrl(id), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brightness: brightness, contrast: contrast }),
        });
        const data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok || data.ok === false) throw new Error("adjust_failed");
        if (mySeq !== seq) return;
        serverB = normalize(data.brightness != null ? data.brightness : brightness);
        serverC = normalize(data.contrast != null ? data.contrast : contrast);
        currentB = serverB;
        currentC = serverC;
        const urls = pickUrls(data);
        const token = Date.now().toString(36);
        if (o.digitalImg && urls.digital) o.digitalImg.src = bustUrl(urls.digital, token);
        if (o.printImg && urls.print) o.printImg.src = bustUrl(urls.print, token);
        paint();
        if (typeof o.onApplied === "function") o.onApplied(data, token);
      } catch (e) {
        if (mySeq !== seq) return;
        currentB = serverB;
        currentC = serverC;
        paint();
        if (typeof o.onError === "function") o.onError(e);
      } finally {
        inflight -= 1;
      }
    }

    function schedule() {
      currentB = normalize(inputB.value);
      currentC = normalize(inputC.value);
      paint();
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        send(currentB, currentC);
      }, DEBOUNCE_MS);
    }

    inputB.addEventListener("input", schedule);
    inputC.addEventListener("input", schedule);
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        currentB = DEFAULT;
        currentC = DEFAULT;
        paint();
        send(DEFAULT, DEFAULT);
      });
    }

    return { applyFromServer: applyFromServer, show: show };
  }

  const api = {
    DEFAULT,
    MIN,
    MAX,
    EPS,
    DEBOUNCE_MS,
    normalize,
    isDirty,
    isPairDirty,
    mount,
  };
  root.GosphotoAdjust = api;
  root.GosphotoBrightness = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);