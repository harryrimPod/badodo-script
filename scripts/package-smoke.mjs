import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "bds-package-smoke-"));
// Some managed Windows runners protect the user-wide npm cache. Keep this
// bounded smoke test entirely inside its disposable temporary directory.
process.env.npm_config_cache = path.join(temp, "npm-cache");
process.env.NPM_CONFIG_CACHE = process.env.npm_config_cache;

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runNpm(args, cwd) {
  return npmExecPath
    ? run(process.execPath, [npmExecPath, ...args], cwd)
    : run(npm, args, cwd);
}

try {
  const packOutput = runNpm(["pack", "--json", "--pack-destination", temp], root);
  const packed = JSON.parse(packOutput.trim());
  assert.equal(packed.length, 1, "npm pack should produce one tarball");
  const tarball = path.resolve(temp, packed[0].filename);
  assert.ok(fs.existsSync(tarball), "npm pack tarball should exist");

  const paths = new Set((packed[0].files ?? []).map((entry) => entry.path));
  for (const required of ["dist/index.js", "dist/cli.js", "dist/lsp-cli.js", "dist/godot.js", "README.md", "LICENSE"]) {
    assert.ok(paths.has(required), `published package must contain ${required}`);
  }
  for (const forbidden of ["src/", "demo/", "examples/", "node_modules/"]) {
    assert.ok(![...paths].some((entry) => entry.startsWith(forbidden)), `published package must exclude ${forbidden}`);
  }

  const consumer = path.join(temp, "consumer");
  fs.mkdirSync(consumer, { recursive: true });
  fs.writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ name: "bds-consumer", private: true }, null, 2));
  runNpm(["install", tarball, "--ignore-scripts", "--no-package-lock", "--no-audit", "--no-fund"], consumer);

  const packageRoot = path.join(consumer, "node_modules", "badodo-script");
  const installedManifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  const version = run(process.execPath, [path.join(packageRoot, "dist", "cli.js"), "--version"], consumer).trim();
  assert.equal(version, installedManifest.version);
  const apiProbe = run(process.execPath, ["-e", "const b=require('badodo-script'); const p=require('badodo-script/package.json'); if(typeof b.compile!=='function'||b.BDS_VERSION!==p.version) process.exit(1)"], consumer);
  assert.equal(apiProbe, "");
  run(process.execPath, ["--input-type=module", "-e", "import { compile, BDS_VERSION } from 'badodo-script'; if(typeof compile!=='function'||typeof BDS_VERSION!=='string') process.exit(1)"], consumer);

  const project = path.join(consumer, "starter");
  run(process.execPath, [path.join(packageRoot, "dist", "cli.js"), "init", project], consumer);
  assert.ok(fs.existsSync(path.join(project, "main.bds")));
  run(process.execPath, [path.join(packageRoot, "dist", "cli.js"), "compile"], project);
  assert.ok(fs.existsSync(path.join(project, "dist", "main.ts")));

  console.log("Package smoke passed: npm pack -> local install -> API/CLI/init/compile");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
