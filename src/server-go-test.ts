import { generateSharedArtifacts } from "./shared";
import { generateGoServer } from "./server-go";

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

console.log("BDS restricted Go Server projection conformance\n");

const artifacts = generateSharedArtifacts(`
@shared type DeviceState:
    id: string
    online: bool
    label?: string
`);
const generated = generateGoServer(artifacts.declarations, [
  {
    name: "device-service",
    methods: [{ name: "get_state", request: "DeviceState", response: "DeviceState" }],
  },
], { packageName: "server" });

check("records file reuses Shared Go projection", generated.records.includes("package server") && generated.records.includes("type DeviceState struct"));
check("service interface projection", generated.server.includes("type DeviceService interface") && generated.server.includes("GetState(ctx context.Context, request DeviceState) (DeviceState, error)"));
check("handler validates request/response", generated.server.includes("func (h DeviceServiceHandler) HandleGetState") && generated.server.includes("request.Validate()") && generated.server.includes("response.Validate()"));
check("transport remains out of scope", !generated.server.includes("net/http") && !generated.server.includes("mqtt"));
check("deterministic output files", Object.keys(generated.files).join(",") === "records.go,server.go");

throws("unknown request type rejected", () => generateGoServer(artifacts.declarations, [
  { name: "Device", methods: [{ name: "get", request: "Missing", response: "DeviceState" }] },
]));
throws("empty service rejected", () => generateGoServer(artifacts.declarations, [{ name: "Device", methods: [] }]));
throws("duplicate method rejected", () => generateGoServer(artifacts.declarations, [
  { name: "Device", methods: [
    { name: "get", request: "DeviceState", response: "DeviceState" },
    { name: "get", request: "DeviceState", response: "DeviceState" },
  ] },
]));

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
