/* Last result / pending pay — survives Tochka + new tab (not sessionStorage). */
(function (global) {
  const LAST = "gosphoto_last_result_id";
  const LAST_PAID = "gosphoto_last_paid_result_id";
  const PENDING = "gosphoto_pay_pending";
  const PENDING_RESUME = "gosphoto_pay_resume_pending";
  const DISMISS = "gosphoto_resume_banner_dismissed";
  const ID_RE = /^[a-f0-9]{32}$/;

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

  global.GosphotoResume = {
    ID_RE: ID_RE,
    valid: valid,
    setLast: function (id) {
      if (valid(id)) lsSet(LAST, id);
    },
    getLast: function () {
      const v = lsGet(LAST);
      return valid(v) ? v : null;
    },
    clearLast: function () {
      lsDel(LAST);
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
      if (valid(id)) lsSet(pendingKey(product), id);
    },
    getPending: function (product) {
      const v = lsGet(pendingKey(product));
      return valid(v) ? v : null;
    },
    clearPending: function (product) {
      lsDel(pendingKey(product));
    },
    isPending: function (id, product) {
      return this.getPending(product) === id;
    },
    dismissBanner: function (id) {
      if (valid(id)) lsSet(DISMISS, id);
    },
    isBannerDismissed: function (id) {
      return lsGet(DISMISS) === id;
    },
  };
})(window);
