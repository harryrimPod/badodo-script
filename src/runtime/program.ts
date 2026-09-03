import * as AST from "../ast";
import { tokenize } from "../lexer";
import { parse } from "../parser";
import { collectNodes } from "./collect-nodes";
import { RuntimeExecutionError } from "./errors";

export const RUNTIME_PROGRAM_VERSION = 1 as const;

/**
 * Canonical structured runtime representation.
 *
 * The AST remains the one language-semantic authority. RuntimeProgram is a
 * versioned, immutable data envelope around that canonical AST plus the node
 * manifest needed by a host. It intentionally contains no generated JS.
 */
export interface RuntimeProgram {
  readonly kind: "RuntimeProgram";
  readonly version: typeof RUNTIME_PROGRAM_VERSION;
  readonly sourceName: string;
  readonly nodeNames: readonly string[];
  readonly ast: AST.Program;
}

export interface RuntimeProgramValidation {
  valid: boolean;
  errors: string[];
}

const UNSAFE_NAMES = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "globalThis",
  "process",
  "require",
  "module",
  "Function",
  "eval",
  "window",
  "document",
]);

const AST_KINDS = new Set([
  "Program", "Block", "VarDecl", "Assign", "If", "Repeat", "FuncDef", "Return", "When", "BindStmt",
  "WatchStmt", "EveryFrame", "Animate", "ForIn", "SharedDecl", "TypeDecl", "EnumDecl", "ImportDecl",
  "ExpressionStmt", "TypeRef", "Call", "MemberAccess", "IndexAccess", "ArrayLiteral", "MapLiteral",
  "AwaitExpr", "Identifier", "BinaryOp", "UnaryOp", "Literal",
]);

/** Parse BDS through the canonical lexer/parser and lower it to runtime data. */
export function compileRuntime(source: string, sourceName = "source.bds"): RuntimeProgram {
  const ast = parse(tokenize(source));
  const program: RuntimeProgram = {
    kind: "RuntimeProgram",
    version: RUNTIME_PROGRAM_VERSION,
    sourceName,
    nodeNames: collectNodes(ast),
    ast,
  };
  const validation = validateRuntimeProgram(program);
  if (!validation.valid) {
    const code = validation.errors.some((error) => error.includes("不安全名称") || error.includes("nodeNames"))
      ? "RUNTIME_UNSUPPORTED_OPERATION"
      : "RUNTIME_PROGRAM_INVALID";
    throw new RuntimeExecutionError(code, validation.errors.join("; "));
  }
  return deepFreeze(program);
}

/** Build runtime data from an already parsed canonical AST. */
export function runtimeProgramFromAst(ast: AST.Program, sourceName = "source.bds"): RuntimeProgram {
  return compileRuntimeFromAst(ast, sourceName);
}

function compileRuntimeFromAst(ast: AST.Program, sourceName: string): RuntimeProgram {
  const program: RuntimeProgram = {
    kind: "RuntimeProgram",
    version: RUNTIME_PROGRAM_VERSION,
    sourceName,
    nodeNames: collectNodes(ast),
    ast,
  };
  const validation = validateRuntimeProgram(program);
  if (!validation.valid) {
    const code = validation.errors.some((error) => error.includes("不安全名称") || error.includes("nodeNames"))
      ? "RUNTIME_UNSUPPORTED_OPERATION"
      : "RUNTIME_PROGRAM_INVALID";
    throw new RuntimeExecutionError(code, validation.errors.join("; "));
  }
  return deepFreeze(program);
}

/** Validate serialized runtime data before an executor is allowed to inspect it. */
export function validateRuntimeProgram(value: unknown): RuntimeProgramValidation {
  const errors: string[] = [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["RuntimeProgram 必须是 object"] };
  }
  const object = value as Record<string, unknown>;
  if (object.kind !== "RuntimeProgram") errors.push("kind 必须是 RuntimeProgram");
  if (object.version !== RUNTIME_PROGRAM_VERSION) errors.push(`不支持的 RuntimeProgram version: ${String(object.version)}`);
  if (typeof object.sourceName !== "string" || object.sourceName.length === 0) errors.push("sourceName 必须是非空字符串");
  if (!Array.isArray(object.nodeNames) || object.nodeNames.some((name) => typeof name !== "string" || name.length === 0 || UNSAFE_NAMES.has(name))) {
    errors.push("nodeNames 必须是安全的非空字符串数组");
  } else if (new Set(object.nodeNames).size !== object.nodeNames.length) {
    errors.push("nodeNames 不能重复");
  }
  if (!isRecord(object.ast) || object.ast.kind !== "Program" || !Array.isArray(object.ast.body)) {
    errors.push("ast 必须是 canonical Program");
  } else {
    walkAst(object.ast, "$.ast", errors);
  }
  return { valid: errors.length === 0, errors };
}

export function assertRuntimeProgram(value: unknown): RuntimeProgram {
  const result = validateRuntimeProgram(value);
  if (!result.valid) throw new RuntimeExecutionError("RUNTIME_PROGRAM_INVALID", result.errors.join("; "));
  return value as RuntimeProgram;
}

export function isUnsafeRuntimeName(name: string): boolean {
  return UNSAFE_NAMES.has(name);
}

function walkAst(value: unknown, path: string, errors: string[]): void {
  if (typeof value === "function") {
    errors.push(`${path} 不能包含函数`);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) walkAst(value[i], `${path}[${i}]`, errors);
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.kind === "string" && !AST_KINDS.has(value.kind)) {
    errors.push(`${path}.kind 使用了不支持的 AST 节点类型「${value.kind}」`);
  }
  for (const [key, child] of Object.entries(value)) {
    if ((key === "name" || key === "member" || key === "key") && typeof child === "string" && isUnsafeRuntimeName(child)) {
      errors.push(`${path}.${key} 使用了不安全名称「${child}」`);
    }
    walkAst(child, `${path}.${key}`, errors);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
