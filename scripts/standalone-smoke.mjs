import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executable = path.resolve(process.env.BDS_STANDALONE ?? path.join(root, "dist-bin", "bds.exe"));
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;

if (!fs.existsSync(executable)) {
  if (process.env.BDS_REQUIRE_STANDALONE === "1") throw new Error(`standalone 可执行文件不存在: ${executable}`);
  console.log(`Standalone smoke skipped: ${executable} 不存在`);
  process.exit(0);
}

function run(args) {
  return execFileSync(executable, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "bds-standalone-"));
try {
  assert.match(run(["--version"]), new RegExp(`^${packageVersion.replace(/\./g, "\\.")}\\r?\\n?$`));
  const doctor = run(["doctor"]);
  assert.doesNotMatch(doctor, /FAIL/);
  assert.match(run(["run", "examples/door.bds"]), /运行成功/);
  run(["compile", "examples/door.bds", path.join(fixture, "door.ts")]);
  run(["wasm", "examples/wasm-calc.bds", path.join(fixture, "calc.wasm")]);
  run(["pack", "examples/door.bds", path.join(fixture, "door.bin"), "-k", "standalone-pack-key-2026"]);
  for (const file of ["door.ts", "door.ts.map", "calc.wasm", "calc.wasm.wat", "door.bin"]) {
    assert.ok(fs.existsSync(path.join(fixture, file)), `standalone 输出缺失: ${file}`);
  }
  console.log("Standalone smoke passed: version/doctor/run/compile/wasm/pack");
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
