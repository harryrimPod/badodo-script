import { analyze, compile } from "./index";

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

console.log("BDS Phase 1 type conformance\n");

const valid = analyze(`
speed: i32 = 2
ratio: f64 = speed / 2

func add(a: i32, b: i32) -> i32:
    return a + b

result = add(2, 3)
items = [1, 2, 3]
first: i32 = items[0]
`);

check("类型注解被解析", valid.ast.body[0].kind === "VarDecl" && Boolean(valid.ast.body[0].typeAnnotation));
check("函数参数和返回类型被解析", valid.ast.body[2].kind === "FuncDef" && Boolean(valid.ast.body[2].returnType) && valid.ast.body[2].paramTypes?.length === 2);
check("有效程序无类型错误", !valid.types.diagnostics.some((diagnostic) => diagnostic.severity === "error"), JSON.stringify(valid.types.diagnostics));
check("类型注解不改变默认 TS 输出", compile("speed: i32 = 2").typescript === "let speed = 2;");

const invalid = analyze(`
bad: bool = 1

func wrong(value: string) -> i32:
    return value
`);
check("错误类型产生诊断", invalid.types.diagnostics.some((diagnostic) => diagnostic.code === "BDS-TYPE-001"));
check("错误返回类型产生诊断", invalid.types.diagnostics.filter((diagnostic) => diagnostic.code === "BDS-TYPE-001").length >= 2);

const scene = analyze(`
if sensor.temperature > 80:
    alarm.on()
`);
check("未知场景节点保持兼容", scene.symbols.sceneNodes.includes("sensor") && scene.symbols.sceneNodes.includes("alarm"));
check("未知场景节点不产生类型 error", !scene.types.diagnostics.some((diagnostic) => diagnostic.severity === "error"));

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);

