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

testPendingEditSurvivesEarlierResponse()
  .then(() => console.log("ok"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });