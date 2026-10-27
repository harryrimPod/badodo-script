import { compile } from "./index";
import { BadodoRuntime } from "./runtime/runtime";

/**
 * Phase A scope regression tests.
 *
 * Rule under test (docs/spec.md 5.1.1):
 * - The first assignment to a name that is not visible declares it in the
 *   current block.
 * - A later assignment to a name visible in the current block or an
 *   enclosing block assigns that binding. It never re-declares it.
 * - Lookup stops at the nearest function boundary: a function body never
 *   assigns a top-level variable; it declares its own local instead.
 * - Function parameters, `for` items and the implicit `watch` value / `every
 *   frame` time are bindings of their own scope.
 */

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

function ts(source: string, emitTypes = false): string {
  return compile(source.trimStart(), "scope.bds", { emitTypes }).typescript;
}

function expectTs(name: string, source: string, expected: string, emitTypes = false): void {
  let actual: string;
  try {
    actual = ts(source, emitTypes);
  } catch (error) {
    check(name, false, `编译失败: ${(error as Error).message}`);
    return;
  }
  check(name, actual === expected.trim(), `\n--- expected\n${expected.trim()}\n--- actual\n${actual}`);
}

function countLet(code: string, name: string): number {
  return (code.match(new RegExp(`\\blet ${name}\\b`, "g")) ?? []).length;
}

interface Probe {
  values: unknown[];
  record: (value: unknown) => void;
}

function probe(): Probe {
  const values: unknown[] = [];
  return { values, record: (value: unknown) => { values.push(value); } };
}

function runWith(source: string, nodes: Record<string, unknown>): void {
  const rt = new BadodoRuntime();
  for (const [name, node] of Object.entries(nodes)) rt.registerNode(name, node);
  rt.run(source.trimStart());
}

console.log("作用域与变量声明测试\n");

console.log("TypeScript 生成：");

expectTs("顶层重复赋值只声明一次", `
speed = 10
speed = 20
`, `
let speed = 10;
speed = 20;
`);

expectTs("函数内重复赋值只声明一次", `
func f():
    y = 1
    y = 2
    return y
`, `
function f() {
  let y = 1;
  y = 2;
  return y;
}
`);

expectTs("嵌套块给外层变量赋值，不重新声明", `
x = 1
if x > 0:
    x = 2
`, `
let x = 1;
if (x > 0) {
  x = 2;
}
`);

expectTs("块内首次赋值在块内声明", `
if ready:
    level = 1
else:
    level = 2
`, `
if (ready) {
  let level = 1;
} else {
  let level = 2;
}
`);

expectTs("块结束后同名赋值重新声明（块内变量不可见）", `
if ready:
    level = 1
level = 3
`, `
if (ready) {
  let level = 1;
}
let level = 3;
`);

expectTs("函数边界：函数内不改写顶层变量", `
x = 1
func f():
    x = 2
    return x
`, `
let x = 1;
function f() {
  let x = 2;
  return x;
}
`);

expectTs("函数参数重新赋值", `
func inc(a):
    a = a + 1
    return a
`, `
function inc(a) {
  a = a + 1;
  return a;
}
`);

expectTs("函数内嵌套块给函数局部变量赋值", `
func pick(v):
    result = 0
    if v > 10:
        result = 1
    return result
`, `
function pick(v) {
  let result = 0;
  if (v > 10) {
    result = 1;
  }
  return result;
}
`);

expectTs("两个函数各自声明同名局部变量（不是全局去重）", `
func a():
    y = 1
    return y

func b():
    y = 2
    return y
`, `
function a() {
  let y = 1;
  return y;
}
function b() {
  let y = 2;
  return y;
}
`);

expectTs("for 循环变量被重新赋值时使用 let", `
items = [1, 2]
for item in items:
    item = item + 1
    out.record(item)
`, `
let items = [1, 2];
for (let item of items) {
  item = item + 1;
  out.record(item);
}
`);

expectTs("for 循环变量未被赋值时保持 const", `
for item in items:
    out.record(item)
`, `
for (const item of items) {
  out.record(item);
}
`);

expectTs("repeat 块内变量每次迭代声明，块内重复赋值", `
repeat 2:
    n = 1
    n = n + 1
`, `
for (let __i = 0; __i < 2; __i++) {
  let n = 1;
  n = n + 1;
}
`);

expectTs("when 回调更新顶层计数器", `
count = 0
when button.click:
    count = count + 1
`, `
let count = 0;
on(button, "click", () => {
  count = count + 1;
});
`);

expectTs("watch 隐式 value 重新赋值", `
watch sensor.temperature:
    value = value + 1
    out.record(value)
`, `
watch(() => sensor.temperature, (value) => {
  value = value + 1;
  out.record(value);
});
`);

expectTs("every frame 隐式 time 重新赋值", `
every frame:
    time = time * 2
`, `
onFrame((time) => {
  time = time * 2;
});
`);

expectTs("带类型注解的同作用域重复赋值只声明一次", `
x: i32 = 1
x: i32 = 2
`, `
let x: number = 1;
x = 2;
`, true);

{
  const code = ts(`
a = 1
a = 2
a = 3
if a > 1:
    a = 4
    b = 1
    b = 2
func f():
    a = 5
    a = 6
    return a
`);
  check("综合：每个作用域每个名字最多一个 let", countLet(code, "a") === 2 && countLet(code, "b") === 1, code);
}

console.log("\n结构化执行器：");

{
  const out = probe();
  runWith(`
x = 1
x = 2
out.record(x)
`, { out });
  check("顶层重复赋值结果为最后一次", JSON.stringify(out.values) === "[2]", JSON.stringify(out.values));
}

{
  const out = probe();
  runWith(`
x = 1
if x > 0:
    x = 2
out.record(x)
`, { out });
  check("嵌套块赋值更新外层变量", JSON.stringify(out.values) === "[2]", JSON.stringify(out.values));
}

{
  const out = probe();
  const button = { __name: "button" };
  const rt = new BadodoRuntime();
  rt.registerNode("out", out);
  rt.registerNode("button", button);
  rt.run(`
count = 0
when button.click:
    count = count + 1
    out.record(count)
`);
  rt.emit(button, "click");
  rt.emit(button, "click");
  check("when 回调累加顶层计数器", JSON.stringify(out.values) === "[1,2]", JSON.stringify(out.values));
}

{
  const out = probe();
  runWith(`
x = 1
func f():
    x = 2
    return x
out.record(f())
out.record(x)
`, { out });
  check("函数边界：函数局部变量不影响顶层", JSON.stringify(out.values) === "[2,1]", JSON.stringify(out.values));
}

{
  const out = probe();
  runWith(`
total = 0
for item in [1, 2, 3]:
    total = total + item
out.record(total)
`, { out });
  check("for 循环内累加外层变量", JSON.stringify(out.values) === "[6]", JSON.stringify(out.values));
}

{
  const out = probe();
  runWith(`
if true:
    level = 1
    out.record(level)
level = 3
out.record(level)
`, { out });
  check("块内变量在块外不可见，块外重新声明", JSON.stringify(out.values) === "[1,3]", JSON.stringify(out.values));
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
