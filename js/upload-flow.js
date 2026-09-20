(function () {
  "use strict";
  const TRACK_CONVERSIONS = true;
  const METRIKA_ID = 111303098;
const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
]);
const PROCESS_API = "/api/process/stream";
const DOC_TYPE_KEY = "gosphoto_doc_type";
const DOC_TYPES = new Set(["passport_rf", "zagran"]);

function getStoredDocType() {
  try {
    const v = sessionStorage.getItem(DOC_TYPE_KEY);
    return DOC_TYPES.has(v) ? v : null;
  } catch (_) {
    return null;
  }
}

function setStoredDocType(docType) {
  if (!DOC_TYPES.has(docType)) return;
  try {
    sessionStorage.setItem(DOC_TYPE_KEY, docType);
  } catch (_) {}
}


const FIXED_DOC_TYPE = (function () {
  const fromBody = document.body && document.body.getAttribute("data-doc-type");
  const fromWindow = window.GOSPHOTO_DOC_TYPE;
  const raw = fromBody || fromWindow || "";
  const alias = raw === "passport" ? "passport_rf" : raw;
  return DOC_TYPES.has(alias) ? alias : null;
})();
if (FIXED_DOC_TYPE) setStoredDocType(FIXED_DOC_TYPE);


(function applyDocFromQuery() {
  try {
    const raw = new URLSearchParams(location.search).get("doc");
    if (!raw) return;
    const alias = raw === "passport" ? "passport_rf" : raw;
    if (DOC_TYPES.has(alias)) setStoredDocType(alias);
  } catch (_) {}
})();

const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".nav");
toggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", String(open));
});

const uploadBtn = document.getElementById("upload-btn");
const chooserDialog = document.getElementById("chooser-dialog");
const docTypeDialog = document.getElementById("doc-type-dialog");
const docTypeClose = document.getElementById("doc-type-close");
const docTypePassport = document.getElementById("doc-type-passport");
const docTypeZagran = document.getElementById("doc-type-zagran");
const cameraDialog = document.getElementById("camera-dialog");
const updateDialog = document.getElementById("update-dialog");
const resultDialog = document.getElementById("result-dialog");
const resultStatus = document.getElementById("result-status");
const resultStage = document.getElementById("result-stage");
const resultImage = document.getElementById("result-image");
const resultProgress = document.getElementById("result-progress");
const resultProgressBar = document.getElementById("result-progress-bar");
const resultProgressStep = document.getElementById("result-progress-step");
const resultProgressList = document.getElementById("result-progress-list");
const resultError = document.getElementById("result-error");
const resultClose = document.getElementById("result-close");
let resultPreviewUrl = null;
let pendingDocFile = null;
let pendingDocSource = "unknown";

function revokeResultPreview() {
  if (resultPreviewUrl) {
    URL.revokeObjectURL(resultPreviewUrl);
    resultPreviewUrl = null;
  }
}

function phaseFromPct(pct) {
  if (pct < 30) return 0;
  if (pct < 55) return 1;
  if (pct < 80) return 2;
  return 3;
}

function syncProgressList(activeIndex) {
  if (!resultProgressList) return;
  resultProgressList.querySelectorAll("li").forEach((li) => {
    const i = Number(li.getAttribute("data-step"));
    li.classList.toggle("is-done", i < activeIndex);
    li.classList.toggle("is-current", i === activeIndex);
  });
}

function applyServerProgress(text, pct) {
  const label = text || "Обрабатываем снимок…";
  const p = Math.max(1, Math.min(99, Number(pct) || 1));
  if (resultProgressStep) resultProgressStep.textContent = label;
  if (resultStatus) resultStatus.textContent = label;
  if (resultProgressBar) {
    resultProgressBar.style.width = `${p}%`;
    resultProgressBar.classList.add("is-waiting");
  }
  syncProgressList(phaseFromPct(p));
}

function startProgress() {
  stopProgress(false);
  if (resultStage) resultStage.classList.add("is-processing");
  if (resultProgress) {
    resultProgress.hidden = false;
    resultProgress.classList.add("is-active");
  }
  applyServerProgress("Проверяем лицо и качество снимка…", 5);
}

function stopProgress(success) {
  if (resultProgressBar) {
    resultProgressBar.classList.remove("is-waiting");
    if (success) resultProgressBar.style.width = "100%";
  }
  if (resultStage) resultStage.classList.remove("is-processing");
  if (resultProgress) {
    resultProgress.hidden = true;
    resultProgress.classList.remove("is-active");
  }
}

async function readProcessSse(response) {
  if (!response.body || !response.body.getReader) {
    throw new Error("Браузер не поддерживает поток ответа.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalEvent = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const lines = raw.split("\n");
      let eventName = "message";
      const dataLines = [];
      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }
      if (!dataLines.length) continue;
      let data = {};
      try {
        data = JSON.parse(dataLines.join("\n"));
      } catch (_) {
        continue;
      }
      if (eventName === "progress") {
        applyServerProgress(data.text, data.pct);
      } else if (eventName === "done" || eventName === "error") {
        finalEvent = { event: eventName, data };
      }
    }
  }
  return finalEvent;
}
const chooserClose = document.getElementById("chooser-close");
const cameraClose = document.getElementById("camera-close");
const cameraBack = document.getElementById("camera-back");
const cameraShutter = document.getElementById("camera-shutter");
const cameraVideo = document.getElementById("camera-video");
const cameraCanvas = document.getElementById("camera-canvas");
const cameraError = document.getElementById("camera-error");
const slotChoose = document.getElementById("slot-choose");
const slotCamera = document.getElementById("slot-camera");
const inputChoose = document.getElementById("input-choose");
const previewChoose = document.getElementById("preview-choose");
const previewCamera = document.getElementById("preview-camera");
const chooserError = document.getElementById("chooser-error");
const chooserConsent = document.getElementById("chooser-consent");
const chooserConsentBox = document.querySelector(".chooser-consent");

function clearConsentError() {
  setError(chooserError, "");
  chooserConsentBox?.classList.remove("is-error");
}

function requireConsent() {
  if (chooserConsent && !chooserConsent.checked) {
    setError(chooserError, "Необходимо согласие на обработку персональных данных.");
    chooserConsentBox?.classList.add("is-error");
    chooserConsentBox?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    chooserConsent.focus({ preventScroll: true });
    reachGoal("photo_consent_missing");
    return false;
  }
  clearConsentError();
  return true;
}
const endpoint = "https://formspree.io/f/mvkpprkk";
const SEND_FORMSPREE = false; // временно отключено
let cameraStream = null;

function showDialog(el) {
  if (typeof el.showModal === "function") {
    el.showModal();
  } else {
    el.setAttribute("open", "");
  }
}

function closeDialog(el) {
  if (typeof el.close === "function") {
    el.close();
  } else {
    el.removeAttribute("open");
  }
}

function reachGoal(name, params, done) {
  if (!TRACK_CONVERSIONS || !name) {
    if (typeof done === "function") done();
    return;
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (typeof done === "function") done();
  };
  // Fallback: даже если callback Metrika не вызовется — не зависаем.
  const timer =
    typeof done === "function" ? window.setTimeout(finish, 400) : null;
  try {
    if (typeof ym === "function") {
      if (typeof done === "function") {
        ym(METRIKA_ID, "reachGoal", name, params || {}, finish);
      } else if (params) {
        ym(METRIKA_ID, "reachGoal", name, params);
      } else {
        ym(METRIKA_ID, "reachGoal", name);
      }
      return;
    }
  } catch (_) {}
  if (timer) window.clearTimeout(timer);
  finish();
}

function trackFormspreeClick() {
  if (!SEND_FORMSPREE || !TRACK_CONVERSIONS) return;
  const clickData = new FormData();
  const params = new URLSearchParams(location.search);
  clickData.append("_subject", "Госфото: клик «Загрузить селфи»");
  clickData.append("event", "photo_upload_click");
  clickData.append("page_url", location.href);
  clickData.append("referrer", document.referrer || "direct");
  for (const [key, value] of params) {
    if (key.startsWith("utm_")) clickData.append(key, value);
  }
  fetch(endpoint, {
    method: "POST",
    body: clickData,
    headers: { Accept: "application/json" },
  }).catch(() => {});
}

// Делегированный трекинг всех data-metrika-goal (кнопки и ссылки).
document.addEventListener(
  "click",
  (event) => {
    const target = event.target.closest("[data-metrika-goal]");
    if (!target) return;
    const goal = target.getAttribute("data-metrika-goal");
    const param = target.getAttribute("data-metrika-param");
    reachGoal(goal, param ? { item: param } : undefined);
  },
  true
);

function setError(el, message) {
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function setPreview(previewEl, slotEl, file) {
  const url = URL.createObjectURL(file);
  previewEl.style.backgroundImage = `url("${url}")`;
  previewEl.hidden = false;
  slotEl.classList.add("has-preview");
}

function validateImage(file) {
  if (!file) return "Файл не выбран.";
  const typeOk =
    ALLOWED_TYPES.has(file.type) ||
    /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "");
  if (!typeOk) return "Нужен файл JPG, PNG, WebP или HEIC.";
  if (file.size > MAX_BYTES) return "Файл больше 20 МБ.";
  return null;
}

function finishWithFile(file, { goal, source, previewEl, slotEl, errorEl }) {
  if (!requireConsent()) return;
  const error = validateImage(file);
  if (error) {
    setError(errorEl, error);
    const reason =
      !file
        ? "empty"
        : file.size > MAX_BYTES
          ? "too_large"
          : "bad_type";
    reachGoal("photo_file_reject", { reason, source: source || "unknown" });
    return;
  }
  setError(errorEl, "");
  setPreview(previewEl, slotEl, file);
  if (goal) reachGoal(goal);
  ensureDocTypeThenProcess(file, source || "unknown");
}

function ensureDocTypeThenProcess(file, source) {
  const existing = FIXED_DOC_TYPE || getStoredDocType();
  if (existing) {
    processPhoto(file, source, existing);
    return;
  }
  pendingDocFile = file;
  pendingDocSource = source || "unknown";
  closeDialog(chooserDialog);
  closeDialog(cameraDialog);
  showDialog(docTypeDialog);
}

function pickDocType(docType) {
  setStoredDocType(docType);
  closeDialog(docTypeDialog);
  const file = pendingDocFile;
  const source = pendingDocSource;
  pendingDocFile = null;
  pendingDocSource = "unknown";
  if (file) processPhoto(file, source, docType);
}

function failReasonFromProcess(err, res, data) {
  if (err && err.name === "TypeError") return "network";
  if (res && res.status >= 500) return "server_" + res.status;
  if (res && res.status === 413) return "too_large";
  if (res && res.status === 415) return "bad_type";
  if (res && res.status === 422) return "validation";
  if (data && data.ok === false) {
    const code =
      data.code ||
      (data.detail && data.detail.code) ||
      data.gate ||
      "";
    if (code) return String(code).slice(0, 64);
    return "gate_reject";
  }
  if (res && res.status === 400) return "bad_request";
  if (res && !res.ok) return "http_" + res.status;
  return "unknown";
}

async function processPhoto(file, source, docType) {
  const resolvedType = DOC_TYPES.has(docType)
    ? docType
    : getStoredDocType() || "passport_rf";
  stopCamera();
  closeDialog(cameraDialog);
  closeDialog(chooserDialog);
  closeDialog(docTypeDialog);
  setError(resultError, "");

  revokeResultPreview();
  resultPreviewUrl = URL.createObjectURL(file);
  if (resultImage) {
    resultImage.src = resultPreviewUrl;
    resultImage.alt = "Загруженное фото";
    resultImage.classList.remove("is-passport");
  }
  if (resultStage) resultStage.hidden = false;
  startProgress();
  showDialog(resultDialog);
  reachGoal("photo_process_start", {
    source: source || "unknown",
    doc_type: resolvedType,
  });

  const body = new FormData();
  body.append("file", file, file.name || "selfie.jpg");
  body.append("doc_type", resolvedType);
  let res = null;
  let data = {};
  try {
    res = await fetch(PROCESS_API, {
      method: "POST",
      body,
      headers: { Accept: "text/event-stream" },
    });
    if (!res.ok) {
      data = await res.json().catch(() => ({}));
      const msg =
        (data.detail && (data.detail.message || data.detail)) ||
        "Ошибка сервера. Попробуйте другое фото.";
      const err = new Error(
        typeof msg === "string" ? msg : JSON.stringify(msg)
      );
      err._reason = failReasonFromProcess(err, res, data);
      throw err;
    }
    const finalEvent = await readProcessSse(res);
    if (!finalEvent) {
      const err = new Error("Сервер закрыл поток без результата.");
      err._reason = "no_sse_final";
      throw err;
    }
    data = finalEvent.data || {};
    if (finalEvent.event === "error" || !data.ok) {
      const err = new Error(data.message || "Фото не прошло проверку.");
      err._reason = failReasonFromProcess(err, res, data);
      throw err;
    }
    if (!data.result_id) {
      const err = new Error("Сервер не вернул ссылку на результат.");
      err._reason = "no_result_id";
      throw err;
    }
    stopProgress(true);
    const resultId = data.result_id;
    if (window.GosphotoResume) GosphotoResume.setLast(resultId);
    const t = Date.now();
    const doneType =
      (data.doc_type && DOC_TYPES.has(data.doc_type)
        ? data.doc_type
        : null) || resolvedType;
    const processGoal =
      doneType === "zagran" ? "process_zagran" : "process_passport_rf";
    // Ждём отправку цели: иначе location.assign часто убивает hit.
    reachGoal(
      "photo_processed",
      {
        result_id: resultId,
        source: source || "unknown",
        doc_type: doneType,
        compliance: data.compliance?.pass ? "pass" : "soft",
        print_sheet: data.print_sheet ? "yes" : "no",
      },
      () => {
        reachGoal(processGoal, { result_id: resultId }, () =>
          location.assign(`/result/${resultId}?t=${t}`)
        );
      }
    );
  } catch (err) {
    stopProgress(false);
    if (resultStatus) resultStatus.textContent = "Не удалось обработать";
    setError(
      resultError,
      (err && err.message) || "Попробуйте другое фото или позже."
    );
    reachGoal("photo_process_fail", {
      reason: (err && err._reason) || failReasonFromProcess(err, res, data),
      source: source || "unknown",
      http: res ? String(res.status) : "0",
    });
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  if (cameraVideo) cameraVideo.srcObject = null;
}

async function openFrontCamera() {
  setError(cameraError, "");
  if (!navigator.mediaDevices?.getUserMedia) {
    setError(cameraError, "Камера недоступна в этом браузере.");
    showDialog(cameraDialog);
    reachGoal("camera_denied", { reason: "unsupported" });
    return;
  }
  closeDialog(chooserDialog);
  showDialog(cameraDialog);
  cameraShutter.disabled = true;
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    cameraVideo.srcObject = cameraStream;
    await cameraVideo.play();
    cameraShutter.disabled = false;
  } catch (err) {
    cameraShutter.disabled = true;
    const denied =
      err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
    setError(
      cameraError,
      denied
        ? "Разрешите доступ к камере в браузере."
        : "Не удалось открыть фронтальную камеру."
    );
    reachGoal("camera_denied", {
      reason: denied ? "permission" : (err && err.name) || "error",
    });
  }
}

function captureSelfie() {
  if (!cameraVideo?.videoWidth) {
    setError(cameraError, "Камера ещё не готова.");
    return;
  }
  const width = cameraVideo.videoWidth;
  const height = cameraVideo.videoHeight;
  cameraCanvas.width = width;
  cameraCanvas.height = height;
  const ctx = cameraCanvas.getContext("2d");
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(cameraVideo, 0, 0, width, height);
  cameraCanvas.toBlob(
    (blob) => {
      if (!blob) {
        setError(cameraError, "Не удалось сделать снимок.");
        return;
      }
      const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
      finishWithFile(file, {
        goal: null,
        source: "camera",
        previewEl: previewCamera,
        slotEl: slotCamera,
        errorEl: cameraError,
      });
    },
    "image/jpeg",
    0.92
  );
}

function leaveCamera() {
  stopCamera();
  closeDialog(cameraDialog);
  showDialog(chooserDialog);
}

chooserConsent?.addEventListener("change", () => {
  if (chooserConsent.checked) clearConsentError();
});

function openUploadChooser() {
  trackFormspreeClick();
  clearConsentError();
  showDialog(chooserDialog);
}
uploadBtn?.addEventListener("click", openUploadChooser);
document.querySelectorAll("[data-upload-open]").forEach((el) => {
  el.addEventListener("click", (event) => {
    event.preventDefault();
    openUploadChooser();
  });
});

resultClose?.addEventListener("click", () => {
  stopProgress(false);
  closeDialog(resultDialog);
});
resultDialog?.addEventListener("click", (event) => {
  if (event.target === resultDialog) {
    reachGoal("click_result_close", { item: "backdrop" });
    stopProgress(false);
    closeDialog(resultDialog);
  }
});
resultDialog?.addEventListener("close", () => {
  stopProgress(false);
});

chooserClose?.addEventListener("click", () => {
  closeDialog(chooserDialog);
});
docTypeClose?.addEventListener("click", () => {
  pendingDocFile = null;
  closeDialog(docTypeDialog);
});
docTypePassport?.addEventListener("click", () => pickDocType("passport_rf"));
docTypeZagran?.addEventListener("click", () => pickDocType("zagran"));
cameraClose?.addEventListener("click", () => {
  stopCamera();
  closeDialog(cameraDialog);
});
cameraBack?.addEventListener("click", leaveCamera);
cameraShutter?.addEventListener("click", captureSelfie);

document.querySelectorAll(".doc-card[data-metrika-param]").forEach((card) => {
  card.addEventListener("click", () => {
    const param = card.getAttribute("data-metrika-param");
    if (DOC_TYPES.has(param)) setStoredDocType(param);
  });
});

chooserDialog?.addEventListener("click", (event) => {
  if (event.target === chooserDialog) {
    reachGoal("click_chooser_close", { item: "backdrop" });
    closeDialog(chooserDialog);
  }
});
docTypeDialog?.addEventListener("click", (event) => {
  if (event.target === docTypeDialog) {
    reachGoal("click_doc_type_close", { item: "backdrop" });
    pendingDocFile = null;
    closeDialog(docTypeDialog);
  }
});
cameraDialog?.addEventListener("click", (event) => {
  if (event.target === cameraDialog) {
    reachGoal("click_camera_close", { item: "backdrop" });
    stopCamera();
    closeDialog(cameraDialog);
  }
});
cameraDialog?.addEventListener("close", stopCamera);

slotChoose?.addEventListener("click", () => {
  if (!requireConsent()) return;
  inputChoose?.click();
});
slotCamera?.addEventListener("click", () => {
  if (!requireConsent()) return;
  openFrontCamera();
});

inputChoose?.addEventListener("change", () => {
  const file = inputChoose.files?.[0];
  inputChoose.value = "";
  finishWithFile(file, {
    goal: "photo_choose",
    source: "gallery",
    previewEl: previewChoose,
    slotEl: slotChoose,
    errorEl: chooserError,
  });
});

(function mountResumeBanner() {
  const resume = window.GosphotoResume;
  const banner = document.getElementById("resume-banner");
  const textEl = document.getElementById("resume-banner-text");
  const linkEl = document.getElementById("resume-banner-link");
  const dismissEl = document.getElementById("resume-banner-dismiss");
  if (!resume || !banner || !textEl || !linkEl) return;

  function hide() {
    banner.hidden = true;
  }

  function showUnpaid(id) {
    if (resume.isBannerDismissed(id)) {
      hide();
      return;
    }
    textEl.textContent =
      "У вас есть незаконченное фото — можно вернуться к нему.";
    linkEl.href = "/result/" + id;
    linkEl.textContent = "Вернуться к фото";
    banner.hidden = false;
  }

  dismissEl?.addEventListener("click", () => {
    const href = (linkEl.getAttribute("href") || "").replace(
      /^\/result\//,
      ""
    );
    if (resume.valid(href)) resume.dismissBanner(href);
    hide();
  });

  const probeId = resume.getProbeId();
  if (!probeId) return;

  fetch("/api/result/" + probeId + "/payment-status")
    .then((res) => {
      if (res.status === 404) {
        resume.clearSeenPaid(probeId);
        hide();
        return null;
      }
      if (!res.ok) return null;
      return res.json();
    })
    .then((data) => {
      if (!data || !data.ok || !data.result_id) return;
      if (data.paid) {
        location.assign("/result/" + data.result_id + "?paid=1");
        return;
      }
      showUnpaid(data.result_id);
    })
    .catch(hide);
})();
})();
