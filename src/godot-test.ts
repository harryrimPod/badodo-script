import assert from "node:assert/strict";
import { generateGodotRuntime } from "./godot";

const output = generateGodotRuntime({ namespace: "Badodo.Test", className: "Runtime" });
assert.match(output, /RegisterNode/);
assert.match(output, /ResolveNode/);
assert.match(output, /OnFrame/);
assert.match(output, /Emit/);
assert.throws(() => generateGodotRuntime({ namespace: "Badodo.Bad-Name" }), /Invalid C# namespace/);
console.log("Godot runtime projection conformance: source generation passed");
