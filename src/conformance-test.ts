import { tokenize } from "./lexer";
import { parse } from "./parser";
import { analyzeProgram } from "./analysis";
import { BDS_CAPABILITIES, capabilityById } from "./capabilities";
import { normalizeProgram } from "./semantic-ir";

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

console.log("BDS Phase 0 conformance\n");

const source = `
speed = 2
when button.click:
    door.open()
watch sensor.temperature:
    if value > 80:
        alarm.on()
every frame:
    rotor.rotate_y(speed * time)
`;
const program = parse(tokenize(source));
const analysis = analyzeProgram(program);
const normalized = normalizeProgram(program);

check("normalized IR 去除 source line", !JSON.stringify(normalized).includes('"line"'));
check("场景节点分类稳定", JSON.stringify(analysis.sceneNodes) === JSON.stringify(["alarm", "button", "door", "rotor", "sensor"]));
check("隐式 value/time 不被判为节点", !analysis.sceneNodes.includes("value") && !analysis.sceneNodes.includes("time"));
check("runtime capability manifest 非空", BDS_CAPABILITIES.length >= 8);
check("runtime.bind 可查找", capabilityById("runtime.bind")?.signature === "(getter, node, prop) -> void");
check("adapter manifest 包含 MapLibre event", Boolean(capabilityById("adapter.maplibre.map")?.events?.includes("move_end")));

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);

