import {
  generateSigningKeyPair,
  issueLicense,
  parseSignedArtifact,
  serializeSignedArtifact,
  signArtifact,
  verifyLicense,
  verifySignedArtifact,
  verifySignedArtifactWithKeyring,
  createRevocationList,
} from "./licensing";
import { packScript, unpackScript } from "./pack/pack";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
  }
}

function rejects(name: string, action: () => unknown): void {
  try {
    action();
    check(name, false);
  } catch {
    check(name, true);
  }
}

console.log("BDS signing and license boundary conformance\n");

const pair = generateSigningKeyPair();
const license = issueLicense({
  subject: "pilot-customer",
  issuedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2027-01-01T00:00:00Z",
  features: ["maplibre", "web3d", "maplibre"],
}, pair.privateKeyPem);
check("Ed25519 key id is stable", pair.keyId === license.claims.keyId && pair.keyId.startsWith("ed25519-"));
check("license features are canonical", license.claims.features.join(",") === "maplibre,web3d");
check("license verifies in validity window", verifyLicense(license, pair.publicKeyPem, new Date("2026-06-01T00:00:00Z"), "web3d").subject === "pilot-customer");

const payload = packScript("speed = 1", "production-signing-fixture-key");
const artifact = signArtifact(payload, license, pair.privateKeyPem);
const serialized = serializeSignedArtifact(artifact);
const verified = verifySignedArtifact(serialized, pair.publicKeyPem, new Date("2026-06-01T00:00:00Z"), "maplibre");
check("signed artifact round-trips", verified.payload.equals(payload) && unpackScript(verified.payload, "production-signing-fixture-key").code === "let speed = 1;" && verified.license.subject === "pilot-customer");
check("signed artifact serialization is deterministic", serializeSignedArtifact(parseSignedArtifact(serialized)).equals(serialized));

const tamperedPayload = JSON.parse(serialized.toString("utf8"));
tamperedPayload.payload = Buffer.from("tampered", "utf8").toString("base64");
rejects("payload tampering is rejected", () => verifySignedArtifact(JSON.stringify(tamperedPayload), pair.publicKeyPem, new Date("2026-06-01T00:00:00Z")));

const tamperedSignature = JSON.parse(serialized.toString("utf8"));
const replacement = tamperedSignature.signature.startsWith("A") ? "B" : "A";
tamperedSignature.signature = `${replacement}${tamperedSignature.signature.slice(1)}`;
rejects("artifact signature tampering is rejected", () => verifySignedArtifact(JSON.stringify(tamperedSignature), pair.publicKeyPem, new Date("2026-06-01T00:00:00Z")));
rejects("expired license is rejected", () => verifyLicense(license, pair.publicKeyPem, new Date("2027-01-01T00:00:01Z")));
rejects("missing feature is rejected", () => verifySignedArtifact(serialized, pair.publicKeyPem, new Date("2026-06-01T00:00:00Z"), "godot"));
rejects("unknown artifact field is rejected", () => verifySignedArtifact(JSON.stringify({ ...artifact, extra: true }), pair.publicKeyPem, new Date("2026-06-01T00:00:00Z")));
check("rotating keyring verifies by artifact keyId", verifySignedArtifactWithKeyring(serialized, { keyring: { [pair.keyId]: pair.publicKeyPem } }, new Date("2026-06-01T00:00:00Z")).keyId === pair.keyId);
rejects("revoked subject is rejected", () => verifySignedArtifactWithKeyring(serialized, { keyring: { [pair.keyId]: pair.publicKeyPem }, revocations: createRevocationList({ revokedSubjects: ["pilot-customer"] }) }, new Date("2026-06-01T00:00:00Z")));
rejects("revoked artifact hash is rejected", () => verifySignedArtifactWithKeyring(serialized, { keyring: { [pair.keyId]: pair.publicKeyPem }, revocations: createRevocationList({ revokedArtifacts: [artifact.payloadSha256] }) }, new Date("2026-06-01T00:00:00Z")));
rejects("unknown keyring entry is rejected", () => verifySignedArtifactWithKeyring(serialized, { keyring: {} }, new Date("2026-06-01T00:00:00Z")));

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
