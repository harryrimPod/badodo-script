import { compileStrict, StrictCompileError } from "./strict-compile";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function expectStrictError(name: string, source: string, options: Parameters<typeof compileStrict>[1], code: string): void {
  try {
    compileStrict(source, options);
    check(name, false, "未抛出 StrictCompileError");
  } catch (error) {
    const typed = error as StrictCompileError;
    check(name, error instanceof StrictCompileError && typed.diagnostics.some((diagnostic) => diagnostic.code === code), JSON.stringify(typed.diagnostics));
  }
}

console.log("BDS strict compile conformance\n");

const result = compileStrict("door.open()", { nodeNames: ["door"], target: "web", sourceName: "fixture.bds" });
check("known node manifest compiles", result.nodeNames.join(",") === "door" && result.typescript.includes("door.open()"));
check("strict result carries source map", typeof result.sourceMap === "string" && result.sourceMap.length > 0);
check("used capability manifest is deterministic", result.capabilities.length === 0 && result.diagnostics.length === 0);

const builtinResult = compileStrict("result = vec3(1, 2, 3)", { nodeNames: [], target: "server" });
check("portable builtin allowed on server", builtinResult.capabilities.some((entry) => entry.id === "builtin.vec3"));

const runtimeResult = compileStrict(`
when button.click:
    door.open()
watch sensor.temperature:
    alarm.on()
every frame:
    rotor.rotate_y(time)
animate door.y to 2 in 1
`, { nodeNames: ["alarm", "button", "door", "rotor", "sensor"], target: "web" });
const runtimeCapabilityIds = new Set(runtimeResult.capabilities.map((entry) => entry.id));
check("statement sugar carries runtime capabilities", ["runtime.on", "runtime.watch", "runtime.on-frame", "runtime.animate"].every((id) => runtimeCapabilityIds.has(id)));

expectStrictError("unknown node rejected by manifest", "door.open()", { nodeNames: ["light"] }, "BDS-STRICT-001");
expectStrictError("missing node manifest rejected", "door.open()", {}, "BDS-STRICT-001");
expectStrictError("duplicate manifest rejected", "door.open()", { nodeNames: ["door", "door"] }, "BDS-STRICT-002");
expectStrictError("type error rejected", "value: i32 = \"bad\"", { nodeNames: [] }, "BDS-STRICT-003");
expectStrictError("target capability mismatch rejected", "value = 1\nbind value -> gauge.value", { nodeNames: ["gauge"], target: "server" }, "BDS-STRICT-004");

const permissive = compileStrict("door.open()", { requireNodeManifest: false });
check("manifest opt-out remains explicit", permissive.nodeNames.join(",") === "door");

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
