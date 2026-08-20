import { generateSharedArtifacts } from "./shared";
import { transpileModule, ScriptTarget, ModuleKind } from "typescript";
import {
  checkSharedSchemaCompatibility,
  generateSharedGo,
  generateSharedValidatorTypeScript,
  validateSharedValue,
} from "./shared-rc";

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

function throws(name: string, action: () => unknown): void {
  try {
    action();
    check(name, false, "未抛出异常");
  } catch {
    check(name, true);
  }
}

console.log("BDS Shared Model RC conformance\n");

const source = `
@shared type DeviceState:
    id: string
    online: bool
    temperature: f64
    label?: string
`;
const options = {
  schemaVersion: "1.2.0",
  fieldMetadata: {
    "DeviceState.temperature": {
      tsName: "temperatureC",
      jsonName: "temperature_c",
      constraints: { minimum: -40, maximum: 150 },
      serializer: { format: "decimal" },
    },
  },
};
const artifacts = generateSharedArtifacts(source, options);

const valid = validateSharedValue({ id: "D-1", online: true, temperature_c: 20 }, "DeviceState", artifacts);
check("valid shared value", valid.valid, JSON.stringify(valid.errors));

const invalid = validateSharedValue({ online: true, temperature_c: 200, extra: 1 }, "DeviceState", artifacts);
check("required/type/extra errors", !invalid.valid && invalid.errors.some((error) => error.keyword === "required") && invalid.errors.some((error) => error.keyword === "maximum") && invalid.errors.some((error) => error.keyword === "additionalProperties"));
check("validator error paths deterministic", invalid.errors[0]?.path === "$.id");

const validatorSource = generateSharedValidatorTypeScript(artifacts.declarations, options);
check("TypeScript validator source", validatorSource.includes("validateDeviceState") && validatorSource.includes("SharedValidationResult"));
const validatorCompile = transpileModule(validatorSource, {
  compilerOptions: { target: ScriptTarget.ES2020, module: ModuleKind.ESNext },
  reportDiagnostics: true,
});
check("TypeScript validator source compiles", !validatorCompile.diagnostics?.length);

const go = generateSharedGo(artifacts.declarations, options);
check("Go struct projection", go.includes("type DeviceState struct") && go.includes("TemperatureC float64 `json:\"temperature_c\"`") && go.includes("Label *string `json:\"label,omitempty\"`"));
check("Go validator projection", go.includes("func (v DeviceState) Validate() error") && go.includes("minimum"));
check("Go serializer comment", go.includes("BDS serializer: format=decimal"));

const invalidPatternSource = `
@shared type Patterned:
    value: string
`;
const invalidPatternOptions = { fieldMetadata: { "Patterned.value": { constraints: { pattern: "[" } } } };
const invalidPatternValidator = generateSharedValidatorTypeScript(
  generateSharedArtifacts(invalidPatternSource).declarations,
  invalidPatternOptions,
);
check("generated validator handles invalid pattern", invalidPatternValidator.includes("pattern 无效"));

const bytesArtifacts = generateSharedArtifacts(`
@shared type BytePacket:
    payload: bytes
`);
const invalidBytes = validateSharedValue({ payload: "not-base64!" }, "BytePacket", bytesArtifacts);
check("bytes format validates base64", !invalidBytes.valid && invalidBytes.errors.some((error) => error.keyword === "format"));

throws("Go JSON rename collision rejected", () => generateSharedGo(artifacts.declarations, {
  fieldMetadata: {
    "DeviceState.id": { jsonName: "same" },
    "DeviceState.online": { jsonName: "same" },
  },
}));

const arraySource = `
@shared type Batch:
    values: array
`;
const arraySchema = generateSharedArtifacts(arraySource).schema as any;
check("array schema contains items", Object.prototype.hasOwnProperty.call(arraySchema.$defs.Batch.properties.values, "items"));

const previous = generateSharedArtifacts(`
@shared type DeviceState:
    id: string
`);
const optionalAddition = generateSharedArtifacts(`
@shared type DeviceState:
    id: string
    label?: string
`);
const requiredAddition = generateSharedArtifacts(`
@shared type DeviceState:
    id: string
    label: string
`);
const changedType = generateSharedArtifacts(`
@shared type DeviceState:
    id: bool
`);
const optionalReport = checkSharedSchemaCompatibility(previous.schema, optionalAddition.schema);
const requiredReport = checkSharedSchemaCompatibility(previous.schema, requiredAddition.schema);
const typeReport = checkSharedSchemaCompatibility(previous.schema, changedType.schema);
check("optional field addition compatible", optionalReport.compatible && optionalReport.warnings.length === 1);
check("required field addition breaking", !requiredReport.compatible && requiredReport.breaking.some((issue) => issue.reason.includes("required")));
check("type change breaking", !typeReport.compatible && typeReport.breaking.some((issue) => issue.path.includes("id")));

const serializerPrevious = generateSharedArtifacts(`
@shared type Encoded:
    value: string
`, { fieldMetadata: { "Encoded.value": { serializer: { format: "decimal" } } } });
const serializerNext = generateSharedArtifacts(`
@shared type Encoded:
    value: string
`, { fieldMetadata: { "Encoded.value": { serializer: { format: "hex" } } } });
const serializerReport = checkSharedSchemaCompatibility(serializerPrevious.schema, serializerNext.schema);
check("serializer metadata change breaking", !serializerReport.compatible && serializerReport.breaking.some((issue) => issue.reason.includes("serializer")));

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
