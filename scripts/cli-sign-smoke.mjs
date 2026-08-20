import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "cli.js");
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "bds-cli-sign-"));

function run(args) {
  return execFileSync(process.execPath, [cli, ...args], { cwd: fixture, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

try {
  fs.writeFileSync(path.join(fixture, "main.bds"), "speed = 1\n", "utf8");
  fs.writeFileSync(path.join(fixture, "claims.json"), JSON.stringify({
    subject: "cli-smoke",
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2027-01-01T00:00:00Z",
    features: ["web3d"],
  }), "utf8");
  run(["keygen", "keys"]);
  const privateKey = path.join(fixture, "keys", "bds-signing-private.pem");
  const publicKey = path.join(fixture, "keys", "bds-signing-public.pem");
  assert.ok(fs.existsSync(privateKey));
  assert.ok(fs.existsSync(publicKey));
  run(["pack", "main.bds", "main.bds.bin", "-k", "cli-sign-smoke-key-2026"]);
  run(["sign", "main.bds.bin", "--private-key", privateKey, "--license", "claims.json", "main.bds.signed.json"]);
  const verified = run(["verify", "main.bds.signed.json", "--public-key", publicKey, "--feature", "web3d"]);
  assert.match(verified, /验证成功/);

  const tampered = JSON.parse(fs.readFileSync(path.join(fixture, "main.bds.signed.json"), "utf8"));
  tampered.payload = Buffer.from("tampered", "utf8").toString("base64");
  fs.writeFileSync(path.join(fixture, "tampered.json"), JSON.stringify(tampered), "utf8");
  assert.throws(() => run(["verify", "tampered.json", "--public-key", publicKey]));
  console.log("CLI signing smoke passed: keygen -> pack -> sign -> verify -> tamper rejection");
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
