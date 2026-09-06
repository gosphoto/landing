(() => {
  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function fmtMm(n, digits) {
    if (n == null || Number.isNaN(Number(n))) return null;
    const d = digits == null ? 1 : digits;
    return Number(n)
      .toFixed(d)
      .replace(".", ",")
      .replace(/,0$/, "");
  }

  function metricsFrom(data) {
    const c = (data && data.compliance) || data || {};
    const top = Number(c.top_margin);
    const face = Number(c.face_ratio);
    const headMm = Number(c.head_height_mm);
    const headWmm = Number(c.head_width_mm);
    const topRatio = Number.isFinite(top) ? clamp(top, 0.06, 0.18) : 0.1;
    const faceRatio = Number.isFinite(face) ? clamp(face, 0.65, 0.86) : 0.75;
    const headWRatio = Number.isFinite(headWmm)
      ? clamp(headWmm / 35, 0.42, 0.78)
      : null;
    return {
      top: topRatio,
      face: faceRatio,
      headW: headWRatio,
      headMm: Number.isFinite(headMm) ? headMm : null,
      headWmm: Number.isFinite(headWmm) ? headWmm : null,
      topMm: Number.isFinite(top) ? top * 45 : 4.5,
    };
  }

  function bind(root, data) {
    if (!root) return;
    const m = metricsFrom(data);
    root.style.setProperty("--guide-top", `${(m.top * 100).toFixed(2)}%`);
    root.style.setProperty("--guide-head", `${(m.face * 100).toFixed(2)}%`);
    root.style.setProperty(
      "--guide-head-w",
      `${((m.headW || 0.55) * 100).toFixed(2)}%`
    );
    root.classList.toggle("has-facew", Boolean(m.headWmm));
    const topEl = root.querySelector("[data-guide-top]");
    const headEl = root.querySelector("[data-guide-head]");
    const facewEl = root.querySelector("[data-guide-facew]");
    const captionEl = root.querySelector("[data-guide-caption]");
    const topLabel = `${fmtMm(m.topMm)} мм`;
    const headLabel = m.headMm ? `${fmtMm(m.headMm)} мм` : "32–36 мм";
    if (topEl) topEl.textContent = topLabel;
    if (headEl) headEl.textContent = headLabel;
    if (facewEl) {
      if (m.headWmm) {
        facewEl.hidden = false;
        facewEl.textContent = `${fmtMm(m.headWmm)} мм`;
      } else {
        facewEl.hidden = true;
      }
    }
    if (captionEl) {
      const pct = Math.round(m.face * 100);
      captionEl.textContent = `35×45 мм · сверху ${topLabel} · голова ${headLabel} (${pct}%) — норма Госуслуг`;
    }
  }

  function bindToggle(root) {
    const btn = root && root.querySelector("[data-guide-toggle]");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const hidden = root.classList.toggle("is-guide-off");
      btn.textContent = hidden ? "Показать размеры" : "Скрыть размеры";
      btn.setAttribute("aria-pressed", hidden ? "false" : "true");
    });
  }

  window.GosphotoPhotoGuide = { bind, bindToggle, metricsFrom };
})();
