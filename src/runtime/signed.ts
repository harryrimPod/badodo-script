import type { BdsLicenseClaims, BdsLicenseEnvelope, BdsRevocationList, BdsSignedArtifact } from "../licensing";

const LICENSE_FORMAT = "BDS-LICENSE-1";
const ARTIFACT_FORMAT = "BDS-SIGNED-1";
const ALGORITHM = "Ed25519";
const VERSION = 1;

export interface BrowserSignedArtifactResult {
  payload: ArrayBuffer;
  license: BdsLicenseClaims;
}

export interface BrowserSignedArtifactKeyringResult extends BrowserSignedArtifactResult {
  keyId: string;
}

/** Verify an Ed25519 signed artifact in a browser before decrypting/executing its BDS payload. */
export async function verifySignedArtifactBrowser(
  input: unknown,
  publicKeyPem: string,
  now: Date = new Date(),
  requiredFeature?: string,
): Promise<BrowserSignedArtifactResult> {
  const artifact = assertArtifact(input);
  const publicKeyDer = pemToDer(publicKeyPem, "PUBLIC KEY");
  const publicKey = await crypto.subtle.importKey("spki", asArrayBuffer(publicKeyDer), { name: ALGORITHM }, false, ["verify"]);
  const keyId = await publicKeyId(publicKeyDer);
  if (artifact.keyId !== keyId || artifact.license.claims.keyId !== keyId) throw new Error("artifact keyId 与验证公钥不匹配");

  const claims = normalizeClaims(artifact.license.claims);
  const licenseSignatureValid = await crypto.subtle.verify(
    { name: ALGORITHM },
    publicKey,
    asArrayBuffer(decodeBase64Url(artifact.license.signature)),
    asArrayBuffer(textBytes(`BDS-LICENSE-SIGNATURE\n${canonicalJson(claims)}`)),
  );
  if (!licenseSignatureValid) throw new Error("license 签名校验失败");
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("验证时间无效");
  if (nowMs < Date.parse(claims.issuedAt)) throw new Error("license 尚未生效");
  if (nowMs > Date.parse(claims.expiresAt)) throw new Error("license 已过期");
  if (requiredFeature !== undefined && !claims.features.includes(requiredFeature)) throw new Error(`license 缺少 feature: ${requiredFeature}`);

  const payload = decodeBase64(artifact.payload);
  if (await sha256(payload) !== artifact.payloadSha256) throw new Error("artifact payload hash 校验失败");
  const unsigned = { ...artifact } as Record<string, unknown>;
  delete unsigned.signature;
  const artifactSignatureValid = await crypto.subtle.verify(
    { name: ALGORITHM },
    publicKey,
    asArrayBuffer(decodeBase64Url(artifact.signature)),
    asArrayBuffer(textBytes(`BDS-ARTIFACT-SIGNATURE\n${canonicalJson(unsigned)}`)),
  );
  if (!artifactSignatureValid) throw new Error("artifact 签名校验失败");
  return { payload: asArrayBuffer(payload), license: claims };
}

/** Browser equivalent of the Node keyring/revocation policy. */
export async function verifySignedArtifactBrowserWithKeyring(
  input: unknown,
  publicKeys: Record<string, string>,
  revocations?: BdsRevocationList,
  now: Date = new Date(),
  requiredFeature?: string,
): Promise<BrowserSignedArtifactKeyringResult> {
  const artifact = assertArtifact(input);
  const publicKeyPem = publicKeys[artifact.keyId];
  if (!publicKeyPem) throw new Error(`未知或已轮换的 license keyId: ${artifact.keyId}`);
  const result = await verifySignedArtifactBrowser(artifact, publicKeyPem, now, requiredFeature);
  if (revocations) {
    if (revocations.version !== 1) throw new Error("revocation list 格式无效");
    if (revocations.revokedKeyIds.includes(artifact.keyId)) throw new Error("artifact 签发密钥已吊销");
    if (revocations.revokedSubjects.includes(result.license.subject)) throw new Error("artifact license subject 已吊销");
    if (revocations.revokedArtifacts.includes(artifact.payloadSha256)) throw new Error("artifact 已吊销");
  }
  return { ...result, keyId: artifact.keyId };
}

function assertArtifact(value: unknown): BdsSignedArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("signed artifact 必须是 object");
  const object = value as Record<string, unknown>;
  exactKeys(object, ["algorithm", "format", "keyId", "license", "payload", "payloadSha256", "signature"]);
  if (object.format !== ARTIFACT_FORMAT || object.algorithm !== ALGORITHM) throw new Error("不支持的 artifact format/algorithm");
  if (typeof object.keyId !== "string" || typeof object.payload !== "string" || typeof object.payloadSha256 !== "string" || typeof object.signature !== "string") throw new Error("signed artifact 字段无效");
  if (!/^[0-9a-f]{64}$/.test(object.payloadSha256)) throw new Error("payloadSha256 无效");
  assertLicense(object.license);
  decodeBase64(object.payload);
  decodeBase64Url(object.signature);
  return object as unknown as BdsSignedArtifact;
}

function assertLicense(value: unknown): asserts value is BdsLicenseEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("license envelope 必须是 object");
  const object = value as Record<string, unknown>;
  exactKeys(object, ["algorithm", "claims", "format", "signature"]);
  if (object.format !== LICENSE_FORMAT || object.algorithm !== ALGORITHM || typeof object.signature !== "string") throw new Error("license envelope 无效");
}

function normalizeClaims(value: unknown): BdsLicenseClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("license claims 必须是 object");
  const object = value as Record<string, unknown>;
  exactKeys(object, ["expiresAt", "features", "issuedAt", "keyId", "subject", "version"]);
  if (object.version !== VERSION || typeof object.keyId !== "string" || !object.keyId || typeof object.subject !== "string" || !object.subject.trim()) throw new Error("license claims 无效");
  const issuedAt = normalizeDate(object.issuedAt);
  const expiresAt = normalizeDate(object.expiresAt);
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) throw new Error("license expiresAt 必须晚于 issuedAt");
  if (!Array.isArray(object.features) || object.features.some((feature) => typeof feature !== "string" || !feature.trim())) throw new Error("license features 无效");
  const features = [...new Set(object.features.map((feature) => feature.trim()))].sort();
  return { version: VERSION, keyId: object.keyId, subject: object.subject.trim(), issuedAt, expiresAt, features };
}

function normalizeDate(value: unknown): string {
  const date = typeof value === "string" ? new Date(value) : new Date(NaN);
  if (!Number.isFinite(date.getTime())) throw new Error("license 日期无效");
  return date.toISOString();
}

function exactKeys(object: Record<string, unknown>, expected: string[]): void {
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error("signed artifact 包含未知或缺失字段");
}

function pemToDer(pem: string, label: string): Uint8Array {
  if (typeof pem !== "string") throw new Error("公钥 PEM 无效");
  const body = pem.replace(`-----BEGIN ${label}-----`, "").replace(`-----END ${label}-----`, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) throw new Error("公钥 PEM 无效");
  return decodeBase64(body);
}

function decodeBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("base64 payload 无效");
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("base64url 签名无效");
  return decodeBase64(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
}

async function publicKeyId(der: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", asArrayBuffer(der)));
  return `ed25519-${[...digest].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function sha256(value: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", asArrayBuffer(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON 不支持非有限数字");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
  }
  throw new Error("canonical JSON 不支持该值");
}
