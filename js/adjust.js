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
  function isPairDirty(b, c, s) {
    return isDirty(b) || isDirty(c) || isDirty(s != null ? s : DEFAULT);
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
   * Wire brightness + contrast + saturation sliders.
   * State lives only in memory (server is source of truth).
   * Images from the API already have server values baked in;
   * CSS filter is the ratio current/server for each channel.
   */
  function mount(opts) {
    const o = opts || {};
    const rootEl = o.root;
    if (!rootEl) return null;
    const inputB = rootEl.querySelector("[data-brightness]");
    const inputC = rootEl.querySelector("[data-contrast]");
    const inputS = rootEl.querySelector("[data-saturation]");
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
    let serverS = DEFAULT;
    let currentB = DEFAULT;
    let currentC = DEFAULT;
    let currentS = DEFAULT;
    let timer = null;
    let inflight = false;
    let queued = false;
    const preload =
      o.preload ||
      function (url, cb) {
        if (typeof Image === "undefined") {
          cb(true);
          return;
        }
        const probe = new Image();
        probe.onload = function () {
          cb(true);
        };
        probe.onerror = function () {
          cb(false);
        };
        probe.src = url;
      };

    function paint() {
      const ratioB = currentB / serverB;
      const ratioC = currentC / serverC;
      const ratioS = currentS / serverS;
      const parts = [];
      if (Math.abs(ratioB - 1) >= 0.0005) parts.push("brightness(" + ratioB + ")");
      if (Math.abs(ratioC - 1) >= 0.0005) parts.push("contrast(" + ratioC + ")");
      if (Math.abs(ratioS - 1) >= 0.0005) parts.push("saturate(" + ratioS + ")");
      const f = parts.join(" ");
      imgs.forEach(function (img) {
        img.style.filter = f;
      });
      inputB.value = String(currentB);
      inputC.value = String(currentC);
      if (inputS) inputS.value = String(currentS);
      if (resetBtn) resetBtn.hidden = !isPairDirty(currentB, currentC, currentS);
    }

    function applyFromServer(value) {
      if (value != null && typeof value === "object") {
        serverB = normalize(value.brightness);
        serverC = normalize(value.contrast != null ? value.contrast : DEFAULT);
        serverS = normalize(value.saturation != null ? value.saturation : DEFAULT);
      } else {
        serverB = normalize(value);
      }
      if (timer || inflight) return;
      currentB = serverB;
      currentC = serverC;
      currentS = serverS;
      paint();
    }

    function show() {
      rootEl.hidden = false;
    }

    function finish() {
      inflight = false;
      if (queued) {
        queued = false;
        if (!timer) fire();
      }
    }

    // Serialize: never run two POSTs at once; when one finishes, send the latest triple once.
    function fire() {
      if (inflight) {
        queued = true;
        return;
      }
      if (
        Math.abs(currentB - serverB) < 0.0005 &&
        Math.abs(currentC - serverC) < 0.0005 &&
        Math.abs(currentS - serverS) < 0.0005
      ) {
        paint();
        return;
      }
      send(currentB, currentC, currentS);
    }

    async function send(brightness, contrast, saturation) {
      inflight = true;
      const id = o.resultId;
      let handedOff = false;
      try {
        const res = await fetch(getUrl(id), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brightness: brightness,
            contrast: contrast,
            saturation: saturation,
          }),
        });
        const data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok || data.ok === false) throw new Error("adjust_failed");
        const nextB = normalize(data.brightness != null ? data.brightness : brightness);
        const nextC = normalize(data.contrast != null ? data.contrast : contrast);
        const nextS = normalize(data.saturation != null ? data.saturation : saturation);
        const urls = pickUrls(data);
        const token = Date.now().toString(36);
        const digitalUrl = o.digitalImg && urls.digital ? bustUrl(urls.digital, token) : "";
        const printUrl = o.printImg && urls.print ? bustUrl(urls.print, token) : "";

        // Keep the optimistic CSS filter until the new bitmap is decoded, then swap
        // src + server baseline + paint together (no flash of the old/new mismatch).
        let pending = (digitalUrl ? 1 : 0) + (printUrl ? 1 : 0);
        let failed = false;
        function commit() {
          if (failed) {
            if (!timer && !queued) {
              currentB = serverB;
              currentC = serverC;
              currentS = serverS;
            }
            paint();
            if (typeof o.onError === "function") o.onError(new Error("adjust_preload_failed"));
            finish();
            return;
          }
          serverB = nextB;
          serverC = nextC;
          serverS = nextS;
          if (digitalUrl) o.digitalImg.src = digitalUrl;
          if (printUrl) o.printImg.src = printUrl;
          if (!timer && !queued) {
            currentB = serverB;
            currentC = serverC;
            currentS = serverS;
          }
          paint();
          if (typeof o.onApplied === "function") o.onApplied(data, token);
          finish();
        }
        handedOff = true;
        if (!pending) {
          commit();
          return;
        }
        function done(ok) {
          if (!ok) failed = true;
          pending -= 1;
          if (pending === 0) commit();
        }
        if (digitalUrl) preload(digitalUrl, done);
        if (printUrl) preload(printUrl, done);
      } catch (e) {
        if (!handedOff) {
          queued = false;
          if (!timer) {
            currentB = serverB;
            currentC = serverC;
            currentS = serverS;
          }
          paint();
          if (typeof o.onError === "function") o.onError(e);
          finish();
        }
      }
    }

    function schedule() {
      currentB = normalize(inputB.value);
      currentC = normalize(inputC.value);
      currentS = inputS ? normalize(inputS.value) : DEFAULT;
      paint();
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        fire();
      }, DEBOUNCE_MS);
    }

    inputB.addEventListener("input", schedule);
    inputC.addEventListener("input", schedule);
    if (inputS) inputS.addEventListener("input", schedule);
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        currentB = DEFAULT;
        currentC = DEFAULT;
        currentS = DEFAULT;
        paint();
        fire();
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
    bustUrl,
    mount,
  };
  root.GosphotoAdjust = api;
  root.GosphotoBrightness = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
