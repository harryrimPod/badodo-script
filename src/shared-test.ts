import { compile } from "./index";
import { generateSharedArtifacts } from "./shared";

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

console.log("BDS Shared Model conformance\n");

const source = `
@shared type DeviceState:
    id: string
    online: bool
    temperature: f64
    label?: string
`;
const artifacts = generateSharedArtifacts(source);
const schema = artifacts.schema as { $defs: Record<string, any> };
const definition = schema.$defs.DeviceState;

check("shared 声明被解析", artifacts.declarations.length === 1 && artifacts.declarations[0].name === "DeviceState");
check("TypeScript record 投影", artifacts.typescript.includes("export interface DeviceState") && artifacts.typescript.includes("temperature: number;") && artifacts.typescript.includes("label?: string;"));
check("JSON Schema 属性投影", definition.properties.online.type === "boolean" && definition.properties.temperature.type === "number");
check("JSON Schema required 顺序稳定", JSON.stringify(definition.required) === JSON.stringify(["id", "online", "temperature"]));
check("可选字段不进入 required", definition.properties.label.type === "string" && !definition.required.includes("label"));
check("shared 声明不生成运行时代码", compile(source).typescript === "");

const advanced = generateSharedArtifacts(source, {
  schemaVersion: "1.2.0",
  schemaId: "https://example.invalid/schemas/device-state.json",
  fieldMetadata: {
    "DeviceState.temperature": {
      tsName: "temperatureC",
      jsonName: "temperature_c",
      constraints: { minimum: -40, maximum: 150 },
      serializer: { format: "decimal", encoding: "utf-8" },
    },
  },
});
const advancedSchema = advanced.schema as { $id: string; "x-bds-schema-version": string; $defs: Record<string, any> };
const advancedDefinition = advancedSchema.$defs.DeviceState;
check("schema version 和 id", advancedSchema.$id.endsWith("device-state.json") && advancedSchema["x-bds-schema-version"] === "1.2.0");
check("字段 rename 同步到 TypeScript/JSON", advanced.typescript.includes("temperatureC: number;") && advancedDefinition.properties.temperature_c.type === "number");
check("validation constraints 投影", advancedDefinition.properties.temperature_c.minimum === -40 && advancedDefinition.properties.temperature_c.maximum === 150);
check("serializer metadata 投影", advanced.serializerMetadata["DeviceState.temperature"].format === "decimal" && advancedDefinition.properties.temperature_c["x-bds-serializer"].encoding === "utf-8");

let renameRejected = false;
try {
  generateSharedArtifacts(source, { fieldMetadata: { "DeviceState.online": { tsName: "id" } } });
} catch {
  renameRejected = true;
}
check("TypeScript 字段 rename 冲突被拒绝", renameRejected);

let rejected = false;
try {
  generateSharedArtifacts(`
@shared type Empty:
`);
} catch {
  rejected = true;
}
check("空 shared type 被拒绝", rejected);

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
