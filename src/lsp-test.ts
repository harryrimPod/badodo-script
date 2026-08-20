import assert from "node:assert/strict";
import { completionItems, diagnosticsForDocument, hoverForWord } from "./lsp";

const diagnostics = diagnosticsForDocument("when button.click:\n    door.open()\n");
assert.equal(diagnostics.length, 2, "compatibility symbols should be visible as editor warnings");
assert.ok(completionItems("speed = 1").some((item) => item.label === "async"));
assert.ok(completionItems("some_value = some(1)").some((item) => item.label === "unwrap"));
assert.match(hoverForWord("ok")?.contents.value ?? "", /Result/);
assert.equal(hoverForWord("missing"), null);
console.log("BDS LSP conformance: diagnostics, completion, and hover passed");
