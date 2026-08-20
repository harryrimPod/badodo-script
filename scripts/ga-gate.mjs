import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const checks = [
  ["language core test", "src/language-ga-test.ts"],
  ["standard library", "src/stdlib-test.ts"],
  ["LSP server", "src/lsp.ts"],
  ["VS Code package", "editors/vscode/package.json"],
  ["Godot runtime bridge", "src/godot.ts"],
  ["licensing policy", "src/licensing.ts"],
  ["Babylon browser smoke", "scripts/browser-smoke.mjs"],
  ["MapLibre browser smoke", "scripts/maplibre-browser-smoke.mjs"],
  ["Go HTTP evidence", "scripts/verify-go-http.mjs"],
  ["Go MQTT evidence", "scripts/verify-go-mqtt.mjs"],
  ["C# evidence", "scripts/verify-csharp.mjs"],
  ["Godot evidence", "scripts/verify-godot.mjs"],
  ["package smoke", "scripts/package-smoke.mjs"],
  ["GA contract", "docs/ga-contract.md"],
  ["GA report", "docs/ga-report.md"],
  ["MIT license", "LICENSE"],
  ["CI workflow", ".github/workflows/ci.yml"],
  ["release workflow", ".github/workflows/release.yml"],
];
for (const [label, relative] of checks) assert.ok(fs.existsSync(path.join(root, relative)), `${label}: missing ${relative}`);
assert.equal(packageJson.license, "MIT", "package license must remain MIT");
assert.equal(packageJson.engines?.node, ">=20", "GA runtime must require Node >=20");
for (const script of ["test:language-ga", "test:lsp", "test:godot-dotnet", "test:licensing", "test:package"]) {
  assert.equal(typeof packageJson.scripts?.[script], "string", `missing npm script ${script}`);
}
const ci = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
assert.match(ci, /playwright install --with-deps chromium/);
assert.match(ci, /BDS_REQUIRE_BROWSER/);
console.log(`GA-100 static gate passed: ${checks.length} contract checks, MIT/Node/CI/package policy verified.`);
