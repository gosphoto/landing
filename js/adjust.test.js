const assert = require("assert");
const a = require("./adjust.js");

assert.strictEqual(a.normalize(1.2), 1.2);
assert.strictEqual(a.normalize(9), 1.35);
assert.strictEqual(a.isDirty(1), false);
assert.strictEqual(a.isDirty(1.2), true);
assert.strictEqual(a.isPairDirty(1, 1), false);
assert.strictEqual(a.isPairDirty(1, 1.2), true);
console.log("ok");