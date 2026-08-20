import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "bds-cli-run-"));

function run(args, cwd = root) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

try {
  const exampleOutput = run(["run", "examples/door.bds"]);
  assert.match(exampleOutput, /运行成功/);

  fs.writeFileSync(path.join(fixture, "main.bds"), [
    "speed = 2",
    "",
    "when switch.click:",
    "    motor.start()",
    "",
  ].join("\n"), "utf8");
  const configuredOutput = run([
    "run",
    "main.bds",
    "--nodes",
    "switch,motor",
    "--target",
    "web",
    "--emit-types",
  ], fixture);
  assert.match(configuredOutput, /运行成功/);

  assert.throws(() => run(["run", "missing.bds"]), /文件不存在/);
  console.log("CLI run smoke passed: default run, node/target/type flags, and failure exit");
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
