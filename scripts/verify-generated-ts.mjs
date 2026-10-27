// Phase A: type-check the TypeScript the compiler generates.
//
// Each example is compiled with the current compiler and checked as its own
// TypeScript program with `strict: true` (same strictness as tsconfig.json),
// plus the ambient host API in scripts/fixtures/generated-ts/bds-host.d.ts and
// a per-example node stub. Generated BDS output is a global script, so each
// one is checked in isolation, with lib ES2022 only: the DOM lib declares
// globals such as `name`, `open` and `status` that would collide with BDS
// variables and node names. The project tsconfig.json is not changed.
//
// Examples that currently fail for a known, documented reason are listed in
// EXPECTED_FAILURES with the exact diagnostic codes. They are asserted to
// still fail with exactly those codes, so a fix (or a new error) is noticed;
// nothing is skipped or silenced.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { compile } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "scripts", "fixtures", "generated-ts");
const hostDts = path.join(fixtures, "bds-host.d.ts");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bds-generated-ts-"));

const compilerOptions = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2022.d.ts"],
  types: [],
  skipLibCheck: true,
};

/** example name -> { codes: sorted TS diagnostic codes, reason } */
const EXPECTED_FAILURES = {
  door: {
    codes: [1005, 1005, 1130, 1135, 2695, 2695],
    reason: "node name `switch` is a JS/TS reserved word; generated `on(switch, ...)` is a syntax error (follow-up: reserved-word node names)",
  },
  rotation: {
    codes: [1005, 1005, 1130, 1135, 2695, 2695],
    reason: "node name `switch` is a JS/TS reserved word; generated `on(switch, ...)` is a syntax error (follow-up: reserved-word node names)",
  },
  "click-model": {
    codes: [2774],
    reason: "example tests `light.on` (a method) as a condition and then calls it; state vs method is ambiguous in the example (follow-up: example/node API)",
  },
  light: {
    codes: [7006],
    reason: "untyped BDS parameter `count` becomes an implicit-any TS parameter under strict (follow-up: default output typing policy)",
  },
  "wasm-calc": {
    codes: [7006, 7006, 7006, 7006],
    reason: "untyped BDS parameters become implicit-any TS parameters under strict (follow-up: default output typing policy)",
  },
};

/** Scope regression corpus: every case must type-check cleanly. */
const SCOPE_CASES = [
  { name: "top-level reassignment", source: "speed = 10\nspeed = 20\nout.record(speed)\n" },
  { name: "nested block assigns outer", source: "x = 1\nif x > 0:\n    x = 2\nout.record(x)\n" },
  { name: "if/else declare in each branch", source: "if ready:\n    level = 1\n    out.record(level)\nelse:\n    level = 2\n    out.record(level)\n" },
  { name: "block variable then outer declaration", source: "if ready:\n    level = 1\n    out.record(level)\nlevel = 3\nout.record(level)\n" },
  { name: "function local reassignment", source: "func f() -> i32:\n    y = 1\n    y = 2\n    return y\nout.record(f())\n", emitTypes: true },
  { name: "function boundary", source: "x = 1\nfunc f() -> i32:\n    x = 2\n    return x\nout.record(f())\nout.record(x)\n", emitTypes: true },
  { name: "parameter reassignment", source: "func inc(a: i32) -> i32:\n    a = a + 1\n    return a\nout.record(inc(1))\n", emitTypes: true },
  { name: "nested block in function", source: "func pick(v: i32) -> i32:\n    result = 0\n    if v > 10:\n        result = 1\n    return result\nout.record(pick(3))\n", emitTypes: true },
  { name: "two functions same local name", source: "func a() -> i32:\n    y = 1\n    return y\nfunc b() -> i32:\n    y = 2\n    return y\nout.record(a() + b())\n", emitTypes: true },
  { name: "for item reassignment", source: "for item in [1, 2]:\n    item = item + 1\n    out.record(item)\n" },
  { name: "for accumulates outer", source: "total = 0\nfor item in [1, 2, 3]:\n    total = total + item\nout.record(total)\n" },
  { name: "repeat per-iteration variable", source: "repeat 2:\n    n = 1\n    n = n + 1\n    out.record(n)\n" },
  { name: "when updates counter", source: "count = 0\nwhen button.click:\n    count = count + 1\n    out.record(count)\n" },
  { name: "watch implicit value", source: "watch sensor.temperature:\n    value = value + 1\n    out.record(value)\n" },
  { name: "every frame implicit time", source: "acc = 0\nevery frame:\n    time = time * 2\n    acc = acc + time\n" },
  { name: "annotated redeclaration", source: "x: i32 = 1\nx: i32 = 2\nout.record(x)\n", emitTypes: true },
];

function check(label, typescript, stubPath) {
  const file = path.join(tempDir, `${label.replace(/[^a-z0-9-]+/gi, "_")}.ts`);
  fs.writeFileSync(file, `${typescript}\n`, "utf8");
  const program = ts.createProgram([hostDts, stubPath, file], compilerOptions);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  return diagnostics.map((diagnostic) => {
    const where = diagnostic.file && diagnostic.start !== undefined
      ? (() => {
          const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
          return `${path.basename(diagnostic.file.fileName)}:${line + 1}:${character + 1}`;
        })()
      : "";
    return { code: diagnostic.code, text: `${where} TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}` };
  });
}

const failures = [];
let clean = 0;
let expected = 0;

try {
  const examplesDir = path.join(root, "examples");
  const examples = fs.readdirSync(examplesDir).filter((name) => name.endsWith(".bds")).sort();
  for (const file of examples) {
    const name = file.replace(/\.bds$/, "");
    const stub = path.join(fixtures, "examples", `${name}.d.ts`);
    if (!fs.existsSync(stub)) {
      failures.push(`${name}: missing node stub ${path.relative(root, stub)}`);
      continue;
    }
    const { typescript } = compile(fs.readFileSync(path.join(examplesDir, file), "utf8"), file);
    const diagnostics = check(`example-${name}`, typescript, stub);
    const codes = diagnostics.map((d) => d.code).sort((a, b) => a - b);
    const expectation = EXPECTED_FAILURES[name];
    if (expectation) {
      const want = [...expectation.codes].sort((a, b) => a - b);
      if (JSON.stringify(codes) === JSON.stringify(want)) {
        expected++;
        console.log(`EXPECTED-FAIL examples/${file} [${codes.map((c) => `TS${c}`).join(", ")}] — ${expectation.reason}`);
      } else {
        failures.push(`examples/${file}: expected TS codes ${JSON.stringify(want)}, got ${JSON.stringify(codes)}${codes.length === 0 ? " (now clean: remove from EXPECTED_FAILURES)" : ""}`);
        for (const d of diagnostics) console.error(`  ${d.text}`);
      }
    } else if (diagnostics.length === 0) {
      clean++;
      console.log(`OK examples/${file}`);
    } else {
      failures.push(`examples/${file}`);
      console.error(`FAIL examples/${file}`);
      for (const d of diagnostics) console.error(`  ${d.text}`);
    }
  }

  const scopeStub = path.join(fixtures, "scope", "scope.d.ts");
  for (const testCase of SCOPE_CASES) {
    let typescript;
    try {
      typescript = compile(testCase.source, "scope.bds", { emitTypes: testCase.emitTypes === true }).typescript;
    } catch (error) {
      failures.push(`scope: ${testCase.name}: compile failed: ${error.message}`);
      console.error(`FAIL scope: ${testCase.name}: ${error.message}`);
      continue;
    }
    const diagnostics = check(`scope-${testCase.name}`, typescript, scopeStub);
    if (diagnostics.length === 0) {
      clean++;
      console.log(`OK scope: ${testCase.name}`);
    } else {
      failures.push(`scope: ${testCase.name}`);
      console.error(`FAIL scope: ${testCase.name}`);
      for (const d of diagnostics) console.error(`  ${d.text}`);
    }
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log(`\nGenerated TS check: ${clean} clean, ${expected} expected failures, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
