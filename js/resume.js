/* Last result / pending pay — localStorage + cookie (Yandex Start new WebView). */
(function (global) {
  const LAST = "gosphoto_last_result_id";
  const LAST_PAID = "gosphoto_last_paid_result_id";
  const PENDING = "gosphoto_pay_pending";
  const PENDING_RESUME = "gosphoto_pay_resume_pending";
  const DISMISS = "gosphoto_resume_banner_dismissed";
  const COOKIE_LAST = "gosphoto_last";
  const COOKIE_PAY = "gosphoto_pay";
  const COOKIE_PAY_RESUME = "gosphoto_pay_resume";
  const COOKIE_MAX_AGE = 24 * 60 * 60;
  const ID_RE = /^[a-f0-9]{32}$/;

  function cookieGet(name) {
    try {
      const prefix = name + "=";
      const parts = document.cookie.split("; ");
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].indexOf(prefix) === 0) {
          return decodeURIComponent(parts[i].slice(prefix.length));
        }
      }
    } catch (_) {}
    return null;
  }

  function cookieSet(name, value) {
    try {
      document.cookie =
        name +
        "=" +
        encodeURIComponent(value) +
        "; Max-Age=" +
        COOKIE_MAX_AGE +
        "; Path=/; SameSite=Lax; Secure";
    } catch (_) {}
  }

  function cookieDel(name) {
    try {
      document.cookie = name + "=; Max-Age=0; Path=/; SameSite=Lax; Secure";
    } catch (_) {}
  }

  function lsGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function lsSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  }

  function lsDel(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {}
  }

  function valid(id) {
    return typeof id === "string" && ID_RE.test(id);
  }

  function pendingKey(product) {
    return product === "resume" ? PENDING_RESUME : PENDING;
  }

  function pendingCookie(product) {
    return product === "resume" ? COOKIE_PAY_RESUME : COOKIE_PAY;
  }

  function storedOrCookie(lsKey, cookieName) {
    const v = lsGet(lsKey);
    if (valid(v)) return v;
    const c = cookieGet(cookieName);
    return valid(c) ? c : null;
  }

  global.GosphotoResume = {
    ID_RE: ID_RE,
    valid: valid,
    setLast: function (id) {
      if (!valid(id)) return;
      lsSet(LAST, id);
      cookieSet(COOKIE_LAST, id);
    },
    getLast: function () {
      return storedOrCookie(LAST, COOKIE_LAST);
    },
    clearLast: function () {
      lsDel(LAST);
      cookieDel(COOKIE_LAST);
    },
    setLastPaid: function (id) {
      if (valid(id)) lsSet(LAST_PAID, id);
    },
    getLastPaid: function () {
      const v = lsGet(LAST_PAID);
      return valid(v) ? v : null;
    },
    clearLastPaid: function () {
      lsDel(LAST_PAID);
    },
    setPending: function (product, id) {
      if (!valid(id)) return;
      lsSet(pendingKey(product), id);
      cookieSet(pendingCookie(product), id);
      this.setLast(id);
    },
    getPending: function (product) {
      return storedOrCookie(pendingKey(product), pendingCookie(product));
    },
    clearPending: function (product) {
      lsDel(pendingKey(product));
      cookieDel(pendingCookie(product));
    },
    isPending: function (id, product) {
      return this.getPending(product) === id;
    },
    getProbeId: function () {
      return (
        this.getLastPaid() ||
        this.getLast() ||
        this.getPending("passport") ||
        this.getPending("resume")
      );
    },
    clearSeenPaid: function (id) {
      this.clearLast();
      this.clearLastPaid();
      this.clearPending("passport");
      if (!id || this.getPending("resume") === id) {
        this.clearPending("resume");
      }
      lsDel(DISMISS);
    },
    dismissBanner: function (id) {
      if (valid(id)) lsSet(DISMISS, id);
    },
    isBannerDismissed: function (id) {
      return lsGet(DISMISS) === id;
    },
  };
})(window);
