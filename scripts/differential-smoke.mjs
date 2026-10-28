// Phase A differential test: the bounded structured executor (`bds run`,
// BadodoRuntime) and the generated TypeScript must produce the same
// observable behaviour for the same BDS source.
//
// Observable behaviour = every host call in order (node method calls,
// `out.record(...)` probes, property writes on the final node state) plus
// whether loading / triggering threw. Host APIs are controlled stubs on both
// sides, so host differences are not reported as language differences.
//
// Only syntax both paths already support is used: assignment, if/else,
// repeat, for-in, func/return, when, every frame, arithmetic/comparison,
// lists. No `and`/`or`/`elif`/interpolation (out of scope for Phase A).
import assert from "node:assert/strict";
import ts from "typescript";
import { compile, BadodoRuntime } from "../dist/index.js";

/** @typedef {{ kind: "emit", node: string, event: string } | { kind: "tick", dt: number }} Trigger */

/**
 * @type {Array<{ name: string, source: string, nodes?: string[], triggers?: Trigger[],
 *   knownDivergence?: string }>}
 */
const cases = [
  {
    name: "top-level reassignment",
    source: `
speed = 10
speed = 20
out.record(speed)
`,
  },
  {
    name: "nested if assigns outer variable",
    source: `
x = 1
if x > 0:
    x = 2
out.record(x)
`,
  },
  {
    name: "else branch assigns outer variable",
    source: `
x = 1
if x > 5:
    x = 2
else:
    x = 3
out.record(x)
`,
  },
  {
    name: "function local reassignment and return value",
    source: `
func f(v):
    y = v
    y = y * 2
    return y
out.record(f(4))
`,
  },
  {
    name: "function boundary keeps top-level value",
    source: `
x = 1
func f():
    x = 2
    return x
out.record(f())
out.record(x)
`,
  },
  {
    name: "parameter reassignment",
    source: `
func inc(a):
    a = a + 1
    return a
out.record(inc(1))
`,
  },
  {
    name: "nested block inside function assigns function local",
    source: `
func pick(v):
    result = 0
    if v > 10:
        result = 1
    return result
out.record(pick(3))
out.record(pick(30))
`,
  },
  {
    name: "for loop accumulates outer variable",
    source: `
total = 0
for item in [1, 2, 3]:
    total = total + item
out.record(total)
`,
  },
  {
    name: "for item reassignment",
    source: `
for item in [1, 2]:
    item = item + 10
    out.record(item)
`,
  },
  {
    name: "repeat accumulates outer variable",
    source: `
n = 0
repeat 3:
    n = n + 2
out.record(n)
`,
  },
  {
    name: "repeat body declares per iteration",
    source: `
repeat 2:
    k = 1
    k = k + 1
    out.record(k)
`,
  },
  {
    name: "sibling blocks declare independent variables",
    source: `
if true:
    level = 1
    out.record(level)
if true:
    level = 2
    out.record(level)
`,
  },
  {
    name: "block variable is not visible after the block",
    source: `
if true:
    level = 1
level = 3
out.record(level)
`,
  },
  {
    name: "when callback updates top-level counter",
    source: `
count = 0
when button.click:
    count = count + 1
    out.record(count)
`,
    nodes: ["button"],
    triggers: [{ kind: "emit", node: "button", event: "click" }, { kind: "emit", node: "button", event: "click" }],
  },
  {
    name: "when with nested if/repeat updates counter (no copies)",
    source: `
count = 0
when button.click:
    if count < 10:
        count = count + 1
    repeat 2:
        count = count + 10
    out.record(count)
`,
    nodes: ["button"],
    triggers: [{ kind: "emit", node: "button", event: "click" }, { kind: "emit", node: "button", event: "click" }, { kind: "emit", node: "button", event: "click" }],
  },
  {
    name: "two handlers share one top-level counter",
    source: `
count = 0
when button.click:
    count = count + 1
    out.record(count)
when alarm.click:
    count = count + 100
    out.record(count)
`,
    nodes: ["button", "alarm"],
    triggers: [{ kind: "emit", node: "button", event: "click" }, { kind: "emit", node: "alarm", event: "click" }, { kind: "emit", node: "button", event: "click" }],
  },
  {
    name: "function reads top-level variable without assigning",
    source: `
x = 5
func f():
    return x + 1
out.record(f())
`,
  },
  {
    name: "function assigns same name as top-level without reading it",
    source: `
x = 1
func f():
    x = 2
f()
out.record(x)
`,
  },
  {
    name: "every frame accumulates with time",
    source: `
acc = 0
every frame:
    acc = acc + time
    out.record(acc)
`,
    triggers: [{ kind: "tick", dt: 0.5 }, { kind: "tick", dt: 0.5 }],
  },
  {
    name: "recursion and comparison",
    source: `
func fact(n):
    if n < 2:
        return 1
    return n * fact(n - 1)
out.record(fact(5))
`,
  },
  {
    name: "strings and lists",
    source: `
label = "A"
label = label + "B"
items = [1, 2]
items = [3, 4, 5]
out.record(label)
out.record(items[2])
`,
  },
  {
    name: "node method calls and property writes",
    source: `
motor.speed = 5
motor.start()
if motor.speed > 3:
    alarm.on()
`,
    nodes: ["motor", "alarm"],
  },
  {
    name: "error: unregistered node",
    source: `
ghost.open()
`,
  },
  {
    name: "function reads top-level name it also assigns",
    source: `
x = 1
func f():
    x = x + 1
    return x
out.record(f())
`,
    knownDivergence:
      "Function boundary: `x` inside f is a new function local. Generated TS hits the temporal dead zone " +
      "(`let x = x + 1`) while the executor reads the top-level x first. Pre-existing; recorded as a follow-up.",
  },
];

function makeNodes(names, log) {
  /** @type {Record<string, any>} */
  const nodes = {};
  for (const name of ["out", ...names]) {
    const node = { __name: name };
    if (name === "out") {
      node.record = (value) => { log.push(`out.record(${JSON.stringify(value)})`); };
    } else {
      for (const method of ["start", "stop", "on", "off", "open"]) {
        node[method] = (...args) => { log.push(`${name}.${method}(${JSON.stringify(args)})`); };
      }
    }
    nodes[name] = node;
  }
  return nodes;
}

function nodeState(nodes) {
  const state = {};
  for (const [name, node] of Object.entries(nodes)) {
    state[name] = Object.fromEntries(Object.entries(node).filter(([, value]) => typeof value !== "function"));
  }
  return state;
}

function errorText(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function runExecutor(testCase) {
  const log = [];
  const nodes = makeNodes(testCase.nodes ?? [], log);
  const rt = new BadodoRuntime();
  for (const [name, node] of Object.entries(nodes)) rt.registerNode(name, node);
  try {
    rt.run(testCase.source.trimStart());
    for (const trigger of testCase.triggers ?? []) {
      if (trigger.kind === "emit") rt.emit(nodes[trigger.node], trigger.event);
      else rt.tick(trigger.dt);
    }
  } catch (error) {
    return { log, state: nodeState(nodes), threw: true, error: errorText(error) };
  }
  return { log, state: nodeState(nodes), threw: false };
}

function runGeneratedTs(testCase) {
  const log = [];
  const nodes = makeNodes(testCase.nodes ?? [], log);
  const events = [];
  const frames = [];
  let time = 0;
  const host = {
    on: (target, event, handler) => { events.push({ target, event, handler }); },
    onFrame: (handler) => { frames.push(handler); },
    bind: () => { throw new Error("bind is not part of the differential corpus"); },
    watch: () => { throw new Error("watch is not part of the differential corpus"); },
    animate: () => { throw new Error("animate is not part of the differential corpus"); },
    animateTo: () => { throw new Error("animateTo is not part of the differential corpus"); },
  };
  let typescript;
  try {
    typescript = compile(testCase.source.trimStart(), "diff.bds").typescript;
  } catch (error) {
    return { log, state: nodeState(nodes), threw: true, error: `compile: ${errorText(error)}` };
  }
  const js = ts.transpileModule(typescript, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    reportDiagnostics: false,
  }).outputText;
  const scope = { ...host, ...nodes };
  try {
    const program = new Function(...Object.keys(scope), `"use strict";\n${js}`);
    program(...Object.values(scope));
    for (const trigger of testCase.triggers ?? []) {
      if (trigger.kind === "emit") {
        for (const entry of events) {
          if (entry.target === nodes[trigger.node] && entry.event === trigger.event) entry.handler();
        }
      } else {
        time += trigger.dt;
        for (const handler of frames) handler(time);
      }
    }
  } catch (error) {
    return { log, state: nodeState(nodes), threw: true, error: errorText(error), typescript };
  }
  return { log, state: nodeState(nodes), threw: false, typescript };
}

function comparable(result) {
  return { log: result.log, state: result.state, threw: result.threw };
}

const failures = [];
let consistent = 0;
let known = 0;

for (const testCase of cases) {
  const executor = runExecutor(testCase);
  const generated = runGeneratedTs(testCase);
  let same = true;
  try {
    assert.deepEqual(comparable(generated), comparable(executor));
  } catch {
    same = false;
  }
  if (testCase.knownDivergence) {
    if (same) {
      failures.push(`${testCase.name}: listed as known divergence but both paths now agree; remove it from the list`);
      console.error(`FAIL ${testCase.name} (known divergence no longer diverges)`);
    } else {
      known++;
      console.log(`KNOWN ${testCase.name}\n      executor: ${JSON.stringify(comparable(executor))}${executor.error ? ` (${executor.error})` : ""}\n      ts:       ${JSON.stringify(comparable(generated))}${generated.error ? ` (${generated.error})` : ""}\n      reason:   ${testCase.knownDivergence}`);
    }
    continue;
  }
  if (same) {
    consistent++;
    console.log(`OK   ${testCase.name}${executor.threw ? " (both threw)" : ""}`);
  } else {
    failures.push(testCase.name);
    console.error(`DIFF ${testCase.name}`);
    console.error(`      executor: ${JSON.stringify(comparable(executor))}${executor.error ? ` (${executor.error})` : ""}`);
    console.error(`      ts:       ${JSON.stringify(comparable(generated))}${generated.error ? ` (${generated.error})` : ""}`);
  }
}

console.log(`\nDifferential: ${consistent} consistent, ${known} known divergence, ${failures.length} failed (of ${cases.length})`);
if (failures.length > 0) process.exit(1);
