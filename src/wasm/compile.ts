import * as AST from "../ast";
import { generateWat } from "./wat-generator";
import { tokenize } from "../lexer";
import { parse } from "../parser";

type WabtFactory = () => Promise<{
  parseWat(name: string, source: string): { toBinary(options: Record<string, unknown>): { buffer: ArrayBuffer }; destroy(): void };
}>;

type WabtInstance = Awaited<ReturnType<WabtFactory>>;
let wabtPromise: Promise<WabtInstance> | undefined;

async function loadWabt(): Promise<WabtInstance> {
  if (!wabtPromise) {
    wabtPromise = (async () => {
      try {
        const module = await import("wabt");
        const factory = module.default as unknown as WabtFactory;
        return factory();
      } catch (error) {
        wabtPromise = undefined;
        throw new Error(`WASM 编译需要 wabt 依赖；请在项目中执行 npm install。${error instanceof Error ? ` 原因：${error.message}` : ""}`);
      }
    })();
  }
  return wabtPromise;
}

/** Drop the initialized WABT instance when a long-running host unloads WASM. */
export function clearWasmCompilerCache(): void {
  wabtPromise = undefined;
}

export interface WasmResult {
  binary: Uint8Array;
  wat: string;
  exported: string[];
}

/** Compile an AST into a .wasm binary (pure-compute functions only). */
export async function compileAstToWasm(program: AST.Program): Promise<WasmResult> {
  const { wat, exported } = generateWat(program);
  const wabtInstance = await loadWabt();
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
