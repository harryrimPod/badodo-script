import * as AST from "./ast";
import {
  generateGoServer,
  GoServerArtifacts,
  GoServerGenerationOptions,
  GoServerServiceSpec,
} from "./server-go";

export type GoHTTPMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface GoHTTPRouteSpec {
  /** Canonical service name from GoServerServiceSpec. */
  service: string;
  /** Canonical method name from GoServerMethodSpec. */
  method: string;
  httpMethod: GoHTTPMethod;
  /** Static path. Path parameters, query templates and streaming are out of scope. */
  path: string;
}

export interface GoHTTPGenerationOptions extends GoServerGenerationOptions {
  /** Maximum accepted JSON body size. Defaults to 1 MiB. */
  maxBodyBytes?: number;
}

export interface GoHTTPArtifacts extends GoServerArtifacts {
  http: string;
}

interface NormalizedRoute {
  service: string;
  method: string;
  request: string;
  response: string;
  httpMethod: GoHTTPMethod;
  path: string;
}

/** Generate a constrained standard-library net/http adapter over the Go service boundary. */
export function generateGoHTTP(
  input: AST.Program | AST.SharedDecl[],
  services: GoServerServiceSpec[],
  routes: GoHTTPRouteSpec[],
  options: GoHTTPGenerationOptions = {},
): GoHTTPArtifacts {
  const base = generateGoServer(input, services, options);
  const normalizedRoutes = normalizeRoutes(services, routes);
  const packageName = options.packageName ?? "server";
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;
  assertMaxBodyBytes(maxBodyBytes);
  const http = generateHTTPFile(packageName, services, normalizedRoutes, maxBodyBytes);
  return {
    records: base.records,
    server: base.server,
    http,
    files: { ...base.files, "http.go": http },
  };
}

function normalizeRoutes(services: GoServerServiceSpec[], routes: GoHTTPRouteSpec[]): NormalizedRoute[] {
  if (!Array.isArray(routes) || routes.length === 0) throw new Error("至少需要一个 Go HTTP route");
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

  const seen = new Set<string>();
  return routes.map((route) => {
    if (!route || typeof route.service !== "string" || route.service.trim() === "") throw new Error("HTTP route service 不能为空");
    if (typeof route.method !== "string" || route.method.trim() === "") throw new Error("HTTP route method 不能为空");
    if (!HTTP_METHODS.has(route.httpMethod)) throw new Error(`不支持的 HTTP method: ${String(route.httpMethod)}`);
    assertStaticPath(route.path);
    const service = serviceMap.get(route.service);
    if (!service) throw new Error(`HTTP route service 未声明: ${route.service}`);
    const method = service.methods.get(route.method);
    if (!method) throw new Error(`HTTP route method 未声明: ${route.service}.${route.method}`);
    const identity = `${route.httpMethod} ${route.path}`;
    if (seen.has(identity)) throw new Error(`重复 HTTP route: ${identity}`);
    seen.add(identity);
    return {
      service: service.exported,
      method: method.exported,
      request: method.request,
      response: method.response,
      httpMethod: route.httpMethod,
      path: route.path,
    };
  });
}

function generateHTTPFile(
  packageName: string,
  services: GoServerServiceSpec[],
  routes: NormalizedRoute[],
  maxBodyBytes: number,
): string {
  const lines: string[] = [
    `package ${packageName}`,
    "",
    "import (",
    '  "encoding/json"',
    '  "errors"',
    '  "fmt"',
    '  "io"',
    '  "net/http"',
    '  "strings"',
    ")",
    "",
    "// This file is a constrained JSON-only HTTP adapter.",
    "// It does not provide authentication, streaming, MQTT, or route parameters.",
    "type HTTPError struct {",
    '  Code string `json:"code"`',
    '  Message string `json:"message"`',
    "}",
    "",
    "func writeHTTPError(w http.ResponseWriter, status int, code string, err error) {",
    '  w.Header().Set("Content-Type", "application/json")',
    "  w.WriteHeader(status)",
    '  message := "request failed"',
    "  if err != nil { message = err.Error() }",
    "  _ = json.NewEncoder(w).Encode(HTTPError{Code: code, Message: message})",
    "}",
    "",
    "func writeHTTPJSON(w http.ResponseWriter, value any) {",
    '  w.Header().Set("Content-Type", "application/json")',
    "  _ = json.NewEncoder(w).Encode(value)",
    "}",
    "",
    "func decodeHTTPJSON(r *http.Request, maxBodyBytes int64, target any) error {",
    "  if r.Body == nil { return errors.New(\"request body required\") }",
    "  if r.ContentLength > maxBodyBytes { return errors.New(\"request body too large\") }",
    '  contentType := strings.ToLower(r.Header.Get("Content-Type"))',
    '  if contentType != "" && !strings.HasPrefix(contentType, "application/json") { return errors.New("content type must be application/json") }',
    "  limited := &io.LimitedReader{R: r.Body, N: maxBodyBytes + 1}",
    "  decoder := json.NewDecoder(limited)",
    "  decoder.DisallowUnknownFields()",
    "  if err := decoder.Decode(target); err != nil { return fmt.Errorf(\"invalid JSON: %w\", err) }",
    "  if limited.N <= 0 { return errors.New(\"request body too large\") }",
    "  var extra json.RawMessage",
    "  if err := decoder.Decode(&extra); err != io.EOF {",
    "    if err == nil { return errors.New(\"multiple JSON values\") }",
    "    return fmt.Errorf(\"invalid trailing JSON: %w\", err)",
    "  }",
    "  return nil",
    "}",
    "",
    "type HTTPHandler struct {",
  ];
  for (const service of services) lines.push(`  ${goExportName(service.name, "Service")} ${goExportName(service.name, "Service")}Handler`);
  lines.push("}", "");

  const params = services.map((service) => {
    const exported = goExportName(service.name, "Service");
    const field = lowerFirst(exported);
    return `${field} ${exported}`;
  });
  lines.push(`func NewHTTPHandler(${params.join(", ")}) *HTTPHandler {`);
  lines.push("  return &HTTPHandler{");
  for (const service of services) {
    const exported = goExportName(service.name, "Service");
    const field = lowerFirst(exported);
    lines.push(`    ${exported}: ${exported}Handler{Impl: ${field}},`);
  }
  lines.push("  }", "}", "");

  lines.push("func (h *HTTPHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {");
  lines.push("  switch {");
  for (const route of routes) {
    lines.push(`  case r.Method == ${JSON.stringify(route.httpMethod)} && r.URL.Path == ${JSON.stringify(route.path)}:`);
    lines.push(`    var request ${route.request}`);
    lines.push(`    if err := decodeHTTPJSON(r, ${maxBodyBytes}, &request); err != nil { writeHTTPError(w, http.StatusBadRequest, "invalid_request", err); return }`);
    lines.push("    if err := request.Validate(); err != nil { writeHTTPError(w, http.StatusUnprocessableEntity, \"invalid_request\", err); return }");
    lines.push(`    response, err := h.${route.service}.Handle${route.method}(r.Context(), request)`);
    lines.push("    if err != nil { writeHTTPError(w, http.StatusInternalServerError, \"service_error\", err); return }");
    lines.push("    if err := response.Validate(); err != nil { writeHTTPError(w, http.StatusInternalServerError, \"invalid_response\", err); return }");
    lines.push("    writeHTTPJSON(w, response)");
    lines.push("    return");
  }
  lines.push("  default:", '    writeHTTPError(w, http.StatusNotFound, "not_found", errors.New("route not found"))', "  }", "}");
  return lines.join("\n").trim();
}

function assertStaticPath(path: string): void {
  if (typeof path !== "string" || path.length === 0 || path[0] !== "/" || /[\s?#{}]/.test(path)) {
    throw new Error(`HTTP route path 必须是无 query/参数的绝对路径: ${String(path)}`);
  }
}

function assertMaxBodyBytes(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 64 * 1024 * 1024) {
    throw new Error("HTTP maxBodyBytes 必须是 1 到 67108864 之间的整数");
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

const HTTP_METHODS = new Set<GoHTTPMethod>(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const GO_KEYWORDS = new Set([
  "break", "default", "func", "interface", "select", "case", "defer", "go", "map", "struct", "chan", "else", "goto", "package", "switch", "const", "fallthrough", "if", "range", "type", "continue", "for", "return", "var",
]);
