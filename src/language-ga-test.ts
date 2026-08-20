import assert from "node:assert/strict";
import { compile, analyze } from "./index";

function test(name: string, run: () => void): void {
  try {
    run();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

console.log("BDS GA language core conformance");

test("module imports project to TypeScript", () => {
  const result = compile('import { fetch_state as fetchState } from "./device"\nvalue = fetchState()');
  assert.equal(result.typescript, 'import { fetch_state as fetchState } from "./device";\nlet value = fetchState();');
});

test("map literals and string/index access project", () => {
  const result = compile('state = { "online": true, temperature: 25 }\nvalue = state["temperature"]');
  assert.equal(result.typescript, 'let state = { "online": true, "temperature": 25 };\nlet value = state["temperature"];');
});

test("async and await project with Promise return type", () => {
  const result = compile("async func load() -> string:\n    return await fetch_state()", "async.bds", { emitTypes: true });
  assert.equal(result.typescript, "async function load(): Promise<string> {\n  return await fetch_state();\n}");
});

test("await outside async function is rejected", () => {
  assert.throws(() => compile("value = await fetch_state()"), /await 只能出现在 async func 内/);
});

test("new language constructs remain analyzable without scene-node pollution", () => {
  const result = analyze('import { fetch_state } from "./device"\nstate = { value: awaitable() }');
  assert.ok(result.symbols.declarations.some((item) => item.name === "fetch_state"));
  assert.deepEqual(result.symbols.sceneNodes, ["awaitable"]);
});

test("record and enum declarations are available in typed output", () => {
  const result = compile(`type Device:\n    id: string\n    online?: bool\n\nenum Status:\n    idle\n    running\n\nstate: Device = { "id": "D-1" }\ncurrent = Status.running`, "types.bds", { emitTypes: true });
  assert.match(result.typescript, /interface Device/);
  assert.match(result.typescript, /online\?: boolean/);
  assert.match(result.typescript, /const Status = Object\.freeze/);
  assert.match(result.typescript, /let state: Device/);
});

test("Option and Result annotations are recognized", () => {
  const result = compile("present: option = some(1)\nanswer: result = ok(1)", "result.bds", { emitTypes: true });
  assert.match(result.typescript, /Option<unknown>/);
  assert.match(result.typescript, /Result<unknown, unknown>/);
});

console.log("结果: 7 通过, 0 失败");
