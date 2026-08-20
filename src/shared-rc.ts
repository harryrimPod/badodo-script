import * as AST from "./ast";
import {
  SharedArtifacts,
  SharedGenerationOptions,
  SharedFieldMetadata,
  generateSharedJsonSchema,
} from "./shared";

export interface SharedValidationError {
  path: string;
  keyword: string;
  message: string;
}

export interface SharedValidationResult {
  valid: boolean;
  errors: SharedValidationError[];
}

export interface SchemaCompatibilityIssue {
  path: string;
  reason: string;
}

export interface SchemaCompatibilityReport {
  compatible: boolean;
  breaking: SchemaCompatibilityIssue[];
  warnings: SchemaCompatibilityIssue[];
}

/** Validate one named shared record against the generated JSON Schema. */
export function validateSharedValue(value: unknown, declaration: string, artifacts: SharedArtifacts): SharedValidationResult {
  const root = artifacts.schema as SchemaObject;
  const defs = (root.$defs ?? {}) as Record<string, SchemaObject>;
  const schema = defs[declaration];
  if (!schema) {
    return { valid: false, errors: [{ path: "$", keyword: "declaration", message: `未知 shared type: ${declaration}` }] };
  }
  const errors: SharedValidationError[] = [];
  validateNode(value, schema, "$", root, errors, 0);
  return { valid: errors.length === 0, errors };
}

/** Generate a self-contained TypeScript validator source for shared records. */
export function generateSharedValidatorTypeScript(input: AST.Program | AST.SharedDecl[], options: SharedGenerationOptions = {}): string {
  const schema = generateSharedJsonSchema(input, options);
  const declarations = sharedDeclarations(input);
  const functions = declarations.map((decl) => {
    const functionName = `validate${decl.name}`;
    return [
      `export function ${functionName}(value: unknown): SharedValidationResult {`,
      `  const errors: SharedValidationError[] = [];`,
      `  __bdsValidate(value, __bdsSchema.$defs[${JSON.stringify(decl.name)}], "$", __bdsSchema, errors, 0);`,
      `  return { valid: errors.length === 0, errors };`,
      `}`,
    ].join("\n");
  });
  return [
    `export interface SharedValidationError { path: string; keyword: string; message: string; }`,
    `export interface SharedValidationResult { valid: boolean; errors: SharedValidationError[]; }`,
    `const __bdsSchema: any = ${JSON.stringify(schema, null, 2)};`,
    VALIDATOR_HELPER_SOURCE,
    ...functions,
  ].join("\n\n");
}

/** Compare two generated schemas for wire compatibility. */
export function checkSharedSchemaCompatibility(previous: Record<string, unknown>, next: Record<string, unknown>): SchemaCompatibilityReport {
  const breaking: SchemaCompatibilityIssue[] = [];
  const warnings: SchemaCompatibilityIssue[] = [];
  const previousDefs = (previous.$defs ?? {}) as Record<string, SchemaObject>;
  const nextDefs = (next.$defs ?? {}) as Record<string, SchemaObject>;

  for (const name of Object.keys(previousDefs).sort()) {
    if (!nextDefs[name]) {
      breaking.push({ path: `$defs.${name}`, reason: "shared type 被删除" });
      continue;
    }
    compareDefinition(name, previousDefs[name], nextDefs[name], breaking, warnings);
  }
  for (const name of Object.keys(nextDefs).sort()) {
    if (!previousDefs[name]) warnings.push({ path: `$defs.${name}`, reason: "新增 shared type" });
  }

  const previousVersion = previous["x-bds-schema-version"];
  const nextVersion = next["x-bds-schema-version"];
  if (previousVersion !== undefined && nextVersion !== undefined && previousVersion !== nextVersion) {
    warnings.push({ path: "x-bds-schema-version", reason: `schema version ${String(previousVersion)} → ${String(nextVersion)}` });
  }
  breaking.sort(issueSort);
  warnings.sort(issueSort);
  return { compatible: breaking.length === 0, breaking, warnings };
}

export interface SharedGoGenerationOptions extends SharedGenerationOptions {
  packageName?: string;
}

/** Generate Go records and deterministic Validate methods; no Go runtime dependency. */
export function generateSharedGo(input: AST.Program | AST.SharedDecl[], options: SharedGoGenerationOptions = {}): string {
  const declarations = sharedDeclarations(input);
  const packageName = options.packageName ?? "shared";
  const validators = declarations.map((decl) => ({ decl, lines: goValidator(decl, options) }));
  const needsFmt = validators.some(({ lines }) => lines.some((line) => line.includes("fmt.")));
  const needsRegexp = validators.some(({ lines }) => lines.some((line) => line.includes("regexp.")));
  const imports = [needsFmt ? '  "fmt"' : "", needsRegexp ? '  "regexp"' : ""].filter(Boolean);
  const lines: string[] = [`package ${packageName}`];
  if (imports.length > 0) lines.push("", "import (", ...imports, ")");
  lines.push("");

  for (const { decl, lines: validatorLines } of validators) {
    const names = new Set<string>();
    const wireNames = new Set<string>();
    lines.push(`type ${decl.name} struct {`);
    for (const field of decl.fields) {
      const metadata = metadataFor(options, decl, field);
      const name = goName(metadata.tsName ?? field.name);
      if (names.has(name)) throw new Error(`Go 字段重命名冲突: ${decl.name}.${name}`);
      names.add(name);
      const jsonName = metadata.jsonName ?? field.name;
      if (wireNames.has(jsonName)) throw new Error(`Go JSON 字段重命名冲突: ${decl.name}.${jsonName}`);
      wireNames.add(jsonName);
      const optional = Boolean(field.optional);
      const goType = goTypeName(field.type, optional);
      const tag = `json:"${jsonName}${optional ? ",omitempty" : ""}"`;
      lines.push(`  ${name} ${goType} \`${tag}\``);
      if (metadata.serializer) {
        lines.push(`  // BDS serializer: ${serializerComment(metadata.serializer)}`);
      }
    }
    lines.push("}", "");
    lines.push("// Required-field presence is enforced by the shared JSON Schema; Go zero values remain valid values.");
    lines.push(...validatorLines, "");
  }
  return lines.join("\n").trim();
}

interface SchemaObject {
  type?: string;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  additionalProperties?: boolean;
  $ref?: string;
  $defs?: Record<string, SchemaObject>;
  [key: string]: unknown;
}

function validateNode(value: unknown, schema: SchemaObject, path: string, root: SchemaObject, errors: SharedValidationError[], depth: number): void {
  if (depth > 32) {
    errors.push({ path, keyword: "depth", message: "嵌套深度超过 32" });
    return;
  }
  if (schema.$ref) {
    const name = schema.$ref.replace(/^#\/\$defs\//, "");
    const target = (root.$defs ?? {})[name];
    if (target) validateNode(value, target, path, root, errors, depth + 1);
    return;
  }
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      errors.push({ path, keyword: "type", message: "需要 object" });
      return;
    }
    const object = value as Record<string, unknown>;
    for (const name of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(object, name)) errors.push({ path: joinPath(path, name), keyword: "required", message: "必填字段缺失" });
    }
    const properties = schema.properties ?? {};
    for (const name of Object.keys(object).sort()) {
      const child = properties[name];
      if (!child) {
        if (schema.additionalProperties === false) errors.push({ path: joinPath(path, name), keyword: "additionalProperties", message: "不允许额外字段" });
        continue;
      }
      validateNode(object[name], child, joinPath(path, name), root, errors, depth + 1);
    }
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push({ path, keyword: "type", message: "需要 array" });
      return;
    }
    checkConstraint(value.length, schema, path, "minItems", "数组长度过短", errors);
    checkConstraint(value.length, schema, path, "maxItems", "数组长度过长", errors);
    if (schema.items && Object.keys(schema.items as object).length > 0) {
      for (let i = 0; i < value.length; i++) validateNode(value[i], schema.items as SchemaObject, `${path}[${i}]`, root, errors, depth + 1);
    }
    return;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") {
      errors.push({ path, keyword: "type", message: "需要 string" });
      return;
    }
    if (schema.format === "byte" && !isBase64(value)) errors.push({ path, keyword: "format", message: "需要 base64 字符串" });
    checkConstraint(value.length, schema, path, "minLength", "字符串过短", errors);
    checkConstraint(value.length, schema, path, "maxLength", "字符串过长", errors);
    if (typeof schema.pattern === "string") {
      try {
        if (!new RegExp(schema.pattern).test(value)) errors.push({ path, keyword: "pattern", message: "字符串格式不匹配" });
      } catch {
        errors.push({ path, keyword: "pattern", message: "pattern 无效" });
      }
    }
    return;
  }
  if (schema.type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) errors.push({ path, keyword: "type", message: "需要 integer" });
    else checkNumberConstraints(value, schema, path, errors);
    return;
  }
  if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) errors.push({ path, keyword: "type", message: "需要 number" });
    else checkNumberConstraints(value, schema, path, errors);
    return;
  }
  if (schema.type === "boolean" && typeof value !== "boolean") errors.push({ path, keyword: "type", message: "需要 boolean" });
}

function isBase64(value: string): boolean {
  return value.length === 0 || /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
}

function checkNumberConstraints(value: number, schema: SchemaObject, path: string, errors: SharedValidationError[]): void {
  if (typeof schema.minimum === "number" && value < schema.minimum) errors.push({ path, keyword: "minimum", message: "数值小于 minimum" });
  if (typeof schema.maximum === "number" && value > schema.maximum) errors.push({ path, keyword: "maximum", message: "数值大于 maximum" });
}

function checkConstraint(value: number, schema: SchemaObject, path: string, keyword: string, message: string, errors: SharedValidationError[]): void {
  const limit = schema[keyword];
  if (typeof limit === "number" && (keyword.startsWith("min") ? value < limit : value > limit)) errors.push({ path, keyword, message });
}

function compareDefinition(name: string, previous: SchemaObject, next: SchemaObject, breaking: SchemaCompatibilityIssue[], warnings: SchemaCompatibilityIssue[]): void {
  const path = `$defs.${name}`;
  const previousProperties = previous.properties ?? {};
  const nextProperties = next.properties ?? {};
  const previousRequired = new Set(previous.required ?? []);
  const nextRequired = new Set(next.required ?? []);
  for (const field of Object.keys(previousProperties).sort()) {
    if (!nextProperties[field]) {
      breaking.push({ path: `${path}.properties.${field}`, reason: "字段被删除或 JSON rename" });
      continue;
    }
    compareProperty(`${path}.properties.${field}`, previousProperties[field], nextProperties[field], breaking, warnings);
    if (!previousRequired.has(field) && nextRequired.has(field)) breaking.push({ path: `${path}.required`, reason: `字段 ${field} 从 optional 变为 required` });
    if (previousRequired.has(field) && !nextRequired.has(field)) warnings.push({ path: `${path}.required`, reason: `字段 ${field} 放宽为 optional` });
  }
  for (const field of Object.keys(nextProperties).sort()) {
    if (!previousProperties[field]) {
      if (nextRequired.has(field)) breaking.push({ path: `${path}.properties.${field}`, reason: "新增 required 字段" });
      else warnings.push({ path: `${path}.properties.${field}`, reason: "新增 optional 字段" });
    }
  }
  if (previous.additionalProperties !== next.additionalProperties) {
    if (previous.additionalProperties === false && next.additionalProperties === true) warnings.push({ path, reason: "允许额外字段" });
    if (previous.additionalProperties === true && next.additionalProperties === false) breaking.push({ path, reason: "禁止额外字段" });
  }
}

function compareProperty(path: string, previous: SchemaObject, next: SchemaObject, breaking: SchemaCompatibilityIssue[], warnings: SchemaCompatibilityIssue[]): void {
  const previousType = previous.$ref ?? previous.type;
  const nextType = next.$ref ?? next.type;
  if (previousType !== nextType) {
    breaking.push({ path, reason: `类型从 ${String(previousType)} 变为 ${String(nextType)}` });
    return;
  }
  for (const key of ["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"] as const) {
    const before = previous[key];
    const after = next[key];
    if (typeof before !== "number" || typeof after !== "number" || before === after) continue;
    const tightened = key.startsWith("min") ? after > before : after < before;
    (tightened ? breaking : warnings).push({ path, reason: `${key} 从 ${String(before)} 变为 ${String(after)}` });
  }
  if (previous.pattern !== next.pattern) {
    if (previous.pattern !== undefined && next.pattern === undefined) warnings.push({ path, reason: "pattern 被移除，约束放宽" });
    else breaking.push({ path, reason: "pattern 发生变化" });
  }
  if (previous.format !== next.format) breaking.push({ path, reason: `format 从 ${String(previous.format)} 变为 ${String(next.format)}` });
  if (stableJson(previous["x-bds-serializer"]) !== stableJson(next["x-bds-serializer"])) {
    breaking.push({ path, reason: "serializer metadata 发生变化" });
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sharedDeclarations(input: AST.Program | AST.SharedDecl[]): AST.SharedDecl[] {
  return Array.isArray(input) ? input : input.body.filter((stmt): stmt is AST.SharedDecl => stmt.kind === "SharedDecl");
}

function metadataFor(options: SharedGenerationOptions, decl: AST.SharedDecl, field: AST.SharedField): SharedFieldMetadata {
  return options.fieldMetadata?.[`${decl.name}.${field.name}`] ?? {};
}

function goTypeName(type: AST.TypeRef, optional: boolean): string {
  let result: string;
  switch (type.name) {
    case "bool": result = "bool"; break;
    case "i32": result = "int32"; break;
    case "f64":
    case "number": result = "float64"; break;
    case "string": result = "string"; break;
    case "bytes": result = "[]byte"; break;
    case "array": result = "[]any"; break;
    default: result = type.name; break;
  }
  return optional ? `*${result}` : result;
}

function goName(name: string): string {
  const parts = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const joined = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("") || "Field";
  return /^[0-9]/.test(joined) ? `Field${joined}` : joined;
}

function serializerComment(metadata: NonNullable<SharedFieldMetadata["serializer"]>): string {
  return Object.entries(metadata).map(([key, value]) => `${key}=${value}`).join(" ");
}

function goValidator(decl: AST.SharedDecl, options: SharedGoGenerationOptions): string[] {
  const lines = [`func (v ${decl.name}) Validate() error {`];
  for (const field of decl.fields) {
    const metadata = metadataFor(options, decl, field);
    const constraints = metadata.constraints;
    const name = goName(metadata.tsName ?? field.name);
    const access = field.optional ? `*v.${name}` : `v.${name}`;
    const guard = field.optional ? `v.${name} != nil && ` : ""
    if (!constraints) continue;
    if (["i32", "f64", "number"].includes(field.type.name)) {
      if (constraints.minimum !== undefined) lines.push(`  if ${guard}${access} < ${constraints.minimum} { return fmt.Errorf("${field.name}: minimum") }`);
      if (constraints.maximum !== undefined) lines.push(`  if ${guard}${access} > ${constraints.maximum} { return fmt.Errorf("${field.name}: maximum") }`);
    }
    if (["string", "bytes"].includes(field.type.name)) {
      if (constraints.minLength !== undefined) lines.push(`  if ${guard}len(${access}) < ${constraints.minLength} { return fmt.Errorf("${field.name}: minLength") }`);
      if (constraints.maxLength !== undefined) lines.push(`  if ${guard}len(${access}) > ${constraints.maxLength} { return fmt.Errorf("${field.name}: maxLength") }`);
    }
    if (field.type.name === "array") {
      if (constraints.minItems !== undefined) lines.push(`  if ${guard}len(${access}) < ${constraints.minItems} { return fmt.Errorf("${field.name}: minItems") }`);
      if (constraints.maxItems !== undefined) lines.push(`  if ${guard}len(${access}) > ${constraints.maxItems} { return fmt.Errorf("${field.name}: maxItems") }`);
    }
    if (field.type.name === "string" && constraints.pattern !== undefined) lines.push(`  if ${guard}!regexp.MustCompile(${JSON.stringify(constraints.pattern)}).MatchString(${access}) { return fmt.Errorf("${field.name}: pattern") }`);
  }
  lines.push("  return nil", "}");
  return lines;
}

function joinPath(path: string, name: string): string {
  return path === "$" ? `$.${name}` : `${path}.${name}`;
}

function issueSort(a: SchemaCompatibilityIssue, b: SchemaCompatibilityIssue): number {
  return `${a.path}:${a.reason}`.localeCompare(`${b.path}:${b.reason}`);
}

const VALIDATOR_HELPER_SOURCE = String.raw`function __bdsValidate(value: any, schema: any, path: string, root: any, errors: SharedValidationError[], depth: number): void {
  if (depth > 32) { errors.push({ path, keyword: "depth", message: "嵌套深度超过 32" }); return; }
  if (schema.$ref) { const target = root.$defs[schema.$ref.replace(/^#\/\$defs\//, "")]; if (target) __bdsValidate(value, target, path, root, errors, depth + 1); return; }
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) { errors.push({ path, keyword: "type", message: "需要 object" }); return; }
    for (const name of schema.required || []) if (!Object.prototype.hasOwnProperty.call(value, name)) errors.push({ path: path + "." + name, keyword: "required", message: "必填字段缺失" });
    for (const name of Object.keys(value).sort()) { const child = schema.properties && schema.properties[name]; if (!child) { if (schema.additionalProperties === false) errors.push({ path: path + "." + name, keyword: "additionalProperties", message: "不允许额外字段" }); } else __bdsValidate(value[name], child, path + "." + name, root, errors, depth + 1); }
    return;
  }
  if (schema.type === "array") { if (!Array.isArray(value)) errors.push({ path, keyword: "type", message: "需要 array" }); else { if (schema.minItems !== undefined && value.length < schema.minItems) errors.push({ path, keyword: "minItems", message: "数组长度过短" }); if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push({ path, keyword: "maxItems", message: "数组长度过长" }); if (schema.items && Object.keys(schema.items).length > 0) for (let i = 0; i < value.length; i++) __bdsValidate(value[i], schema.items, path + "[" + i + "]", root, errors, depth + 1); } return; }
  if (schema.type === "string") { if (typeof value !== "string") errors.push({ path, keyword: "type", message: "需要 string" }); else { if (schema.format === "byte" && !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) errors.push({ path, keyword: "format", message: "需要 base64 字符串" }); if (schema.minLength !== undefined && value.length < schema.minLength) errors.push({ path, keyword: "minLength", message: "字符串过短" }); if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push({ path, keyword: "maxLength", message: "字符串过长" }); if (schema.pattern) { try { if (!(new RegExp(schema.pattern)).test(value)) errors.push({ path, keyword: "pattern", message: "字符串格式不匹配" }); } catch { errors.push({ path, keyword: "pattern", message: "pattern 无效" }); } } } return; }
  if (schema.type === "integer") { if (typeof value !== "number" || !Number.isInteger(value)) errors.push({ path, keyword: "type", message: "需要 integer" }); else { if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path, keyword: "minimum", message: "数值小于 minimum" }); if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path, keyword: "maximum", message: "数值大于 maximum" }); } return; }
  if (schema.type === "number") { if (typeof value !== "number" || !Number.isFinite(value)) errors.push({ path, keyword: "type", message: "需要 number" }); else { if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path, keyword: "minimum", message: "数值小于 minimum" }); if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path, keyword: "maximum", message: "数值大于 maximum" }); } return; }
  if (schema.type === "boolean" && typeof value !== "boolean") errors.push({ path, keyword: "type", message: "需要 boolean" });
}`;
