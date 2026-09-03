import assert from "node:assert/strict";
import { compileRuntime, RUNTIME_PROGRAM_VERSION } from "./runtime/program";
import { BadodoRuntime } from "./runtime/runtime";
import { RuntimeExecutionError } from "./runtime/errors";

const counts = {
  basic: { passed: 0, failed: 0 },
  limits: { passed: 0, failed: 0 },
  escape: { passed: 0, failed: 0 },
  hostFailure: { passed: 0, failed: 0 },
};

function test(category: keyof typeof counts, name: string, action: () => void): void {
  try {
    action();
    counts[category].passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    counts[category].failed += 1;
    console.log(`  ✗ ${name} — ${error instanceof Error ? error.message : String(error)}`);
  }
}

function expectRuntime(code: RuntimeExecutionError["code"], action: () => void): void {
  assert.throws(action, (error: unknown) => error instanceof RuntimeExecutionError && error.code === code);
}

console.log("Bounded BadodoScript runtime conformance\n");

test("basic", "RuntimeProgram is versioned canonical data", () => {
  const program = compileRuntime("state.value = 1", "basic.bds");
  assert.equal(program.kind, "RuntimeProgram");
  assert.equal(program.version, RUNTIME_PROGRAM_VERSION);
  assert.equal(program.ast.kind, "Program");
  assert.equal("code" in program, false);
});

test("basic", "assignment, repeat, and function execution", () => {
  const state: Record<string, unknown> = { value: 0 };
  const runtime = new BadodoRuntime();
  runtime.registerNode("state", state);
  runtime.run(`
func add(a, b):
    return a + b

total = add(2, 3)
repeat 2:
    state.value = state.value + 1
state.value = state.value + total
`);
  assert.equal(state.value, 7);
});

test("basic", "for-in and array indexing stay data-only", () => {
  const state: Record<string, unknown> = { sum: 0 };
  const runtime = new BadodoRuntime();
  runtime.registerNode("state", state);
  runtime.run(`
items = [1, 2, 3]
sum = 0
for item in items:
    state.sum = state.sum + item
state.second = items[1]
`);
  assert.equal(state.sum, 6);
  assert.equal(state.second, 2);
});

test("basic", "event handler executes through the host boundary", () => {
  const state: Record<string, unknown> = { value: 0 };
  const button: Record<string, unknown> = {};
  const runtime = new BadodoRuntime();
  runtime.registerNodes({ state, button });
  runtime.run(`
when button.click:
    state.value = 9
`);
  runtime.emit(button, "click");
  assert.equal(state.value, 9);
});

test("basic", "bind, watch, and every-frame handlers retain existing semantics", () => {
  const state: Record<string, unknown> = { value: 0, alarm: 0, frames: 0 };
  const sensor: Record<string, unknown> = { temperature: 70 };
  const rotor: Record<string, unknown> = { value: 0 };
  const runtime = new BadodoRuntime();
  runtime.registerNodes({ state, sensor, rotor });
  runtime.run(`
temperature = sensor.temperature
bind temperature -> state.value
watch sensor.temperature:
    if value > 80:
        state.alarm = 1
every frame:
    state.frames = state.frames + 1
`);
  runtime.tick(0.5);
  sensor.temperature = 85;
  runtime.tick(0.5);
  assert.equal(state.value, 70);
  assert.equal(state.alarm, 1);
  assert.equal(state.frames, 2);
});

test("basic", "animate remains host-owned and bounded", () => {
  const node: Record<string, unknown> = { y: 0 };
  const runtime = new BadodoRuntime();
  runtime.registerNode("node", node);
  runtime.run("animate node.y to 2 in 1");
  runtime.tick(0.5);
  assert.equal(node.y, 1);
  runtime.tick(0.5);
  assert.equal(node.y, 2);
});

test("limits", "maximum execution steps stop excessive statements", () => {
  const runtime = new BadodoRuntime({ maxSteps: 8 });
  expectRuntime("RUNTIME_STEP_LIMIT", () => runtime.run("a = 1\nb = 2\nc = 3\nd = 4\ne = 5"));
});

test("limits", "maximum loop iterations stop large repeat loops", () => {
  const runtime = new BadodoRuntime({ maxLoopIterations: 3 });
  expectRuntime("RUNTIME_LOOP_LIMIT", () => runtime.run("repeat 100:\n    value = 1"));
});

test("limits", "maximum call depth stops recursive functions", () => {
  const runtime = new BadodoRuntime({ maxCallDepth: 3 });
  expectRuntime("RUNTIME_CALL_DEPTH_LIMIT", () => runtime.run("func recurse():\n    recurse()\nrecurse()"));
});

for (const name of ["globalThis", "process", "require", "Function"]) {
  test("escape", `${name} identifier is blocked`, () => {
    expectRuntime("RUNTIME_UNSUPPORTED_OPERATION", () => new BadodoRuntime().run(`${name}.value`));
  });
}

test("escape", "constructor and prototype member traversal are blocked", () => {
  expectRuntime("RUNTIME_UNSUPPORTED_OPERATION", () => new BadodoRuntime().run("state.constructor"));
  expectRuntime("RUNTIME_UNSUPPORTED_OPERATION", () => new BadodoRuntime().run("state.prototype"));
});

test("hostFailure", "node method failures become typed host failures", () => {
  const node = { fail(): void { throw new Error("host boom"); } };
  const runtime = new BadodoRuntime();
  runtime.registerNode("node", node);
  expectRuntime("RUNTIME_HOST_FAILURE", () => runtime.run("node.fail()"));
});

test("hostFailure", "node getter failures become typed host failures", () => {
  const node: Record<string, unknown> = {};
  Object.defineProperty(node, "value", { get() { throw new Error("getter boom"); } });
  const runtime = new BadodoRuntime();
  runtime.registerNode("node", node);
  expectRuntime("RUNTIME_HOST_FAILURE", () => runtime.run("result = node.value"));
});

for (const [category, result] of Object.entries(counts)) {
  console.log(`${category}: ${result.passed} passed, ${result.failed} failed`);
}
const failed = Object.values(counts).reduce((sum, result) => sum + result.failed, 0);
process.exit(failed > 0 ? 1 : 0);
