import { generateSharedArtifacts } from "./shared";
import { generateGoHTTP } from "./server-go-http";

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

console.log("BDS Go HTTP adapter projection conformance\n");

const artifacts = generateSharedArtifacts(`
@shared type DeviceState:
    id: string
    online: bool
    label?: string
`);
const services = [{
  name: "device-service",
  methods: [{ name: "get_state", request: "DeviceState", response: "DeviceState" }],
}];
const routes = [{ service: "device-service", method: "get_state", httpMethod: "POST" as const, path: "/v1/device/state" }];
const generated = generateGoHTTP(artifacts.declarations, services, routes, { packageName: "server", maxBodyBytes: 4096 });

check("HTTP artifacts include deterministic files", Object.keys(generated.files).join(",") === "records.go,server.go,http.go");
check("HTTP adapter imports net/http", generated.http.includes('"net/http"') && generated.http.includes("type HTTPHandler struct"));
check("constructor wires service handler", generated.http.includes("func NewHTTPHandler(deviceService DeviceService) *HTTPHandler") && generated.http.includes("DeviceService: DeviceServiceHandler{Impl: deviceService}"));
check("route dispatch is explicit", generated.http.includes('r.Method == "POST" && r.URL.Path == "/v1/device/state"'));
check("JSON ingress enforces body and unknown-field checks", generated.http.includes("io.LimitedReader") && generated.http.includes("DisallowUnknownFields"));
check("request and response validation statuses are explicit", generated.http.includes("http.StatusUnprocessableEntity") && generated.http.includes("invalid_response"));
check("not found response is deterministic", generated.http.includes('http.StatusNotFound, "not_found"'));
check("transport excludes MQTT and streaming", !generated.http.includes("mqtt") && !generated.http.includes("websocket") && !generated.http.includes("io.Copy"));
check("same input yields same HTTP artifact", generateGoHTTP(artifacts.declarations, services, routes, { packageName: "server", maxBodyBytes: 4096 }).http === generated.http);

throws("unknown route service rejected", () => generateGoHTTP(artifacts.declarations, services, [{ ...routes[0], service: "missing" }]));
throws("duplicate route rejected", () => generateGoHTTP(artifacts.declarations, services, [...routes, routes[0]]));
throws("dynamic path rejected", () => generateGoHTTP(artifacts.declarations, services, [{ ...routes[0], path: "/v1/{id}" }]));
throws("oversized body limit rejected", () => generateGoHTTP(artifacts.declarations, services, routes, { maxBodyBytes: 0 }));

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
