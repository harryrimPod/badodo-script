import {
  assertBdsPayload,
  BDS_PAYLOAD_VERSION,
  PayloadValidationErrorException,
  validateBdsPayload,
} from "./payload";
import { generateSharedArtifacts } from "./shared";
import { assertSharedIngress, SharedIngressValidationError } from "./runtime/shared-ingress";
import { BadodoRuntime } from "./runtime/runtime";
import { decryptPayload } from "./runtime/browser";
import { encryptToBinary } from "./pack/encrypt";
import { packScript, unpackScript } from "./pack/pack";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function asArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

async function main(): Promise<void> {
  console.log("BDS ingress contract conformance\n");

  const validPayload = { version: BDS_PAYLOAD_VERSION, nodeNames: ["door", "light"], code: "" };
  const validResult = validateBdsPayload(validPayload);
  check("valid payload", validResult.valid);
  check("payload narrowing", assertBdsPayload(validPayload).version === BDS_PAYLOAD_VERSION);

  const invalidResult = validateBdsPayload({ version: 2, nodeNames: ["door", "door", ""], code: 42, extra: true });
  check("invalid payload rejected", !invalidResult.valid && invalidResult.errors.length >= 4);
  check("payload errors deterministic", invalidResult.errors[0]?.path === "$.extra" && invalidResult.errors.some((error) => error.keyword === "duplicate"));

  try {
    assertBdsPayload({ version: 1, nodeNames: [""], code: "" });
    check("payload exception type", false, "未抛出错误");
  } catch (error) {
    check("payload exception type", error instanceof PayloadValidationErrorException);
  }

  const runtime = new BadodoRuntime();
  try {
    runtime.runCompiled("", ["", "door"]);
    check("runCompiled ingress guard", false, "未抛出错误");
  } catch {
    check("runCompiled ingress guard", true);
  }

  const key = "ingress-test-key";
  const packed = packScript("speed = 1", key);
  const unpacked = unpackScript(packed, key);
  check("pack/unpack payload contract", unpacked.version === 1 && unpacked.nodeNames.length === 0 && typeof unpacked.code === "string");

  const malformedJson = JSON.stringify({ version: 1, nodeNames: [], code: "", extra: true });
  try {
    unpackScript(encryptToBinary(malformedJson, key), key);
    check("server unpack rejects extra field", false, "未抛出错误");
  } catch {
    check("server unpack rejects extra field", true);
  }

  const browserPayload = await decryptPayload(asArrayBuffer(packed), key);
  check("browser decrypt validates payload", browserPayload.version === 1 && browserPayload.code === unpacked.code);

  const malformedBrowser = encryptToBinary(JSON.stringify({ version: 99, nodeNames: [], code: "" }), key);
  try {
    await decryptPayload(asArrayBuffer(malformedBrowser), key);
    check("browser decrypt rejects version", false, "未抛出错误");
  } catch {
    check("browser decrypt rejects version", true);
  }

  const artifacts = generateSharedArtifacts(`
@shared type DeviceState:
    id: string
    online: bool
    label?: string
`);
  const record = assertSharedIngress({ id: "D-1", online: true }, "DeviceState", artifacts);
  check("shared ingress valid record", record.id === "D-1");
  try {
    assertSharedIngress({ online: true, extra: 1 }, "DeviceState", artifacts);
    check("shared ingress rejects invalid record", false, "未抛出错误");
  } catch (error) {
    const typed = error as SharedIngressValidationError;
    check("shared ingress rejects invalid record", error instanceof SharedIngressValidationError && typed.result.errors.some((item) => item.keyword === "required"));
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
