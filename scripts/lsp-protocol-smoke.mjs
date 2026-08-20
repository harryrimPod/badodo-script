import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(process.execPath, [path.join(root, "dist", "lsp-cli.js")], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
let buffer = Buffer.alloc(0);
const responses = new Map();
let pendingResolve;
child.stdout.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const separator = buffer.indexOf("\r\n\r\n");
    if (separator < 0) break;
    const length = Number(/Content-Length:\s*(\d+)/i.exec(buffer.subarray(0, separator).toString("ascii"))?.[1]);
    if (!Number.isFinite(length) || buffer.length < separator + 4 + length) break;
    const start = separator + 4;
    const value = JSON.parse(buffer.subarray(start, start + length).toString("utf8"));
    buffer = buffer.subarray(start + length);
    if (value.id !== undefined) {
      responses.set(String(value.id), value);
      pendingResolve?.();
      pendingResolve = undefined;
    }
  }
});
function send(message) {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...message }));
  child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
  child.stdin.write(body);
}
async function waitFor(id) {
  const key = String(id);
  const deadline = Date.now() + 5000;
  while (!responses.has(key)) {
    if (Date.now() > deadline) throw new Error(`LSP response timeout: ${id}`);
    await new Promise((resolve) => { pendingResolve = resolve; setTimeout(resolve, 50); });
  }
  return responses.get(key);
}
try {
  send({ id: 1, method: "initialize", params: { capabilities: {} } });
  const initialized = await waitFor(1);
  assert.equal(initialized.result.capabilities.hoverProvider, true);
  send({ method: "initialized", params: {} });
  send({ id: 2, method: "textDocument/completion", params: { textDocument: { uri: "file:///main.bds" } } });
  const completion = await waitFor(2);
  assert.ok(completion.result.items.some((item) => item.label === "async"));
  send({ id: 3, method: "shutdown", params: null });
  assert.equal((await waitFor(3)).result, null);
  send({ method: "exit" });
  console.log("LSP protocol smoke passed: initialize/completion/shutdown");
} finally {
  child.kill();
}
