import { compile } from "./index";

/** Phase A: indentation / end-of-line diagnostics must never be empty. */

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

function errorOf(source: string): string {
  try {
    compile(source, "indent.bds");
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

function expectError(name: string, source: string, expectations: { line: number; includes: string[] }): void {
  const message = errorOf(source);
  const problems: string[] = [];
  if (!message) problems.push("没有报错");
  if (message.includes("「」")) problems.push("包含空的「」");
  if (!message.startsWith(`第 ${expectations.line} 行`)) problems.push(`行号应为 ${expectations.line}`);
  for (const text of expectations.includes) {
    if (!message.includes(text)) problems.push(`缺少「${text}」`);
  }
  check(name, problems.length === 0, `${problems.join("；")}\n    实际: ${message}`);
}

console.log("缩进诊断测试\n");

expectError("块内多余缩进", "if ready:\n  a.on()\n    b.on()\n", {
  line: 3,
  includes: ["缩进", "应为 2 个空格", "实际 4 个空格"],
});

expectError("顶层多余缩进（上一行不是代码块开头）", "a = 1\n    b = 2\n", {
  line: 2,
  includes: ["缩进", "应为 0 个空格", "实际 4 个空格"],
});

expectError("回退到不存在的缩进层级", "if ready:\n    a.on()\n  b.on()\n", {
  line: 3,
  includes: ["缩进不一致", "0 或 4 个空格", "实际 2 个空格"],
});

expectError("冒号后缺少缩进块", "if ready:\nb.on()\n", {
  line: 2,
  includes: ["缩进"],
});

expectError("赋值右侧缺失（行尾）", "x =\ny = 1\n", {
  line: 1,
  includes: ["行尾"],
});

expectError("文件结尾缺少表达式", "x = 1 +", {
  line: 1,
  includes: ["文件结尾"],
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
