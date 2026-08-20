import { compile } from "./index";
import { compileStrict } from "./strict-compile";
import { generateWithMap } from "./generator";
import { parse } from "./parser";
import { tokenize } from "./lexer";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("BDS type-preserving TypeScript projection\n");

const source = `
count: i32 = 1
payload: bytes = null
items: array = [1, 2]

func add(a: i32, b, c: string) -> i32:
    return a
`;
const defaultResult = compile(source);
const typedResult = compile(source, "typed.bds", { emitTypes: true });

check("default projection keeps annotations erased", defaultResult.typescript.includes("let count = 1;") && !defaultResult.typescript.includes("count: number"));
check("numeric variable annotation projects to number", typedResult.typescript.includes("let count: number = 1;"));
check("bytes and array annotations project safely", typedResult.typescript.includes("let payload: Uint8Array = null;") && typedResult.typescript.includes("let items: unknown[] = [1, 2];"));
check("mixed function parameter annotations preserve alignment", typedResult.typescript.includes("function add(a: number, b, c: string): number {"));

const mappedDefault = generateWithMap(parse(tokenize(source)));
const mappedTyped = generateWithMap(parse(tokenize(source)), { emitTypes: true });
check("typed projection preserves source-map statement count", mappedDefault.mappings.length === mappedTyped.mappings.length);

const strictTyped = compileStrict("value: f64 = 1", { nodeNames: [], emitTypes: true });
check("strict compile exposes typed projection", strictTyped.typescript === "let value: number = 1;");

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed > 0 ? 1 : 0);
