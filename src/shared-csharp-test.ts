import { generateSharedArtifacts } from "./shared";
import { generateSharedCSharp } from "./shared-csharp";

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
    check(name, false, "未抛出错误");
  } catch {
    check(name, true);
  }
}

console.log("BDS Shared C# projection conformance\n");

const artifacts = generateSharedArtifacts(`
@shared type DeviceState:
    id: string
    online: bool
    count: i32
    ratio: f64
    payload: bytes
    samples: array
    label?: string

@shared type DeviceEnvelope:
    state: DeviceState
`);
const options = {
  namespace: "Badodo.Contracts",
  fieldMetadata: {
    "DeviceState.id": { csharpName: "DeviceId", jsonName: "device_id", constraints: { minLength: 2 } },
    "DeviceState.label": { csharpName: "DisplayLabel", constraints: { pattern: "^[A-Z]" } },
  },
};
const generated = generateSharedCSharp(artifacts.declarations, options);

check("C# artifacts include records.cs", Object.keys(generated.files).join(",") === "records.cs");
check("namespace and class projection", generated.records.includes("namespace Badodo.Contracts;") && generated.records.includes("public sealed class DeviceState"));
check("JSON wire rename and System.Text.Json metadata", generated.records.includes("JsonPropertyName(\"device_id\")") && generated.records.includes("public string DeviceId"));
check("primitive C# type mapping", generated.records.includes("public bool Online") && generated.records.includes("public int Count") && generated.records.includes("public double Ratio") && generated.records.includes("public byte[] Payload"));
check("array and optional mapping", generated.records.includes("List<object?> Samples") && generated.records.includes("public string? DisplayLabel"));
check("wire presence tracking is generated", generated.records.includes("_DeviceIdPresent") && generated.records.includes("_OnlinePresent") && generated.records.includes("_DeviceIdPresent = true"));
check("required validation is generated", generated.records.includes("id: required") && generated.records.includes("online: required"));
check("constraints are projected", generated.records.includes("DeviceId.Length < 2") && generated.records.includes("Regex.IsMatch(DisplayLabel"));
check("nested shared validation is chained", generated.records.includes("DeviceState State") && generated.records.includes("State.Validate()"));
check("nullable context and validator imports", generated.records.includes("#nullable enable") && generated.records.includes("IReadOnlyList<string> Validate()"));
check("same input yields deterministic C#", generateSharedCSharp(artifacts.declarations, options).records === generated.records);

const unknown = generateSharedArtifacts("@shared type Parent:\n    child: Missing\n");
throws("unknown shared type rejected", () => generateSharedCSharp(unknown.declarations));
const keyword = generateSharedArtifacts("@shared type Device:\n    class: string\n");
throws("C# keyword property rejected", () => generateSharedCSharp(keyword.declarations));
const collision = generateSharedArtifacts("@shared type Device:\n    id: string\n    ID: string\n");
throws("case-insensitive property collision rejected", () => generateSharedCSharp(collision.declarations));
throws("invalid C# namespace rejected", () => generateSharedCSharp(artifacts.declarations, { namespace: "Badodo.Contracts-Invalid" }));

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
