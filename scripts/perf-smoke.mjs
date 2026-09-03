import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  BadodoRuntime,
  CompileCache,
  compile,
  compileToWasm,
  compileRuntime,
  clearRuntimeCompilationCache,
  runtimeCompilationCacheSize,
} from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "examples", "door.bds"), "utf8");
const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "bds-perf-cache-"));
const cache = new CompileCache({ cacheDir, compilerVersion: "0.1.2" });

function timed(fn) {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

async function timedAsync(fn) {
  const start = performance.now();
  const value = await fn();
  return { value, ms: performance.now() - start };
}

try {
  const cold = timed(() => cache.getOrCompile(source, "door.bds", {}, () => compile(source, "door.bds")));
  const warm = timed(() => cache.getOrCompile(source, "door.bds", {}, () => {
    throw new Error("缓存未命中");
  }));
  assert.equal(cache.stats.misses, 1);
  assert.equal(cache.stats.hits, 1);
  assert.equal(cold.value.typescript, warm.value.typescript);

  clearRuntimeCompilationCache();
  const runtime = new BadodoRuntime();
  const rotor = { rotate_y() {} };
  runtime.registerNode("rotor", rotor);
  const program = compileRuntime("every frame:\n    rotor.rotate_y(time)");
  runtime.runProgram(program);
  const firstExecutorCacheSize = runtimeCompilationCacheSize();
  runtime.runProgram(program);
  assert.equal(runtimeCompilationCacheSize(), firstExecutorCacheSize);
  const tick = timed(() => {
    for (let i = 0; i < 10000; i += 1) runtime.tick(1 / 60);
  });

  const wasmCold = await timedAsync(() => compileToWasm("func square(x):\n    return x * x\n"));
  const wasmWarm = await timedAsync(() => compileToWasm("func square(x):\n    return x * x\n"));
  assert.deepEqual(Array.from(wasmCold.value.binary), Array.from(wasmWarm.value.binary));

  console.log(JSON.stringify({
    compileColdMs: Number(cold.ms.toFixed(3)),
    compileWarmMs: Number(warm.ms.toFixed(3)),
    cache: cache.stats,
    runtimeExecutorCacheSize: runtimeCompilationCacheSize(),
    tenThousandTicksMs: Number(tick.ms.toFixed(3)),
    wasmColdMs: Number(wasmCold.ms.toFixed(3)),
    wasmWarmMs: Number(wasmWarm.ms.toFixed(3)),
  }, null, 2));
  console.log("Performance smoke passed: compile cache, bounded runtime, low-allocation ticks, and WABT reuse");
} finally {
  fs.rmSync(cacheDir, { recursive: true, force: true });
}
