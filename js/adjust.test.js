const assert = require("assert");
const a = require("./adjust.js");

assert.strictEqual(a.normalize(1.2), 1.2);
assert.strictEqual(a.normalize(9), 1.35);
assert.strictEqual(a.isDirty(1), false);
assert.strictEqual(a.isDirty(1.2), true);
assert.strictEqual(a.isPairDirty(1, 1), false);
assert.strictEqual(a.isPairDirty(1, 1.2), true);

function fakeElement() {
  const listeners = {};
  return {
    value: "1",
    hidden: false,
    style: {},
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    dispatch(type) {
      listeners[type]();
    },
  };
}

async function testPendingEditSurvivesEarlierResponse() {
  const inputB = fakeElement();
  const inputC = fakeElement();
  const resetBtn = fakeElement();
  const digitalImg = fakeElement();
  const elements = {
    "[data-brightness]": inputB,
    "[data-contrast]": inputC,
    "[data-adjust-reset]": resetBtn,
  };
  const root = {
    hidden: true,
    querySelector(selector) {
      return elements[selector] || null;
    },
  };

  const timers = new Map();
  let nextTimer = 1;
  const requests = [];
  const originalFetch = global.fetch;
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let markApplied;
  const applied = new Promise((resolve) => {
    markApplied = resolve;
  });
  global.setTimeout = (callback) => {
    const id = nextTimer++;
    timers.set(id, callback);
    return id;
  };
  global.clearTimeout = (id) => timers.delete(id);
  global.fetch = (url, options) =>
    new Promise((resolve) => requests.push({ url, options, resolve }));

  try {
    a.mount({ root, resultId: "result-1", digitalImg, onApplied: markApplied });

    inputB.value = "1.2";
    inputB.dispatch("input");
    const firstTimer = timers.get(1);
    timers.delete(1);
    firstTimer();
    assert.strictEqual(requests.length, 1);

    inputB.value = "1.3";
    inputB.dispatch("input");
    requests[0].resolve({
      ok: true,
      json: async () => ({ ok: true, brightness: 1.2, contrast: 1 }),
    });
    await applied;

    const secondTimer = timers.get(2);
    timers.delete(2);
    secondTimer();
    assert.deepStrictEqual(JSON.parse(requests[1].options.body), {
      brightness: 1.3,
      contrast: 1,
    });
  } finally {
    global.fetch = originalFetch;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
}

function harness(extra) {
  const inputB = fakeElement();
  const inputC = fakeElement();
  const resetBtn = fakeElement();
  const digitalImg = Object.assign(fakeElement(), { src: "orig.jpg" });
  const elements = {
    "[data-brightness]": inputB,
    "[data-contrast]": inputC,
    "[data-adjust-reset]": resetBtn,
  };
  const root = {
    hidden: true,
    querySelector(selector) {
      return elements[selector] || null;
    },
  };
  const timers = new Map();
  let nextTimer = 1;
  const requests = [];
  const saved = {
    fetch: global.fetch,
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
  };
  global.setTimeout = (callback) => {
    const id = nextTimer++;
    timers.set(id, callback);
    return id;
  };
  global.clearTimeout = (id) => timers.delete(id);
  global.fetch = (url, options) =>
    new Promise((resolve) => requests.push({ url, options, resolve }));
  const events = { applied: 0, errors: 0 };
  const ctl = a.mount(
    Object.assign(
      {
        root,
        resultId: "result-1",
        digitalImg,
        onApplied: () => (events.applied += 1),
        onError: () => (events.errors += 1),
      },
      extra
    )
  );
  return {
    inputB,
    inputC,
    digitalImg,
    requests,
    events,
    ctl,
    // Fire the single pending debounce timer (like the real 250 ms elapsing).
    flushTimer() {
      const [id, cb] = [...timers.entries()][0];
      timers.delete(id);
      cb();
    },
    slide(el, v) {
      el.value = String(v);
      el.dispatch("input");
    },
    ok(i, body) {
      requests[i].resolve({ ok: true, json: async () => Object.assign({ ok: true }, body) });
    },
    tick: () => new Promise((r) => setImmediate(r)),
    restore() {
      global.fetch = saved.fetch;
      global.setTimeout = saved.setTimeout;
      global.clearTimeout = saved.clearTimeout;
    },
  };
}

async function testPostsAreSerializedAndLatestPairSentOnce() {
  const h = harness();
  try {
    h.slide(h.inputB, 1.2);
    h.flushTimer();
    assert.strictEqual(h.requests.length, 1);

    // Two more edits fire while #1 is in flight: nothing is sent yet.
    h.slide(h.inputB, 1.3);
    h.flushTimer();
    h.slide(h.inputB, 1.35);
    h.slide(h.inputC, 0.8);
    h.flushTimer();
    assert.strictEqual(h.requests.length, 1, "no concurrent POST");

    h.ok(0, { brightness: 1.2, contrast: 1 });
    await h.tick();
    assert.strictEqual(h.requests.length, 2, "one follow-up POST");
    assert.deepStrictEqual(JSON.parse(h.requests[1].options.body), {
      brightness: 1.35,
      contrast: 0.8,
    });

    h.ok(1, { brightness: 1.35, contrast: 0.8 });
    await h.tick();
    assert.strictEqual(h.requests.length, 2, "nothing further queued");
    assert.strictEqual(h.inputB.value, "1.35");
    assert.strictEqual(h.inputC.value, "0.8");
  } finally {
    h.restore();
  }
}

async function testNoFollowUpWhenSlidersReturnedToServerValue() {
  const h = harness();
  try {
    h.slide(h.inputB, 1.2);
    h.flushTimer();
    h.slide(h.inputB, 1.3);
    h.flushTimer();
    h.slide(h.inputB, 1.2); // back to what request #1 will confirm
    h.flushTimer();
    h.ok(0, { brightness: 1.2, contrast: 1 });
    await h.tick();
    assert.strictEqual(h.requests.length, 1);
  } finally {
    h.restore();
  }
}

async function testErrorRevertsToServerBaseline() {
  const h = harness();
  try {
    h.slide(h.inputB, 1.2);
    h.flushTimer();
    h.ok(0, { brightness: 1.2, contrast: 1 });
    await h.tick();
    h.slide(h.inputB, 1.35);
    h.flushTimer();
    h.requests[1].resolve({ ok: false, json: async () => ({ ok: false }) });
    await h.tick();
    assert.strictEqual(h.inputB.value, "1.2");
    assert.strictEqual(h.events.errors, 1);
    // inflight is released: next edit sends again
    h.slide(h.inputB, 1.1);
    h.flushTimer();
    assert.strictEqual(h.requests.length, 3);
  } finally {
    h.restore();
  }
}

async function testFilterKeptUntilNewImageLoaded() {
  const loads = [];
  const h = harness({
    printImg: Object.assign(fakeElement(), { src: "print-orig.jpg" }),
    preload: (url, cb) => loads.push({ url, cb }),
  });
  try {
    h.slide(h.inputB, 1.2);
    h.flushTimer();
    h.ok(0, {
      brightness: 1.2,
      contrast: 1,
      digital_url: "/d.jpg",
      print_url: "/p.jpg?x=1",
    });
    await h.tick();
    assert.strictEqual(loads.length, 2, "both images preloaded");
    assert.ok(/^\/d\.jpg\?bv=/.test(loads[0].url), loads[0].url);
    assert.ok(/^\/p\.jpg\?x=1&bv=/.test(loads[1].url), loads[1].url);
    // Not loaded yet: old src, optimistic filter still on, not applied.
    assert.strictEqual(h.digitalImg.src, "orig.jpg");
    assert.strictEqual(h.digitalImg.style.filter, "brightness(1.2)");
    assert.strictEqual(h.events.applied, 0);

    // Another POST must wait for the swap as well.
    h.slide(h.inputB, 1.3);
    h.flushTimer();
    assert.strictEqual(h.requests.length, 1);

    loads[0].cb(true);
    assert.strictEqual(h.digitalImg.src, "orig.jpg", "waits for both images");
    loads[1].cb(true);
    assert.strictEqual(h.digitalImg.src, loads[0].url);
    assert.strictEqual(h.events.applied, 1);
    // Baseline moved to 1.2; user is still at 1.3 -> ratio 1.3/1.2 and follow-up POST.
    assert.strictEqual(h.digitalImg.style.filter, "brightness(" + 1.3 / 1.2 + ")");
    assert.strictEqual(h.requests.length, 2);
  } finally {
    h.restore();
  }
}

async function testPreloadFailureKeepsOldImageAndReports() {
  const h = harness({ preload: (url, cb) => cb(false) });
  try {
    h.slide(h.inputB, 1.2);
    h.flushTimer();
    h.ok(0, { brightness: 1.2, contrast: 1, digital_url: "/d.jpg" });
    await h.tick();
    assert.strictEqual(h.digitalImg.src, "orig.jpg");
    assert.strictEqual(h.events.errors, 1);
    assert.strictEqual(h.events.applied, 0);
    assert.strictEqual(h.inputB.value, "1");
  } finally {
    h.restore();
  }
}

function testBustUrl() {
  assert.strictEqual(a.bustUrl("/d.jpg", "t1"), "/d.jpg?bv=t1");
  assert.strictEqual(a.bustUrl("/d.jpg?v=full", "t1"), "/d.jpg?v=full&bv=t1");
  assert.strictEqual(a.bustUrl("/d.jpg?bv=old", "t2"), "/d.jpg?bv=t2");
  assert.strictEqual(a.bustUrl("", "t"), "");
}

testBustUrl();
testPendingEditSurvivesEarlierResponse()
  .then(testPostsAreSerializedAndLatestPairSentOnce)
  .then(testNoFollowUpWhenSlidersReturnedToServerValue)
  .then(testErrorRevertsToServerBaseline)
  .then(testFilterKeptUntilNewImageLoaded)
  .then(testPreloadFailureKeepsOldImageAndReports)
  .then(() => console.log("ok"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
