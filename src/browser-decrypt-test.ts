import { packScript, unpackScript } from "./pack/pack";
import { decryptPayload } from "./runtime/browser";

// 验证：Node 侧加密 → 浏览器侧(Web Crypto)解密 的一致性
const key = "my-secret-key-2026";
const source = [
  "speed = 2",
  "",
  "when cube.click:",
  "    light.switch()",
  "",
  "every frame:",
  "    cube.rotate_y(speed * time)",
].join("\n");

(async () => {
  const bin = packScript(source, key);

  // 浏览器侧解密（Web Crypto）
  const arr = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer;
  const browser = await decryptPayload(arr, key);

  // 服务端解密
  const server = unpackScript(bin, key);

  console.log("浏览器解密 nodeNames:", JSON.stringify(browser.nodeNames));
  console.log("服务端解密 nodeNames:", JSON.stringify(server.nodeNames));
  console.log("两侧一致:", JSON.stringify(server) === JSON.stringify(browser));
  console.log("\n解密后代码:");
  console.log(browser.code);
})();
