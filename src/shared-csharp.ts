import * as AST from "./ast";
import { SharedFieldMetadata, SharedGenerationOptions, ValidationConstraints } from "./shared";

export interface SharedCSharpGenerationOptions extends SharedGenerationOptions {
  /** C# namespace for generated DTOs. Defaults to `Badodo.Generated`. */
  namespace?: string;
}

export interface SharedCSharpArtifacts {
  records: string;
  files: Record<string, string>;
}

/** Generate nullable-aware C# DTOs with System.Text.Json names and schema-aligned validation. */
export function generateSharedCSharp(
  input: AST.Program | AST.SharedDecl[],
  options: SharedCSharpGenerationOptions = {},
): SharedCSharpArtifacts {
  const declarations = sharedDeclarations(input);
  const namespaceName = options.namespace ?? "Badodo.Generated";
  assertNamespace(namespaceName);
  const declarationNames = new Set(declarations.map((declaration) => declaration.name));
  const typeNames = new Map(declarations.map((declaration) => [declaration.name, csharpTypeName(declaration.name)]));
  const names = new Set<string>();
  for (const declaration of declarations) {
    const typeName = typeNames.get(declaration.name)!;
    if (names.has(typeName)) throw new Error(`C# type name collision: ${typeName}`);
    names.add(typeName);
    assertCSharpIdentifier(typeName, `C# type ${declaration.name}`);
    for (const field of declaration.fields) {
      const metadata = metadataFor(options, declaration, field);
      const propertyName = csharpPropertyName(metadata, field.name);
      assertCSharpIdentifier(propertyName, `C# field ${declaration.name}.${field.name}`);
      if (declaration.fields.filter((item) => csharpPropertyName(metadataFor(options, declaration, item), item.name).toLowerCase() === propertyName.toLowerCase()).length > 1) {
        throw new Error(`C# 字段重命名冲突: ${declaration.name}.${propertyName}`);
      }
      if (isNamedType(field.type) && !declarationNames.has(field.type.name)) {
        throw new Error(`C# field ${declaration.name}.${field.name} 引用了未知 shared type: ${field.type.name}`);
      }
      assertConstraintCompatibility(field.type, metadata.constraints, `${declaration.name}.${field.name}`);
    }
  }

  const lines: string[] = [
    "#nullable enable",
    "using System;",
    "using System.Collections.Generic;",
    "using System.Text.Json.Serialization;",
  ];
  if (declarations.some((declaration) => declaration.fields.some((field) => Boolean(metadataFor(options, declaration, field).constraints?.pattern)))) {
    lines.push("using System.Text.RegularExpressions;");
  }
  lines.push("", `namespace ${namespaceName};`, "");
  for (const declaration of declarations) {
    lines.push(...generateDeclaration(declaration, options, typeNames), "");
  }
  const records = lines.join("\n").trim();
  return { records, files: { "records.cs": records } };
}

function generateDeclaration(
  declaration: AST.SharedDecl,
  options: SharedCSharpGenerationOptions,
  typeNames: Map<string, string>,
): string[] {
  const lines = [`public sealed class ${typeNames.get(declaration.name)!}`, "{"];
  for (const field of declaration.fields) {
    const metadata = metadataFor(options, declaration, field);
    const propertyName = csharpPropertyName(metadata, field.name);
    const type = csharpFieldType(field.type, Boolean(field.optional), typeNames);
    const backingType = type;
    const initial = needsNullInitialization(field.type, Boolean(field.optional)) ? " = null!;" : ";";
    lines.push(`  private ${backingType} _${propertyName}${initial}`);
    lines.push(`  private bool _${propertyName}Present;`);
    lines.push(`  [JsonPropertyName(${jsonString(metadata.jsonName ?? field.name)})]`);
    lines.push(`  public ${type} ${propertyName} { get => _${propertyName}; init { _${propertyName} = value; _${propertyName}Present = true; } }`);
  }
  lines.push("", "  public IReadOnlyList<string> Validate()", "  {", "    var errors = new List<string>();");
  for (const field of declaration.fields) lines.push(...generateFieldValidation(declaration, field, options, typeNames));
  lines.push("    return errors;", "  }", "}");
  return lines;
}

function generateFieldValidation(
  declaration: AST.SharedDecl,
  field: AST.SharedField,
  options: SharedCSharpGenerationOptions,
  typeNames: Map<string, string>,
): string[] {
  const metadata = metadataFor(options, declaration, field);
  const propertyName = csharpPropertyName(metadata, field.name);
  const lines: string[] = [];
  if (!field.optional) lines.push(`    if (!_${propertyName}Present) errors.Add(${jsonString(`${field.name}: required`)});`);
  if (isNullableReference(field.type) || field.optional && isNullableValue(field.type)) {
    lines.push(`    if (${propertyName} is null${field.optional ? " && _" + propertyName + "Present" : ""}) errors.Add(${jsonString(`${field.name}: type`)});`);
  }
  if (isNamedType(field.type)) {
    const guard = field.optional ? `${propertyName} is not null` : `${propertyName} is not null`;
    lines.push(`    if (${guard}) foreach (var nestedError in ${propertyName}.Validate()) errors.Add(${jsonString(field.name + ".")} + nestedError);`);
  }
  const constraints = metadata.constraints;
  if (constraints) lines.push(...generateConstraints(propertyName, field.type, constraints, Boolean(field.optional)));
  return lines;
}

function generateConstraints(propertyName: string, type: AST.TypeRef, constraints: ValidationConstraints, optional: boolean): string[] {
  const lines: string[] = [];
  const access = `${propertyName}`;
  const nullableGuard = optional || isNullableReference(type) ? `${access} is not null && ` : "";
  if (constraints.minLength !== undefined) lines.push(`    if (${nullableGuard}${access}.Length < ${constraints.minLength}) errors.Add(${jsonString(`${propertyName}: minLength`)});`);
  if (constraints.maxLength !== undefined) lines.push(`    if (${nullableGuard}${access}.Length > ${constraints.maxLength}) errors.Add(${jsonString(`${propertyName}: maxLength`)});`);
  if (constraints.minItems !== undefined) lines.push(`    if (${nullableGuard}${access}.Count < ${constraints.minItems}) errors.Add(${jsonString(`${propertyName}: minItems`)});`);
  if (constraints.maxItems !== undefined) lines.push(`    if (${nullableGuard}${access}.Count > ${constraints.maxItems}) errors.Add(${jsonString(`${propertyName}: maxItems`)});`);
  if (constraints.minimum !== undefined) lines.push(`    if (${nullableGuard}${access} < ${constraints.minimum}) errors.Add(${jsonString(`${propertyName}: minimum`)});`);
  if (constraints.maximum !== undefined) lines.push(`    if (${nullableGuard}${access} > ${constraints.maximum}) errors.Add(${jsonString(`${propertyName}: maximum`)});`);
  if (constraints.pattern !== undefined) {
    lines.push(`    try { if (${nullableGuard}!Regex.IsMatch(${access}, ${jsonString(constraints.pattern)})) errors.Add(${jsonString(`${propertyName}: pattern`)}); } catch (ArgumentException) { errors.Add(${jsonString(`${propertyName}: pattern`)}); }`);
  }
  return lines;
}

function assertConstraintCompatibility(type: AST.TypeRef, constraints: ValidationConstraints | undefined, label: string): void {
  if (!constraints) return;
  const stringLike = type.name === "string" || type.name === "bytes";
  const numeric = ["i32", "f64", "number"].includes(type.name);
  const array = type.name === "array";
  if ((constraints.minLength !== undefined || constraints.maxLength !== undefined || constraints.pattern !== undefined) && !stringLike) {
    throw new Error(`C# field ${label} 的 length/pattern 约束只适用于 string/bytes`);
  }
  if ((constraints.minimum !== undefined || constraints.maximum !== undefined) && !numeric) {
    throw new Error(`C# field ${label} 的 minimum/maximum 约束只适用于数值类型`);
  }
  if ((constraints.minItems !== undefined || constraints.maxItems !== undefined) && !array) {
    throw new Error(`C# field ${label} 的 items 约束只适用于 array`);
  }
}

function csharpFieldType(type: AST.TypeRef, optional: boolean, typeNames: Map<string, string>): string {
  let result: string;
  switch (type.name) {
    case "bool": result = optional ? "bool?" : "bool"; break;
    case "i32": result = optional ? "int?" : "int"; break;
    case "f64":
    case "number": result = optional ? "double?" : "double"; break;
    case "string": result = optional ? "string?" : "string"; break;
    case "bytes": result = optional ? "byte[]?" : "byte[]"; break;
    case "array": result = optional ? "List<object?>?" : "List<object?>"; break;
    case "null":
    case "unit": result = "object?"; break;
    default: result = `${typeNames.get(type.name) ?? csharpTypeName(type.name)}${optional ? "?" : ""}`;
  }
  return result;
}

function needsNullInitialization(type: AST.TypeRef, optional: boolean): boolean {
  return optional || isNullableReference(type) || type.name === "null" || type.name === "unit";
}

function isNullableReference(type: AST.TypeRef): boolean {
  return ["string", "bytes", "array", "null", "unit"].includes(type.name) || !["bool", "i32", "f64", "number"].includes(type.name);
}

function isNullableValue(type: AST.TypeRef): boolean {
  return ["bool", "i32", "f64", "number"].includes(type.name);
}

function isNamedType(type: AST.TypeRef): boolean {
  return !["bool", "i32", "f64", "number", "string", "bytes", "array", "null", "unit"].includes(type.name);
}

function csharpPropertyName(metadata: SharedFieldMetadata, sourceName: string): string {
  return pascalCase(metadata.csharpName ?? metadata.tsName ?? sourceName);
}

function csharpTypeName(sourceName: string): string {
  return pascalCase(sourceName);
}

function pascalCase(value: string): string {
  const parts = value.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const result = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("") || "BdsValue";
  return /^[0-9]/.test(result) ? `Bds${result}` : result;
}

function assertCSharpIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value) || CSHARP_KEYWORDS.has(value.toLowerCase())) throw new Error(`${label} 不是合法的 C# 标识符: ${value}`);
}

function assertNamespace(value: string): void {
  if (!value || value.split(".").some((part) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(part) || CSHARP_KEYWORDS.has(part.toLowerCase()))) throw new Error(`非法 C# namespace: ${value}`);
}

function jsonString(value: string): string {
  return JSON.stringify(value);
}

function metadataFor(options: SharedCSharpGenerationOptions, declaration: AST.SharedDecl, field: AST.SharedField): SharedFieldMetadata {
  return options.fieldMetadata?.[`${declaration.name}.${field.name}`] ?? {};
}

function sharedDeclarations(input: AST.Program | AST.SharedDecl[]): AST.SharedDecl[] {
  return Array.isArray(input) ? input : input.body.filter((stmt): stmt is AST.SharedDecl => stmt.kind === "SharedDecl");
}

const CSHARP_KEYWORDS = new Set([
  "abstract", "as", "base", "bool", "break", "byte", "case", "catch", "char", "checked", "class", "const", "continue", "decimal", "default", "delegate", "do", "double", "else", "enum", "event", "explicit", "extern", "false", "finally", "fixed", "float", "for", "foreach", "goto", "if", "implicit", "in", "int", "interface", "internal", "is", "lock", "long", "namespace", "new", "null", "object", "operator", "out", "override", "params", "private", "protected", "public", "readonly", "ref", "return", "sbyte", "sealed", "short", "sizeof", "stackalloc", "static", "string", "struct", "switch", "this", "throw", "true", "try", "typeof", "uint", "ulong", "unchecked", "unsafe", "ushort", "using", "virtual", "void", "volatile", "while",
]);
