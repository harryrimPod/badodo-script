import { compile } from "./index";
import { encryptToBinary, decryptFromBinary } from "./pack/encrypt";
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

console.log("BDS production hardening conformance\n");

const windowsSource = [
  "speed = 2",
  "if speed > 1:",
  "    motor.start()",
].join("\r\n");
const windowsOutput = compile(windowsSource).typescript;
check("Windows CRLF source compiles", windowsOutput.includes("let speed = 2;") && windowsOutput.includes("motor.start();"));
check("Windows CRLF indentation is preserved", windowsOutput.includes("if (speed > 1) {\n  motor.start();\n}"));

const key = "production-test-key-2026";
const blob = packScript("speed = 1", key);
check("explicit production key round-trips", unpackScript(blob, key).code === "let speed = 1;");
check("wrong key is rejected", (() => {
  try {
    unpackScript(blob, "wrong-production-key");
    return false;
  } catch {
    return true;
  }
})());
check("short encryption key is rejected", (() => {
  try {
    encryptToBinary("payload", "short");
    return false;
  } catch {
    return true;
  }
})());
check("truncated encrypted blob is rejected", (() => {
  try {
    decryptFromBinary(Buffer.from("BDS1", "ascii"), key);
    return false;
  } catch {
    return true;
  }
})());
check("missing encryption key is rejected", (() => {
  try {
    packScript("speed = 1", undefined as unknown as string);
    return false;
  } catch {
    return true;
  }
})());
check("raw encrypted text round-trips", decryptFromBinary(encryptToBinary("let x = 1;", key), key) === "let x = 1;");

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
