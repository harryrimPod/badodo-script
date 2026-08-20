import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = process.env.BABYLON_SOURCE_ROOT
  ?? "E:/AI_WORK/nixiang/Badodo/runtime/node_modules/@babylonjs/core";
const packageJson = path.join(sourceRoot, "package.json");
if (!fs.existsSync(packageJson)) {
  throw new Error(`Babylon source package not found: ${sourceRoot}. Set BABYLON_SOURCE_ROOT to a local @babylonjs/core directory.`);
}

const metadata = JSON.parse(fs.readFileSync(packageJson, "utf8"));
const output = path.join(root, "browser-fixtures", "babylon-fixture.js");
fs.mkdirSync(path.dirname(output), { recursive: true });

await build({
  stdin: {
    contents: "export { Engine, Scene, Color4, ArcRotateCamera, HemisphericLight, MeshBuilder, StandardMaterial, Color3, PointLight, Vector3 } from './index.js';",
    resolveDir: sourceRoot,
    sourcefile: "babylon-entry.js",
  },
  bundle: true,
  format: "iife",
  globalName: "BabylonFixture",
  platform: "browser",
  outfile: output,
  minify: true,
  legalComments: "none",
  sourcemap: false,
  banner: { js: `/* @babylonjs/core ${metadata.version}; generated local fixture */` },
});

console.log(`Babylon fixture built: ${output} (@babylonjs/core ${metadata.version})`);
