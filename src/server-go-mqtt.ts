import * as AST from "./ast";
import {
  generateGoServer,
  GoServerArtifacts,
  GoServerGenerationOptions,
  GoServerServiceSpec,
} from "./server-go";

export type GoMQTTQoS = 0 | 1;

export interface GoMQTTRouteSpec {
  /** Canonical service name from GoServerServiceSpec. */
  service: string;
  /** Canonical method name from GoServerMethodSpec. */
  method: string;
  /** Static UTF-8 MQTT topic. Wildcards and templates are rejected. */
  topic: string;
  qos?: GoMQTTQoS;
  retain?: boolean;
}

export interface GoMQTTGenerationOptions extends GoServerGenerationOptions {
  /** Maximum accepted JSON payload size. Defaults to 1 MiB. */
  maxPayloadBytes?: number;
}

export interface GoMQTTArtifacts extends GoServerArtifacts {
  mqtt: string;
}

interface NormalizedRoute {
  service: string;
  method: string;
  request: string;
  response: string;
  topic: string;
  responseTopic: string;
  qos: GoMQTTQoS;
  retain: boolean;
}

/** Generate a constrained JSON request/response MQTT adapter over the Go service boundary. */
export function generateGoMQTT(
  input: AST.Program | AST.SharedDecl[],
  services: GoServerServiceSpec[],
  routes: GoMQTTRouteSpec[],
  options: GoMQTTGenerationOptions = {},
): GoMQTTArtifacts {
  const base = generateGoServer(input, services, options);
  const normalizedRoutes = normalizeRoutes(services, routes);
  const packageName = options.packageName ?? "server";
  const maxPayloadBytes = options.maxPayloadBytes ?? 1024 * 1024;
  assertMaxPayloadBytes(maxPayloadBytes);
  const mqtt = generateMQTTFile(packageName, services, normalizedRoutes, maxPayloadBytes);
  return {
    records: base.records,
    server: base.server,
    mqtt,
    files: { ...base.files, "mqtt.go": mqtt },
  };
}

function normalizeRoutes(services: GoServerServiceSpec[], routes: GoMQTTRouteSpec[]): NormalizedRoute[] {
  if (!Array.isArray(routes) || routes.length === 0) throw new Error("至少需要一个 Go MQTT route");
  const serviceMap = new Map<string, { exported: string; methods: Map<string, { exported: string; request: string; response: string }> }>();
  for (const service of services) {
    const exportedService = goExportName(service.name, "Service");
    serviceMap.set(service.name, {
      exported: exportedService,
      methods: new Map(service.methods.map((method) => [method.name, {
        exported: goExportName(method.name, "Method"),
        request: method.request,
        response: method.response,
      }])),
    });
  }

  const seenTopics = new Set<string>();
  return routes.map((route) => {
    if (!route || typeof route.service !== "string" || route.service.trim() === "") throw new Error("MQTT route service 不能为空");
    if (typeof route.method !== "string" || route.method.trim() === "") throw new Error("MQTT route method 不能为空");
    assertTopic(route.topic);
    const qos = route.qos ?? 0;
    if (qos !== 0 && qos !== 1) throw new Error("MQTT route qos 只支持 0 或 1");
    if (route.retain !== undefined && typeof route.retain !== "boolean") throw new Error("MQTT route retain 必须是 boolean");
    const service = serviceMap.get(route.service);
    if (!service) throw new Error(`MQTT route service 未声明: ${route.service}`);
    const method = service.methods.get(route.method);
    if (!method) throw new Error(`MQTT route method 未声明: ${route.service}.${route.method}`);
    if (seenTopics.has(route.topic)) throw new Error(`重复 MQTT topic: ${route.topic}`);
    seenTopics.add(route.topic);
    return {
      service: service.exported,
      method: method.exported,
      request: method.request,
      response: method.response,
      topic: route.topic,
      responseTopic: `${route.topic}/response`,
      qos,
      retain: route.retain === true,
    };
  });
}

function generateMQTTFile(
  packageName: string,
  services: GoServerServiceSpec[],
  routes: NormalizedRoute[],
  maxPayloadBytes: number,
): string {
  const lines: string[] = [
    `package ${packageName}`,
    "",
    "import (",
    '  "bytes"',
    '  "context"',
    '  "encoding/json"',
    '  "errors"',
    '  "fmt"',
    '  "io"',
    ")",
    "",
    "// This file is a constrained JSON request/response MQTT adapter.",
    "// It does not provide broker clients, authentication, TLS, wildcard topics, or streaming.",
    "type MQTTMessage struct {",
    "  Topic string",
    "  Payload []byte",
    "}",
    "",
    "type MQTTTransport interface {",
    "  Publish(ctx context.Context, topic string, payload []byte, qos byte, retain bool) error",
    "  Subscribe(ctx context.Context, topic string, handler func(context.Context, MQTTMessage) error) error",
    "}",
    "",
    "func decodeMQTTJSON(payload []byte, maxPayloadBytes int64, target any) error {",
    "  if len(payload) == 0 { return errors.New(\"empty MQTT payload\") }",
    "  if int64(len(payload)) > maxPayloadBytes { return errors.New(\"MQTT payload too large\") }",
    "  decoder := json.NewDecoder(bytes.NewReader(payload))",
    "  decoder.DisallowUnknownFields()",
    "  if err := decoder.Decode(target); err != nil { return fmt.Errorf(\"invalid JSON: %w\", err) }",
    "  var extra json.RawMessage",
    "  if err := decoder.Decode(&extra); err != io.EOF {",
    "    if err == nil { return errors.New(\"multiple JSON values\") }",
    "    return fmt.Errorf(\"invalid trailing JSON: %w\", err)",
    "  }",
    "  return nil",
    "}",
    "",
    "type MQTTHandler struct {",
    "  Transport MQTTTransport",
    "  MaxPayloadBytes int64",
  ];
  for (const service of services) lines.push(`  ${goExportName(service.name, "Service")} ${goExportName(service.name, "Service")}Handler`);
  lines.push("}", "");

  const params = ["transport MQTTTransport", ...services.map((service) => {
    const exported = goExportName(service.name, "Service");
    return `${lowerFirst(exported)} ${exported}`;
  })];
  lines.push(`func NewMQTTHandler(${params.join(", ")}) *MQTTHandler {`);
  lines.push("  return &MQTTHandler{");
  lines.push("    Transport: transport,");
  lines.push(`    MaxPayloadBytes: ${maxPayloadBytes},`);
  for (const service of services) {
    const exported = goExportName(service.name, "Service");
    lines.push(`    ${exported}: ${exported}Handler{Impl: ${lowerFirst(exported)}},`);
  }
  lines.push("  }", "}", "");

  lines.push("func (h *MQTTHandler) Register(ctx context.Context) error {");
  for (const route of routes) {
    lines.push(`  if err := h.Transport.Subscribe(ctx, ${JSON.stringify(route.topic)}, h.handle${route.service}${route.method}); err != nil { return err }`);
  }
  lines.push("  return nil", "}", "");

  for (const route of routes) {
    lines.push(`func (h *MQTTHandler) handle${route.service}${route.method}(ctx context.Context, message MQTTMessage) error {`);
    lines.push(`  if message.Topic != ${JSON.stringify(route.topic)} { return errors.New("topic mismatch") }`);
    lines.push(`  var request ${route.request}`);
    lines.push(`  if err := decodeMQTTJSON(message.Payload, h.MaxPayloadBytes, &request); err != nil { return err }`);
    lines.push("  if err := request.Validate(); err != nil { return err }");
    lines.push(`  response, err := h.${route.service}.Handle${route.method}(ctx, request)`);
    lines.push("  if err != nil { return err }");
    lines.push("  if err := response.Validate(); err != nil { return err }");
    lines.push("  payload, err := json.Marshal(response)");
    lines.push("  if err != nil { return err }");
    lines.push(`  return h.Transport.Publish(ctx, ${JSON.stringify(route.responseTopic)}, payload, ${route.qos}, ${route.retain})`);
    lines.push("}", "");
  }
  return lines.join("\n").trim();
}

function assertTopic(topic: string): void {
  if (typeof topic !== "string" || topic.length === 0 || topic.length > 65535 || /[\s\u0000+#{?}*]/.test(topic) || topic.endsWith("/response")) {
    throw new Error(`MQTT topic 必须是静态 UTF-8 topic，且不得包含通配符/模板: ${String(topic)}`);
  }
}

function assertMaxPayloadBytes(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 64 * 1024 * 1024) {
    throw new Error("MQTT maxPayloadBytes 必须是 1 到 67108864 之间的整数");
  }
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function goExportName(name: string, fallback: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  let result = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("") || fallback;
  if (/^[0-9]/.test(result)) result = `${fallback}${result}`;
  if (GO_KEYWORDS.has(result.toLowerCase())) result = `${result}Value`;
  return result;
}

const GO_KEYWORDS = new Set([
  "break", "default", "func", "interface", "select", "case", "defer", "go", "map", "struct", "chan", "else", "goto", "package", "switch", "const", "fallthrough", "if", "range", "type", "continue", "for", "return", "var",
]);
