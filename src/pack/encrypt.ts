import * as crypto from "crypto";

const MAGIC = Buffer.from("BDS1", "ascii");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const MIN_BINARY_LENGTH = MAGIC.length + IV_LENGTH + TAG_LENGTH;

/**
 * Derive a 256-bit AES key from a passphrase using SHA-256.
 * The same passphrase must be provided to the runtime loader to decrypt.
 */
export function deriveKey(passphrase: string): Buffer {
  return crypto.createHash("sha256").update(requirePassphrase(passphrase)).digest();
}

/**
 * Encrypt compiled TypeScript into a binary blob.
 *
 * Binary format:
 *   [magic: "BDS1" (4 bytes)]
 *   [IV (12 bytes)]
 *   [auth tag (16 bytes)]
 *   [ciphertext (AES-256-GCM)]
 *
 * NOTE: This is obfuscation-level protection, not tamper-proof security.
 * The decryption key must exist client-side, so a determined attacker can
 * always recover the original script from memory.
 */
export function encryptToBinary(typescript: string, passphrase: string): Buffer {
  const key = deriveKey(passphrase);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(typescript, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

/**
 * Decrypt a binary blob back into TypeScript source.
 * Used for round-trip verification and by server-side tooling.
 */
export function decryptFromBinary(blob: Buffer, passphrase: string): string {
  const key = deriveKey(passphrase);

  if (!Buffer.isBuffer(blob) || blob.length < MIN_BINARY_LENGTH) {
    throw new Error("加密文件长度无效");
  }

  const magic = blob.subarray(0, 4);
  if (!magic.equals(MAGIC)) {
    throw new Error("不是有效的 Badodo Script 加密文件（magic 校验失败）");
  }

  const iv = blob.subarray(4, 4 + IV_LENGTH);
  const tag = blob.subarray(4 + IV_LENGTH, 4 + IV_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(4 + IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf-8");
}

function requirePassphrase(passphrase: string | undefined): string {
  if (typeof passphrase !== "string" || passphrase.length < 16) {
    throw new Error("加密/解密必须提供至少 16 个字符的 passphrase；请使用 -k/--key 或显式传入密钥");
  }
  return passphrase;
}
