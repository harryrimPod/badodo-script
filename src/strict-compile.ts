import { tokenize } from "./lexer";
import { parse } from "./parser";
import * as AST from "./ast";
import { generateWithMap } from "./generator";
import { generateSourceMap } from "./sourcemap";
import { analyzeProgram, SymbolAnalysis } from "./analysis";
import { checkProgram, TypeCheckResult } from "./type-checker";
import {
  BDS_CAPABILITIES,
  CapabilityManifestEntry,
  CapabilityTarget,
  capabilitiesForTarget,
} from "./capabilities";

export interface StrictCompileOptions {
  sourceName?: string;
  /** The externally registered scene-node manifest. */
  nodeNames?: readonly string[];
  /** Defaults to true: no implicit scene nodes are accepted without a manifest. */
  requireNodeManifest?: boolean;
  /** Optional target capability boundary, e.g. `web` or `server`. */
  target?: CapabilityTarget;
  /** Opt in to TypeScript annotations for BDS declarations with safe mappings. */
  emitTypes?: boolean;
}

export interface StrictDiagnostic {
  code: "BDS-STRICT-001" | "BDS-STRICT-002" | "BDS-STRICT-003" | "BDS-STRICT-004";
  severity: "error";
  message: string;
  name?: string;
  line?: number;
}

export interface StrictCompileResult {
  typescript: string;
  sourceMap?: string;
  ast: ReturnType<typeof parse>;
  symbols: SymbolAnalysis;
  types: TypeCheckResult;
  nodeNames: string[];
  capabilities: CapabilityManifestEntry[];
  diagnostics: StrictDiagnostic[];
}

export class StrictCompileError extends Error {
  readonly diagnostics: StrictDiagnostic[];

  constructor(diagnostics: StrictDiagnostic[]) {
    super(`严格编译失败: ${diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`);
    this.name = "StrictCompileError";
    this.diagnostics = diagnostics;
  }
}

/** Compile with an explicit scene-node manifest and optional target capability boundary. */
export function compileStrict(source: string, options: StrictCompileOptions = {}): StrictCompileResult {
  const sourceName = options.sourceName ?? "source.bds";
  const ast = parse(tokenize(source));
  const symbols = analyzeProgram(ast);
  const types = checkProgram(ast);
  const { code, mappings } = generateWithMap(ast, { emitTypes: options.emitTypes });
  const sourceMap = generateSourceMap({
    file: sourceName.replace(/\.bds$/, ".ts"),
    source: sourceName,
    sourceContent: source,
    mappings,
  });
  const capabilities = usedCapabilities(symbols, ast);
  const diagnostics = strictDiagnostics(symbols, types, capabilities, options);
  const result: StrictCompileResult = {
    typescript: code,
    sourceMap,
    ast,
    symbols,
    types,
    nodeNames: symbols.sceneNodes,
    capabilities,
    diagnostics,
  };
  if (diagnostics.length > 0) throw new StrictCompileError(diagnostics);
  return result;
}

function strictDiagnostics(
  symbols: SymbolAnalysis,
  types: TypeCheckResult,
  capabilities: CapabilityManifestEntry[],
  options: StrictCompileOptions,
): StrictDiagnostic[] {
  const diagnostics: StrictDiagnostic[] = [];
  const manifest = options.nodeNames;
  const requireManifest = options.requireNodeManifest !== false;
  const allowed = new Set<string>();

  if (manifest !== undefined) {
    for (const name of manifest) {
      if (typeof name !== "string" || name.length === 0) {
        diagnostics.push({ code: "BDS-STRICT-002", severity: "error", message: "nodeNames 清单只能包含非空字符串" });
      } else if (allowed.has(name)) {
        diagnostics.push({ code: "BDS-STRICT-002", severity: "error", message: `nodeNames 清单中重复节点「${name}」`, name });
      } else {
        allowed.add(name);
      }
    }
  }

  for (const name of symbols.sceneNodes) {
    const reference = symbols.references.find((item) => item.root === name);
    if (manifest === undefined && requireManifest) {
      diagnostics.push({
        code: "BDS-STRICT-001",
        severity: "error",
        message: `严格模式要求显式 nodeNames 清单，未声明场景节点「${name}」`,
        name,
        line: reference?.line,
      });
    } else if (manifest !== undefined && !allowed.has(name)) {
      diagnostics.push({
        code: "BDS-STRICT-001",
        severity: "error",
        message: `场景节点「${name}」不在 nodeNames 清单中`,
        name,
        line: reference?.line,
      });
    }
  }

  for (const diagnostic of types.diagnostics) {
    if (diagnostic.severity === "error") {
      diagnostics.push({ code: "BDS-STRICT-003", severity: "error", message: diagnostic.message, line: diagnostic.line });
    }
  }

  if (options.target) {
    const allowedCapabilities = new Set(capabilitiesForTarget(options.target).map((entry) => entry.id));
    for (const capability of capabilities) {
      if (!allowedCapabilities.has(capability.id)) {
        diagnostics.push({
          code: "BDS-STRICT-004",
          severity: "error",
          message: `能力「${capability.id}」不属于 target「${options.target}」`,
          name: capability.name,
        });
      }
    }
  }

  return diagnostics.sort((a, b) => {
    const left = `${a.line ?? Number.MAX_SAFE_INTEGER}:${a.code}:${a.name ?? ""}:${a.message}`;
    const right = `${b.line ?? Number.MAX_SAFE_INTEGER}:${b.code}:${b.name ?? ""}:${b.message}`;
    return left.localeCompare(right);
  });
}

function usedCapabilities(symbols: SymbolAnalysis, program: ReturnType<typeof parse>): CapabilityManifestEntry[] {
  const used = new Map<string, CapabilityManifestEntry>();
  const add = (kind: "runtime" | "builtin", name: string): void => {
    const capability = BDS_CAPABILITIES.find((entry) => entry.kind === kind && entry.name === name);
    if (capability) used.set(capability.id, capability);
  };
  for (const reference of symbols.references) {
    if (reference.kind !== "runtime" && reference.kind !== "builtin") continue;
    add(reference.kind, reference.root);
  }
  const visitBlock = (block: AST.Block): void => {
    for (const stmt of block.body) visitStmt(stmt);
  };
  const visitStmt = (stmt: AST.Stmt): void => {
    switch (stmt.kind) {
      case "BindStmt": add("runtime", "bind"); return;
      case "WatchStmt": add("runtime", "watch"); visitBlock(stmt.body); return;
      case "EveryFrame": add("runtime", "onFrame"); visitBlock(stmt.body); return;
      case "When": add("runtime", "on"); visitBlock(stmt.body); return;
      case "Animate": add("runtime", stmt.target.kind === "MemberAccess" ? "animate" : "animateTo"); return;
      case "If": visitBlock(stmt.thenBlock); if (stmt.elseBlock) visitBlock(stmt.elseBlock); return;
      case "Repeat": visitBlock(stmt.body); return;
      case "FuncDef": visitBlock(stmt.body); return;
      case "ForIn": visitBlock(stmt.body); return;
      default: return;
    }
  };
  for (const stmt of program.body) visitStmt(stmt);
  return Array.from(used.values()).sort((a, b) => a.id.localeCompare(b.id));
}
