import * as crypto from "crypto";

export const BDS_LICENSE_FORMAT = "BDS-LICENSE-1" as const;
export const BDS_SIGNED_ARTIFACT_FORMAT = "BDS-SIGNED-1" as const;
export const BDS_LICENSE_VERSION = 1 as const;
export const BDS_SIGNATURE_ALGORITHM = "Ed25519" as const;

export interface BdsLicenseClaims {
  version: typeof BDS_LICENSE_VERSION;
  keyId: string;
  subject: string;
  issuedAt: string;
  expiresAt: string;
  features: string[];
}

export type BdsLicenseInput = Omit<BdsLicenseClaims, "version" | "keyId" | "issuedAt" | "expiresAt" | "features"> & {
  keyId?: string;
  issuedAt: string | Date;
  expiresAt: string | Date;
  features?: string[];
};

export interface BdsLicenseEnvelope {
  format: typeof BDS_LICENSE_FORMAT;
  algorithm: typeof BDS_SIGNATURE_ALGORITHM;
  claims: BdsLicenseClaims;
  signature: string;
}

export interface BdsSignedArtifact {
  format: typeof BDS_SIGNED_ARTIFACT_FORMAT;
  algorithm: typeof BDS_SIGNATURE_ALGORITHM;
  keyId: string;
  payload: string;
  payloadSha256: string;
  license: BdsLicenseEnvelope;
  signature: string;
}

export interface BdsSigningKeyPair {
  privateKeyPem: string;
  publicKeyPem: string;
  keyId: string;
}

export interface BdsRevocationList {
  version: 1;
  revokedKeyIds: string[];
  revokedSubjects: string[];
  revokedArtifacts: string[];
}

export interface BdsVerificationPolicy {
  /** Rotating issuer public keys indexed by the artifact keyId. */
  keyring: Record<string, crypto.KeyObject | string>;
  revocations?: BdsRevocationList;
  allowedSubjects?: readonly string[];
}

/** Generate an Ed25519 key pair for an issuer. Keep the private key on the release side only. */
export function generateSigningKeyPair(): BdsSigningKeyPair {
  const pair = crypto.generateKeyPairSync("ed25519", {
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" },
  });
  return {
    privateKeyPem: pair.privateKey,
    publicKeyPem: pair.publicKey,
    keyId: publicKeyId(pair.publicKey),
  };
}

/** Derive a stable short identifier from the issuer public key. */
export function publicKeyId(publicKey: crypto.KeyObject | string): string {
  const key = typeof publicKey === "string" ? crypto.createPublicKey(publicKey) : publicKey.type === "private" ? crypto.createPublicKey(publicKey) : publicKey;
  const der = key.export({ format: "der", type: "spki" }) as Buffer;
  return `ed25519-${crypto.createHash("sha256").update(der).digest("hex").slice(0, 16)}`;
}

/** Issue a time-bounded license. The private key never belongs in the client runtime. */
export function issueLicense(input: BdsLicenseInput, privateKey: crypto.KeyObject | string): BdsLicenseEnvelope {
  const issuerKey = asPrivateKey(privateKey);
  const issuerKeyId = publicKeyId(crypto.createPublicKey(issuerKey));
  const claims = normalizeClaims({
    version: BDS_LICENSE_VERSION,
    keyId: input.keyId ?? issuerKeyId,
    subject: input.subject,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    features: input.features ?? [],
  });
  if (claims.keyId !== issuerKeyId) throw new Error("license keyId 与签发私钥不匹配");
  const signature = signBytes(licenseSigningBytes(claims), issuerKey);
  return { format: BDS_LICENSE_FORMAT, algorithm: BDS_SIGNATURE_ALGORITHM, claims, signature };
}

/** Verify issuer signature, schema, validity window, and an optional feature entitlement. */
export function verifyLicense(
  license: unknown,
  publicKey: crypto.KeyObject | string,
  now: Date = new Date(),
  requiredFeature?: string,
): BdsLicenseClaims {
  assertLicenseEnvelope(license);
  const envelope = license as BdsLicenseEnvelope;
  const claims = normalizeClaims(envelope.claims);
  const keyId = publicKeyId(publicKey);
  if (claims.keyId !== keyId) throw new Error("license keyId 与验证公钥不匹配");
  if (!verifyBytes(licenseSigningBytes(claims), publicKey, decodeBase64Url(envelope.signature))) {
    throw new Error("license 签名校验失败");
  }
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("验证时间无效");
  if (nowMs < Date.parse(claims.issuedAt)) throw new Error("license 尚未生效");
  if (nowMs > Date.parse(claims.expiresAt)) throw new Error("license 已过期");
  if (requiredFeature !== undefined && !claims.features.includes(requiredFeature)) {
    throw new Error(`license 缺少 feature: ${requiredFeature}`);
  }
  return claims;
}

/** Sign an encrypted/compiled artifact without placing the issuer private key in the artifact. */
export function signArtifact(payload: Buffer, license: BdsLicenseEnvelope, privateKey: crypto.KeyObject | string): BdsSignedArtifact {
  assertLicenseEnvelope(license);
  const issuerKey = asPrivateKey(privateKey);
  const keyId = publicKeyId(crypto.createPublicKey(issuerKey));
  if (license.claims.keyId !== keyId) throw new Error("artifact keyId 与签发私钥不匹配");
  const unsigned: Omit<BdsSignedArtifact, "signature"> = {
    format: BDS_SIGNED_ARTIFACT_FORMAT,
    algorithm: BDS_SIGNATURE_ALGORITHM,
    keyId,
    payload: payload.toString("base64"),
    payloadSha256: sha256(payload),
    license,
  };
  return { ...unsigned, signature: signBytes(artifactSigningBytes(unsigned), issuerKey) };
}

/** Serialize a signed artifact as deterministic UTF-8 JSON. */
export function serializeSignedArtifact(artifact: BdsSignedArtifact): Buffer {
  assertSignedArtifact(artifact);
  return Buffer.from(canonicalJson(artifact), "utf8");
}

/** Verify the artifact signature and license, then return the authenticated payload. */
export function verifySignedArtifact(
  input: Buffer | string | BdsSignedArtifact,
  publicKey: crypto.KeyObject | string,
  now: Date = new Date(),
  requiredFeature?: string,
): { payload: Buffer; license: BdsLicenseClaims } {
  const artifact = parseSignedArtifact(input);
  const claims = verifyLicense(artifact.license, publicKey, now, requiredFeature);
  const keyId = publicKeyId(publicKey);
  if (artifact.keyId !== keyId || artifact.license.claims.keyId !== keyId) throw new Error("artifact keyId 与验证公钥不匹配");
  const payload = decodeBase64(artifact.payload);
  if (sha256(payload) !== artifact.payloadSha256) throw new Error("artifact payload hash 校验失败");
  if (!verifyBytes(artifactSigningBytes({ ...artifact, signature: undefined } as Omit<BdsSignedArtifact, "signature">), publicKey, decodeBase64Url(artifact.signature))) {
    throw new Error("artifact 签名校验失败");
  }
  return { payload, license: claims };
}

/** Verify a signed artifact against a rotating issuer keyring and revocation policy. */
export function verifySignedArtifactWithKeyring(
  input: Buffer | string | BdsSignedArtifact,
  policy: BdsVerificationPolicy,
  now: Date = new Date(),
  requiredFeature?: string,
): { payload: Buffer; license: BdsLicenseClaims; keyId: string } {
  const artifact = parseSignedArtifact(input);
  const publicKey = policy.keyring[artifact.keyId];
  if (!publicKey) throw new Error(`未知或已轮换的 license keyId: ${artifact.keyId}`);
  const result = verifySignedArtifact(artifact, publicKey, now, requiredFeature);
  const revocations = policy.revocations;
  if (revocations) {
    assertRevocationList(revocations);
    if (revocations.revokedKeyIds.includes(artifact.keyId)) throw new Error("artifact 签发密钥已吊销");
    if (revocations.revokedSubjects.includes(result.license.subject)) throw new Error("artifact license subject 已吊销");
    if (revocations.revokedArtifacts.includes(artifact.payloadSha256)) throw new Error("artifact 已吊销");
  }
  if (policy.allowedSubjects && !policy.allowedSubjects.includes(result.license.subject)) throw new Error("license subject 不在允许列表");
  return { ...result, keyId: artifact.keyId };
}

/** Normalize a revocation list for deterministic storage and audit diffs. */
export function createRevocationList(input: Partial<BdsRevocationList> = {}): BdsRevocationList {
  const normalize = (values: unknown): string[] => {
    if (values === undefined) return [];
    if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value.trim())) throw new Error("revocation list 条目无效");
    return [...new Set(values.map((value) => value.trim()))].sort();
  };
  return {
    version: 1,
    revokedKeyIds: normalize(input.revokedKeyIds),
    revokedSubjects: normalize(input.revokedSubjects),
    revokedArtifacts: normalize(input.revokedArtifacts),
  };
}

export function parseSignedArtifact(input: Buffer | string | BdsSignedArtifact): BdsSignedArtifact {
  let value: unknown = input;
  if (Buffer.isBuffer(input)) value = JSON.parse(input.toString("utf8"));
  else if (typeof input === "string") value = JSON.parse(input);
  assertSignedArtifact(value);
  return value as BdsSignedArtifact;
}

function licenseSigningBytes(claims: BdsLicenseClaims): Buffer {
  return Buffer.from(`BDS-LICENSE-SIGNATURE\n${canonicalJson(claims)}`, "utf8");
}

function artifactSigningBytes(artifact: Omit<BdsSignedArtifact, "signature">): Buffer {
  const { signature: _ignored, ...unsigned } = artifact as Omit<BdsSignedArtifact, "signature"> & { signature?: unknown };
  return Buffer.from(`BDS-ARTIFACT-SIGNATURE\n${canonicalJson(unsigned)}`, "utf8");
}

function signBytes(data: Buffer, privateKey: crypto.KeyObject): string {
  return encodeBase64Url(crypto.sign(null, data, privateKey));
}

function asPrivateKey(value: crypto.KeyObject | string): crypto.KeyObject {
  return typeof value === "string" ? crypto.createPrivateKey(value) : value;
}

function verifyBytes(data: Buffer, publicKey: crypto.KeyObject | string, signature: Buffer): boolean {
  return crypto.verify(null, data, publicKey, signature);
}

function normalizeClaims(value: unknown): BdsLicenseClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("license claims 必须是 object");
  const object = value as Record<string, unknown>;
  assertExactKeys(object, ["expiresAt", "features", "issuedAt", "keyId", "subject", "version"], "license claims");
  if (object.version !== BDS_LICENSE_VERSION) throw new Error("不支持的 license version");
  if (typeof object.keyId !== "string" || !object.keyId) throw new Error("license keyId 无效");
  if (typeof object.subject !== "string" || !object.subject.trim()) throw new Error("license subject 无效");
  const issuedAt = normalizeDate(object.issuedAt);
  const expiresAt = normalizeDate(object.expiresAt);
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) throw new Error("license expiresAt 必须晚于 issuedAt");
  if (!Array.isArray(object.features) || object.features.some((feature) => typeof feature !== "string" || !feature.trim())) {
    throw new Error("license features 无效");
  }
  const features = [...new Set(object.features.map((feature) => feature.trim()))].sort();
  return { version: BDS_LICENSE_VERSION, keyId: object.keyId, subject: object.subject.trim(), issuedAt, expiresAt, features };
}

function normalizeDate(value: unknown): string {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : new Date(NaN);
  if (!Number.isFinite(date.getTime())) throw new Error("license 日期无效");
  return date.toISOString();
}

function assertLicenseEnvelope(value: unknown): asserts value is BdsLicenseEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("license envelope 必须是 object");
  const object = value as Record<string, unknown>;
  assertExactKeys(object, ["algorithm", "claims", "format", "signature"], "license envelope");
  if (object.format !== BDS_LICENSE_FORMAT || object.algorithm !== BDS_SIGNATURE_ALGORITHM) throw new Error("不支持的 license format/algorithm");
  if (typeof object.signature !== "string") throw new Error("license signature 无效");
}

function assertSignedArtifact(value: unknown): asserts value is BdsSignedArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("signed artifact 必须是 object");
  const object = value as Record<string, unknown>;
  assertExactKeys(object, ["algorithm", "format", "keyId", "license", "payload", "payloadSha256", "signature"], "signed artifact");
  if (object.format !== BDS_SIGNED_ARTIFACT_FORMAT || object.algorithm !== BDS_SIGNATURE_ALGORITHM) throw new Error("不支持的 artifact format/algorithm");
  if (typeof object.keyId !== "string" || typeof object.payload !== "string" || typeof object.payloadSha256 !== "string" || typeof object.signature !== "string") {
    throw new Error("signed artifact 字段无效");
  }
  if (!/^[0-9a-f]{64}$/.test(object.payloadSha256)) throw new Error("payloadSha256 无效");
  assertLicenseEnvelope(object.license);
  decodeBase64(object.payload);
  decodeBase64Url(object.signature);
}

function assertRevocationList(value: unknown): asserts value is BdsRevocationList {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("revocation list 必须是 object");
  const object = value as Record<string, unknown>;
  assertExactKeys(object, ["revokedArtifacts", "revokedKeyIds", "revokedSubjects", "version"], "revocation list");
  if (object.version !== 1 || !Array.isArray(object.revokedKeyIds) || !Array.isArray(object.revokedSubjects) || !Array.isArray(object.revokedArtifacts)) throw new Error("revocation list 格式无效");
}

function assertExactKeys(object: Record<string, unknown>, expected: string[], label: string): void {
  const actual = Object.keys(object).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(`${label} 包含未知或缺失字段`);
}

function sha256(value: Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function encodeBase64Url(value: Buffer): string {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("base64url 签名无效");
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function decodeBase64(value: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("base64 payload 无效");
  return Buffer.from(value, "base64");
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
