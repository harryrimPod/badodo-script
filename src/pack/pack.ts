import { tokenize } from "../lexer";
import { parse } from "../parser";
import { generateTypeScript } from "../generator";
import { collectNodes } from "../runtime/collect-nodes";
import { encryptToBinary, decryptFromBinary } from "./encrypt";
import { assertBdsPayload, BDS_PAYLOAD_VERSION, BdsPayload } from "../payload";

export type PackedPayload = BdsPayload;

/**
 * Compile a .bds source, collect node references, and encrypt the whole
 * payload (node names + compiled JavaScript) into a binary blob.
 */
export function packScript(source: string, passphrase: string): Buffer {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const code = generateTypeScript(ast);
  const nodeNames = collectNodes(ast);

  const payload: PackedPayload = { version: BDS_PAYLOAD_VERSION, nodeNames, code };
  const json = JSON.stringify(payload);
  return encryptToBinary(json, passphrase);
}

/**
 * Decrypt a packed binary blob back into its payload.
 * Used by server-side tooling and round-trip verification.
 */
export function unpackScript(blob: Buffer, passphrase: string): PackedPayload {
  const json = decryptFromBinary(blob, passphrase);
  return assertBdsPayload(JSON.parse(json));
}
