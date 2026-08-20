import { generateSharedArtifacts } from "./shared";
import { generateGoMQTT } from "./server-go-mqtt";

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

console.log("BDS Go MQTT adapter projection conformance\n");

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
const routes = [{ service: "device-service", method: "get_state", topic: "bds/device/get", qos: 1 as const, retain: false }];
const generated = generateGoMQTT(artifacts.declarations, services, routes, { packageName: "server", maxPayloadBytes: 4096 });

check("MQTT artifacts include deterministic files", Object.keys(generated.files).join(",") === "records.go,server.go,mqtt.go");
check("MQTT transport interface is explicit", generated.mqtt.includes("type MQTTTransport interface") && generated.mqtt.includes("Subscribe") && generated.mqtt.includes("Publish"));
check("constructor wires transport and service", generated.mqtt.includes("func NewMQTTHandler(transport MQTTTransport, deviceService DeviceService)") && generated.mqtt.includes("Transport: transport"));
check("registration uses exact topic", generated.mqtt.includes('Subscribe(ctx, "bds/device/get"'));
check("response topic and QoS are deterministic", generated.mqtt.includes('"bds/device/get/response"') && generated.mqtt.includes("payload, 1, false"));
check("JSON ingress rejects unknown and oversized payloads", generated.mqtt.includes("DisallowUnknownFields") && generated.mqtt.includes("MaxPayloadBytes"));
check("request and response validation are chained", generated.mqtt.includes("request.Validate()") && generated.mqtt.includes("response.Validate()"));
check("empty and multiple JSON payloads are rejected", generated.mqtt.includes("empty MQTT payload") && generated.mqtt.includes("multiple JSON values"));
check("transport excludes broker/runtime policy", !generated.mqtt.includes("paho") && !generated.mqtt.includes("mqtt.Client") && !generated.mqtt.includes("BrokerClient"));
check("same input yields same MQTT artifact", generateGoMQTT(artifacts.declarations, services, routes, { packageName: "server", maxPayloadBytes: 4096 }).mqtt === generated.mqtt);

throws("unknown route service rejected", () => generateGoMQTT(artifacts.declarations, services, [{ ...routes[0], service: "missing" }]));
throws("duplicate topic rejected", () => generateGoMQTT(artifacts.declarations, services, [...routes, routes[0]]));
throws("wildcard topic rejected", () => generateGoMQTT(artifacts.declarations, services, [{ ...routes[0], topic: "bds/+/get" }]));
throws("dynamic topic rejected", () => generateGoMQTT(artifacts.declarations, services, [{ ...routes[0], topic: "bds/device/{id}" }]));
throws("response topic suffix is reserved", () => generateGoMQTT(artifacts.declarations, services, [{ ...routes[0], topic: "bds/device/get/response" }]));
throws("invalid payload limit rejected", () => generateGoMQTT(artifacts.declarations, services, routes, { maxPayloadBytes: 0 }));

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
