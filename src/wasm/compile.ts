import wabt from "wabt";
import * as AST from "../ast";
import { generateWat } from "./wat-generator";
import { tokenize } from "../lexer";
import { parse } from "../parser";

export interface WasmResult {
  binary: Uint8Array;
  wat: string;
  exported: string[];
}

/** Compile an AST into a .wasm binary (pure-compute functions only). */
export async function compileAstToWasm(program: AST.Program): Promise<WasmResult> {
  const { wat, exported } = generateWat(program);
  const wabtInstance = await wabt();
  const module = wabtInstance.parseWat("module.wat", wat);
  const binary = module.toBinary({}).buffer;
  module.destroy();
  return { binary: new Uint8Array(binary), wat, exported };
}

/** Compile a .bds source string into a .wasm binary. */
export async function compileToWasm(source: string): Promise<WasmResult> {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  return compileAstToWasm(ast);
}

/**
 * Instantiate a .wasm binary and return its exported functions.
 * Works in Node and (with WebAssembly.instantiate) in browsers.
 */
export async function instantiateWasm(binary: Uint8Array): Promise<Record<string, (...args: number[]) => number>> {
  const result: any = await WebAssembly.instantiate(binary, {});
  // Node returns an Instance directly; browsers return { module, instance }.
  const instance = result.instance ?? result;
  return instance.exports as Record<string, (...args: number[]) => number>;
}
