import assert from "node:assert/strict";
import { BadodoRuntime } from "./runtime/runtime";

const state: Record<string, unknown> = {};
const runtime = new BadodoRuntime();
runtime.registerNode("state", state);
runtime.run(`
state.result = ok(42)
state.value = unwrap(state.result)
state.present = is_ok(state.result)
state.optional = some("ready")
state.empty = none()
`);

assert.deepEqual(state.result, { ok: true, value: 42 });
assert.equal(state.value, 42);
assert.equal(state.present, true);
assert.deepEqual(state.optional, { kind: "some", value: "ready" });
assert.deepEqual(state.empty, { kind: "none" });
console.log("BDS standard library conformance: 5 passed, 0 failed");
