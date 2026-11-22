const assert = require("assert");
const b = require("./brightness.js");
assert.strictEqual(b.normalize(1.25), 1.25);
assert.strictEqual(b.normalize(9), 1.35);
assert.strictEqual(b.isDirty(1), false);
assert.strictEqual(b.isDirty(1.2), true);
console.log("ok");