import { tokenize } from "../lexer";
import { parse } from "../parser";
import { generateWithMap } from "../generator";
import { generateSourceMap } from "../sourcemap";
import type { TypeScriptGeneratorOptions } from "../generator";

/**
 * Browser-facing compiler entry. Bundled with esbuild for the Monaco editor
 * demo. Only the pure-TS compile pipeline is included here — no Node or wabt
 * dependencies.
 */

export interface CompileResult {
  typescript: string;
  sourceMap?: string;
}

export function compile(source: string, sourceName = "source.bds", options: TypeScriptGeneratorOptions = {}): CompileResult {
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

export { tokenize } from "../lexer";
export { parse } from "../parser";
export { compileStrict, StrictCompileError } from "../strict-compile";
export type { StrictCompileOptions, StrictCompileResult, StrictDiagnostic } from "../strict-compile";
export type { TypeScriptGeneratorOptions } from "../generator";
