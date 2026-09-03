import { tokenize } from "./lexer";
import { parse } from "./parser";
import { generateTypeScript, generateWithMap } from "./generator";
import { generateSourceMap } from "./sourcemap";
import { analyzeProgram, SymbolAnalysis } from "./analysis";
import { checkProgram, TypeCheckResult } from "./type-checker";

export * from "./token";
export * from "./lexer";
export * from "./ast";
export * from "./parser";
export * from "./generator";
export * from "./sourcemap";
export * from "./runtime/runtime";
export * from "./runtime/executor";
export * from "./runtime/errors";
export * from "./runtime/program";
export * from "./runtime/collect-nodes";
export * from "./runtime/shared-ingress";
export * from "./runtime/browser";
export * from "./adapters/babylon";
export * from "./adapters/maplibre";
export * from "./wasm/wat-generator";
export * from "./wasm/compile";
export * from "./pack/encrypt";
export * from "./pack/pack";
export * from "./licensing";
export * from "./analysis";
export * from "./capabilities";
export * from "./semantic-ir";
export * from "./type-checker";
export * from "./shared";
export * from "./shared-rc";
export * from "./shared-csharp";
export * from "./godot";
export * from "./payload";
export * from "./server-go";
export * from "./server-go-http";
export * from "./server-go-mqtt";
export * from "./strict-compile";
export * from "./version";
export * from "./lsp";
export * from "./compile-cache";

export interface CompileResult {
  typescript: string;
  sourceMap?: string;
}

export interface CompileOptions {
  /** Opt in to TypeScript annotations for BDS declarations with safe mappings. */
  emitTypes?: boolean;
}

export interface SourceAnalysis {
  ast: ReturnType<typeof parse>;
  symbols: SymbolAnalysis;
  types: TypeCheckResult;
}

/** Parse, classify symbols and run the non-destructive Phase 1 type checker. */
export function analyze(source: string): SourceAnalysis {
  const ast = parse(tokenize(source));
  return {
    ast,
    symbols: analyzeProgram(ast),
    types: checkProgram(ast),
  };
}

export function compile(source: string, sourceName = "source.bds", options: CompileOptions = {}): CompileResult {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const { code, mappings } = generateWithMap(ast, options);
  const sourceMap = generateSourceMap({
    file: sourceName.replace(/\.bds$/, ".ts"),
    source: sourceName,
    sourceContent: source,
    mappings,
  });
  return { typescript: code, sourceMap };
}
