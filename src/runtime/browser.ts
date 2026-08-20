import { BadodoRuntime } from "./runtime";
import { assertBdsPayload, BdsPayload } from "../payload";
import { verifySignedArtifactBrowser } from "./signed";

export { BadodoRuntime, some, none, ok, err, is_ok, unwrap } from "./runtime";
export * from "../adapters/babylon";
export * from "../adapters/maplibre";
export * from "./signed";

const MAGIC = "BDS1";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Browser-side AES-256-GCM decryption that mirrors the Node pack format:
 *   [magic "BDS1" (4)] [IV (12)] [auth tag (16)] [ciphertext]
 */
async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const data = new TextEncoder().encode(passphrase);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["decrypt"]);
}

export type EncryptedPayload = BdsPayload;

export async function decryptPayload(blob: ArrayBuffer, passphrase: string): Promise<EncryptedPayload> {
  const bytes = new Uint8Array(blob);

  if (bytes.byteLength < 4 + IV_LENGTH + TAG_LENGTH) {
    throw new Error("加密文件长度无效");
  }

  const magic = new TextDecoder().decode(bytes.subarray(0, 4));
  if (magic !== MAGIC) {
    throw new Error("不是有效的 Badodo Script 加密文件（magic 校验失败）");
  }

  const iv = bytes.subarray(4, 4 + IV_LENGTH);
  const tag = bytes.subarray(4 + IV_LENGTH, 4 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = bytes.subarray(4 + IV_LENGTH + TAG_LENGTH);

  const key = await deriveKey(passphrase);

  // Web Crypto expects the auth tag appended to the ciphertext.
  const data = new Uint8Array(ciphertext.length + TAG_LENGTH);
  data.set(ciphertext, 0);
  data.set(tag, ciphertext.length);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: TAG_LENGTH * 8 },
    key,
    data
  );

  const json = new TextDecoder().decode(plaintext);
  return assertBdsPayload(JSON.parse(json));
}

/** Fetch an encrypted .bds.bin and decrypt it into a payload. */
export async function loadEncrypted(url: string, passphrase: string): Promise<EncryptedPayload> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`加密脚本加载失败: HTTP ${response.status}`);
  const blob = await response.arrayBuffer();
  return decryptPayload(blob, passphrase);
}

/** Fetch, verify, and decrypt a signed artifact for a Badodo engine host. */
export async function loadSignedEncrypted(
  url: string,
  passphrase: string,
  publicKeyPem: string,
  now: Date = new Date(),
  requiredFeature?: string,
): Promise<EncryptedPayload> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`签名脚本加载失败: HTTP ${response.status}`);
  const artifact = await response.json();
  const verified = await verifySignedArtifactBrowser(artifact, publicKeyPem, now, requiredFeature);
  return decryptPayload(verified.payload, passphrase);
}

/** Fetch, verify, decrypt, and execute a signed artifact in the Badodo engine runtime. */
export async function runSignedEncrypted(
  runtime: BadodoRuntime,
  url: string,
  passphrase: string,
  publicKeyPem: string,
  now: Date = new Date(),
  requiredFeature?: string,
): Promise<void> {
  const payload = await loadSignedEncrypted(url, passphrase, publicKeyPem, now, requiredFeature);
  runtime.runCompiled(payload.code, payload.nodeNames);
}

/** Decrypt + execute an encrypted script against the given runtime. */
export async function runEncrypted(runtime: BadodoRuntime, url: string, passphrase: string): Promise<void> {
  const payload = await loadEncrypted(url, passphrase);
  runtime.runCompiled(payload.code, payload.nodeNames);
}
