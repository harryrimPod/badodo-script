import * as AST from "./ast";
import { generateSharedGo, SharedGoGenerationOptions } from "./shared-rc";

export interface GoServerMethodSpec {
  /** Canonical method name; projected to an exported Go method. */
  name: string;
  /** Name of a declared @shared record. */
  request: string;
  /** Name of a declared @shared record. */
  response: string;
}

export interface GoServerServiceSpec {
  /** Canonical service name; projected to a Go interface and handler. */
  name: string;
  methods: GoServerMethodSpec[];
}

export interface GoServerGenerationOptions extends SharedGoGenerationOptions {}

export interface GoServerArtifacts {
  records: string;
  server: string;
  files: Record<string, string>;
}

/**
 * Generate a transport-neutral Go service boundary over Shared records.
 * HTTP, MQTT, goroutines, channels and framework-specific handlers are out of scope.
 */
export function generateGoServer(
  input: AST.Program | AST.SharedDecl[],
  services: GoServerServiceSpec[],
  options: GoServerGenerationOptions = {},
): GoServerArtifacts {
  const declarations = sharedDeclarations(input);
  const declarationNames = new Set<string>();
  for (const declaration of declarations) {
    if (declarationNames.has(declaration.name)) throw new Error(`重复 shared type: ${declaration.name}`);
    assertGoTypeName(declaration.name);
    declarationNames.add(declaration.name);
  }
  const packageName = options.packageName ?? "server";
  assertPackageName(packageName);
  const normalizedServices = normalizeServices(services, declarationNames);
  const records = generateSharedGo(declarations, { ...options, packageName });
  const server = generateServerFile(packageName, normalizedServices);
  return {
    records,
    server,
    files: {
      "records.go": records,
      "server.go": server,
    },
  };
}

interface NormalizedService {
  name: string;
  methods: Array<{ name: string; request: string; response: string }>;
}

function normalizeServices(services: GoServerServiceSpec[], declarations: Set<string>): NormalizedService[] {
  if (!Array.isArray(services) || services.length === 0) throw new Error("至少需要一个 Go Server service");
  const serviceNames = new Set<string>();
  return services.map((service) => {
    if (!service || typeof service.name !== "string" || service.name.trim() === "") throw new Error("service name 不能为空");
    const name = goExportName(service.name, "Service");
    if (serviceNames.has(name)) throw new Error(`重复 Go Server service: ${name}`);
    serviceNames.add(name);
    if (!Array.isArray(service.methods) || service.methods.length === 0) throw new Error(`service ${name} 至少需要一个 method`);
    const methodNames = new Set<string>();
    const methods = service.methods.map((method) => {
      if (!method || typeof method.name !== "string" || method.name.trim() === "") throw new Error(`${name} method name 不能为空`);
      const methodName = goExportName(method.name, "Method");
      if (methodNames.has(methodName)) throw new Error(`重复 Go Server method: ${name}.${methodName}`);
      methodNames.add(methodName);
      if (!declarations.has(method.request)) throw new Error(`${name}.${methodName} request 不是已声明的 shared type: ${method.request}`);
      if (!declarations.has(method.response)) throw new Error(`${name}.${methodName} response 不是已声明的 shared type: ${method.response}`);
      return { name: methodName, request: method.request, response: method.response };
    });
    return { name, methods };
  });
}

function generateServerFile(packageName: string, services: NormalizedService[]): string {
  const lines: string[] = [
    `package ${packageName}`,
    "",
    'import "context"',
    "",
    "// This file is transport-neutral. Bind these interfaces in an HTTP/MQTT adapter.",
  ];
  for (const service of services) {
    lines.push(`type ${service.name} interface {`);
    for (const method of service.methods) {
      lines.push(`  ${method.name}(ctx context.Context, request ${method.request}) (${method.response}, error)`);
    }
    lines.push("}", "");
    lines.push(`type ${service.name}Handler struct {`);
    lines.push(`  Impl ${service.name}`);
    lines.push("}", "");
    for (const method of service.methods) {
      lines.push(`func (h ${service.name}Handler) Handle${method.name}(ctx context.Context, request ${method.request}) (${method.response}, error) {`);
      lines.push("  if err := request.Validate(); err != nil {");
      lines.push(`    return ${method.response}{}, err`);
      lines.push("  }");
      lines.push(`  response, err := h.Impl.${method.name}(ctx, request)`);
      lines.push("  if err != nil {");
      lines.push(`    return ${method.response}{}, err`);
      lines.push("  }");
      lines.push("  if err := response.Validate(); err != nil {");
      lines.push(`    return ${method.response}{}, err`);
      lines.push("  }");
      lines.push("  return response, nil");
      lines.push("}", "");
    }
  }
  return lines.join("\n").trim();
}

function sharedDeclarations(input: AST.Program | AST.SharedDecl[]): AST.SharedDecl[] {
  return Array.isArray(input) ? input : input.body.filter((stmt): stmt is AST.SharedDecl => stmt.kind === "SharedDecl");
}

function assertPackageName(name: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(name) || GO_KEYWORDS.has(name)) throw new Error(`非法 Go package name: ${name}`);
}

function assertGoTypeName(name: string): void {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || GO_KEYWORDS.has(name)) throw new Error(`非法 Go shared type name: ${name}`);
}

function goExportName(name: string, fallback: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  let result = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("") || fallback;
  if (/^[0-9]/.test(result)) result = `${fallback}${result}`;
  if (GO_KEYWORDS.has(result.toLowerCase())) result = `${result}Value`;
  return result;
}

const GO_KEYWORDS = new Set([
  "break", "default", "func", "interface", "select", "case", "defer", "go", "map", "struct", "chan", "else", "goto", "package", "switch", "const", "fallthrough", "if", "range", "type", "continue", "for", "import", "return", "var",
]);
