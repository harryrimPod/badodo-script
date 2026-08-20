import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist-bin");
const keepTemp = process.env.BDS_KEEP_STANDALONE_TEMP === "1";

function run(command, args) {
  execFileSync(command, args, { cwd: root, stdio: "inherit", env: process.env });
}

const [major] = process.versions.node.split(".").map(Number);
if (major < 20) throw new Error(`standalone 构建需要 Node.js >= 20，当前为 ${process.versions.node}`);
if (process.platform !== "win32") {
  throw new Error("当前 standalone 发布资产目标为 Windows x64；请在 Windows runner 上执行此脚本");
}

fs.mkdirSync(outDir, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "bds-sea-"));
const bundle = path.join(temp, "bds-main.cjs");
const config = path.join(temp, "sea-config.json");
const blob = path.join(temp, "bds-sea.blob");
const executable = path.join(outDir, "bds.exe");
const postjectCli = path.join(root, "node_modules", "postject", "dist", "cli.js");

try {
  run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"]);
  run(process.execPath, [
    "node_modules/esbuild/bin/esbuild",
    "dist/cli.js",
    "--bundle",
    "--platform=node",
    "--format=cjs",
    "--target=node20",
    `--outfile=${bundle}`,
  ]);

  fs.writeFileSync(config, JSON.stringify({
    main: bundle,
    output: blob,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true,
  }, null, 2));
  run(process.execPath, ["--experimental-sea-config", config]);
  fs.copyFileSync(process.execPath, executable);

  run(process.execPath, [
    postjectCli,
    executable,
    "NODE_SEA_BLOB",
    blob,
    "--sentinel-fuse",
    "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ]);
  console.log(`Standalone executable written: ${path.relative(root, executable)}`);
} finally {
  if (!keepTemp) fs.rmSync(temp, { recursive: true, force: true });
}
