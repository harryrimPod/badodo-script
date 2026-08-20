import { tokenize } from "./lexer";
import { parse } from "./parser";
import * as AST from "./ast";

export interface ValidationConstraints {
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
}

export interface SerializerMetadata {
  format?: string;
  encoding?: string;
  contentType?: string;
}

export interface SharedFieldMetadata {
  /** Target-language property name; source BDS field name remains canonical. */
  tsName?: string;
  /** Optional C# property name; source BDS field name remains canonical. */
  csharpName?: string;
  /** Wire/JSON property name; source BDS field name remains canonical. */
  jsonName?: string;
  constraints?: ValidationConstraints;
  serializer?: SerializerMetadata;
}

export interface SharedGenerationOptions {
  schemaVersion?: string;
  schemaId?: string;
  /** Keys use canonical source names: `TypeName.fieldName`. */
  fieldMetadata?: Record<string, SharedFieldMetadata>;
}

export interface SharedArtifacts {
  declarations: AST.SharedDecl[];
  typescript: string;
  schema: Record<string, unknown>;
  schemaJson: string;
  serializerMetadata: Record<string, SerializerMetadata>;
}

/** Parse a source file and project only its @shared type declarations. */
export function generateSharedArtifacts(source: string, options: SharedGenerationOptions = {}): SharedArtifacts {
  const program = parse(tokenize(source));
  const declarations = program.body.filter((stmt): stmt is AST.SharedDecl => stmt.kind === "SharedDecl");
  const schema = generateSharedJsonSchema(declarations, options);
  return {
    declarations,
    typescript: generateSharedTypeScript(declarations, options),
    schema,
    schemaJson: JSON.stringify(schema, null, 2),
    serializerMetadata: collectSerializerMetadata(declarations, options),
  };
}

export function generateSharedTypeScript(input: AST.Program | AST.SharedDecl[], options: SharedGenerationOptions = {}): string {
  const declarations = sharedDeclarations(input);
  return declarations
    .map((decl) => {
      const names = new Set<string>();
      const fields = decl.fields.map((field) => {
        const metadata = metadataFor(options, decl, field);
        const name = metadata.tsName ?? field.name;
        assertProjectionName(name, `TypeScript 字段 ${decl.name}.${field.name}`);
        if (names.has(name)) throw new Error(`TypeScript 字段重命名冲突: ${decl.name}.${name}`);
        names.add(name);
        return `  ${name}${field.optional ? "?" : ""}: ${typeScriptType(field.type)};`;
      }).join("\n");
      return `export interface ${decl.name} {\n${fields}\n}`;
    })
    .join("\n\n");
}

export function generateSharedJsonSchema(input: AST.Program | AST.SharedDecl[], options: SharedGenerationOptions = {}): Record<string, unknown> {
  const declarations = sharedDeclarations(input);
  const defs: Record<string, unknown> = {};
  for (const decl of declarations) {
    const names = new Set<string>();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const field of decl.fields) {
      const metadata = metadataFor(options, decl, field);
      const name = metadata.jsonName ?? field.name;
      if (names.has(name)) throw new Error(`JSON 字段重命名冲突: ${decl.name}.${name}`);
      names.add(name);
      properties[name] = schemaType(field.type, metadata);
      if (!field.optional) required.push(name);
    }
    defs[decl.name] = {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  }
  const schema: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: defs,
  };
  if (options.schemaId) schema.$id = options.schemaId;
  if (options.schemaVersion) schema["x-bds-schema-version"] = options.schemaVersion;
  return schema;
}

function sharedDeclarations(input: AST.Program | AST.SharedDecl[]): AST.SharedDecl[] {
  return Array.isArray(input) ? input : input.body.filter((stmt): stmt is AST.SharedDecl => stmt.kind === "SharedDecl");
}

function metadataFor(options: SharedGenerationOptions, decl: AST.SharedDecl, field: AST.SharedField): SharedFieldMetadata {
  return options.fieldMetadata?.[`${decl.name}.${field.name}`] ?? {};
}

function collectSerializerMetadata(declarations: AST.SharedDecl[], options: SharedGenerationOptions): Record<string, SerializerMetadata> {
  const result: Record<string, SerializerMetadata> = {};
  for (const decl of declarations) {
    for (const field of decl.fields) {
      const serializer = metadataFor(options, decl, field).serializer;
      if (serializer) result[`${decl.name}.${field.name}`] = { ...serializer };
    }
  }
  return result;
}

function typeScriptType(type: AST.TypeRef): string {
  switch (type.name) {
    case "bool": return "boolean";
    case "i32":
    case "f64":
    case "number": return "number";
    case "string": return "string";
    case "bytes": return "Uint8Array";
    case "array": return "unknown[]";
    default: return type.name;
  }
}

function schemaType(type: AST.TypeRef, metadata: SharedFieldMetadata): Record<string, unknown> {
  let schema: Record<string, unknown>;
  switch (type.name) {
    case "bool": schema = { type: "boolean" }; break;
    case "i32": schema = { type: "integer" }; break;
    case "f64":
    case "number": schema = { type: "number" }; break;
    case "string": schema = { type: "string" }; break;
    case "bytes": schema = { type: "string", format: "byte" }; break;
    case "array": schema = { type: "array", items: {} }; break;
    default: schema = { $ref: `#/$defs/${type.name}` }; break;
  }
  if (metadata.constraints) Object.assign(schema, allowedConstraints(metadata.constraints));
  if (metadata.serializer) schema["x-bds-serializer"] = { ...metadata.serializer };
  return schema;
}

function allowedConstraints(constraints: ValidationConstraints): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of ["minLength", "maxLength", "minimum", "maximum", "pattern", "minItems", "maxItems"] as const) {
    const value = constraints[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function assertProjectionName(name: string, label: string): void {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) throw new Error(`${label} 不是合法的 TypeScript 标识符: ${name}`);
}
