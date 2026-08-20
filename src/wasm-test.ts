import { compileToWasm, instantiateWasm } from "./wasm/compile";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

async function run() {
  console.log("WASM 后端测试\n");

  // Test 1: 算术函数
  {
    const { binary, wat, exported } = await compileToWasm(`
func compute(x, y):
    return x * y + x
`);
    const fns = await instantiateWasm(binary);
    check("算术函数编译", exported.includes("compute"), JSON.stringify(exported));
    check("算术函数运行 compute(3, 4) = 15", fns.compute(3, 4) === 15, String(fns.compute(3, 4)));
  }

  // Test 2: 局部变量 + 比较 + if/else
  {
    const { binary } = await compileToWasm(`
func classify(v):
    threshold = 80
    if v > threshold:
        return 1
    else:
        return 0
`);
    const fns = await instantiateWasm(binary);
    check("if/else 分支(>80 返回 1)", fns.classify(90) === 1, String(fns.classify(90)));
    check("if/else 分支(<=80 返回 0)", fns.classify(50) === 0, String(fns.classify(50)));
  }

  // Test 3: 函数调用
  {
    const { binary } = await compileToWasm(`
func square(x):
    return x * x

func sum_of_squares(a, b):
    return square(a) + square(b)
`);
    const fns = await instantiateWasm(binary);
    check("函数调用 sum_of_squares(3,4) = 25", fns.sum_of_squares(3, 4) === 25, String(fns.sum_of_squares(3, 4)));
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("WASM 测试出错:", e);
  process.exit(1);
});
