import { RuntimeLimits, RuntimeExecutor, RuntimeHost, RuntimeNodeHandle, RuntimeValue } from "./executor";
import { RuntimeExecutionError } from "./errors";
import { compileRuntime, isUnsafeRuntimeName, RuntimeProgram } from "./program";

export type NodeMap = Record<string, any>;

/** Builtin: 3D vector. */
export function vec3(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x, y, z };
}

/** Builtin: RGB color (0-255). Returns a plain { r, g, b } object. */
export function color(r: number, g: number, b: number): { r: number; g: number; b: number } {
  return { r, g, b };
}

/** Standard-library Option helpers. Values are JSON-safe and cross-target. */
export function some<T>(value: T): { kind: "some"; value: T } {
  return { kind: "some", value };
}

export function none(): { kind: "none" } {
  return { kind: "none" };
}

/** Standard-library Result helpers. Errors stay explicit at target boundaries. */
export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

export function is_ok(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as { ok?: unknown }).ok === true);
}

export function unwrap<T>(value: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!value.ok) throw new Error(`Result unwrap 失败: ${String(value.error)}`);
  return value.value;
}

/** Legacy callback shape retained for host integrations; the executor uses RuntimeHost. */
export interface RuntimeHandles {
  bind: (getter: () => any, node: any, prop: string) => void;
  watch: (getter: () => any, handler: (value: any) => void) => void;
  onFrame: (handler: (time: number) => void) => void;
  on: (node: any, event: string, handler: (value?: any) => void) => void;
}

interface BindingEntry {
  getter: () => RuntimeValue;
  node: RuntimeNodeHandle;
  prop: string;
  prev: RuntimeValue;
  initialized: boolean;
}

interface WatchEntry {
  getter: () => RuntimeValue;
  handler: (value: RuntimeValue) => void;
  prev: RuntimeValue;
  initialized: boolean;
}

interface TweenEntry {
  node: RuntimeNodeHandle;
  prop: string;
  from: RuntimeValue;
  to: RuntimeValue;
  duration: number;
  elapsed: number;
  isVector: boolean;
}

/**
 * Bounded, host-controlled Badodo Script runtime.
 *
 * Runtime execution consumes canonical RuntimeProgram data. TypeScript output
 * remains available through compile()/generateTypeScript() for export targets,
 * but it is never evaluated by this runtime.
 */
export class BadodoRuntime implements RuntimeHost {
  private nodes = new Map<string, unknown>();
  private nodeRefs = new Map<string, RuntimeNodeHandle>();
  private nodeValues = new WeakMap<RuntimeNodeHandle, unknown>();
  private bindings: BindingEntry[] = [];
  private watchers: WatchEntry[] = [];
  private frameHandlers: Array<(time: number, delta: number) => void> = [];
  private events = new Map<unknown, Map<string, Array<(value?: RuntimeValue) => void>>>();
  private tweens: TweenEntry[] = [];
  private time = 0;
  private readonly executor: RuntimeExecutor;

  constructor(limits: Partial<RuntimeLimits> = {}) {
    this.executor = new RuntimeExecutor(limits);
  }

  registerNode(name: string, node: unknown): void {
    assertSafeName(name);
    this.nodes.set(name, node);
    this.nodeRefs.delete(name);
  }

  registerNodes(map: NodeMap): void {
    for (const [name, node] of Object.entries(map)) this.registerNode(name, node);
  }

  resolveNode(name: string): RuntimeNodeHandle {
    assertSafeName(name);
    const node = this.nodes.get(name);
    if (node === undefined) {
      throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `节点「${name}」未找到。请先用 registerNode("${name}", ...) 注册它。`);
    }
    const existing = this.nodeRefs.get(name);
    if (existing) return existing;
    const ref: RuntimeNodeHandle = Object.freeze({ kind: "RuntimeNode", name });
    this.nodeRefs.set(name, ref);
    this.nodeValues.set(ref, node);
    return ref;
  }

  readNodeProperty(node: RuntimeNodeHandle, property: string): RuntimeValue {
    assertSafeProperty(property);
    const target = this.rawNode(node);
    if (target === null || (typeof target !== "object" && typeof target !== "function")) {
      throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `节点「${node.name}」不支持属性读取`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(target as object, property);
    if (!descriptor) return undefined;
    const value = "value" in descriptor ? descriptor.value : Reflect.get(target as object, property);
    if (typeof value === "function") {
      throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `禁止将节点方法「${node.name}.${property}」作为数据读取`);
    }
    return value as RuntimeValue;
  }

  writeNodeProperty(node: RuntimeNodeHandle, property: string, value: RuntimeValue): void {
    assertSafeProperty(property);
    const target = this.rawNode(node);
    if (target === null || (typeof target !== "object" && typeof target !== "function")) {
      throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `节点「${node.name}」不支持属性写入`);
    }
    const next = this.toHostValue(value);
    const descriptor = Object.getOwnPropertyDescriptor(target as object, property);
    if (descriptor && !descriptor.writable && !descriptor.set) {
      throw new RuntimeExecutionError("RUNTIME_HOST_FAILURE", `节点「${node.name}.${property}」写入被拒绝`);
    }
    if (descriptor?.set) {
      descriptor.set.call(target, next);
      return;
    }
    Object.defineProperty(target as object, property, {
      configurable: descriptor?.configurable ?? true,
      enumerable: descriptor?.enumerable ?? true,
      writable: true,
      value: next,
    });
  }

  invokeNodeMethod(node: RuntimeNodeHandle, method: string, args: readonly RuntimeValue[]): RuntimeValue {
    assertSafeProperty(method);
    const target = this.rawNode(node);
    if (target === null || (typeof target !== "object" && typeof target !== "function")) {
      throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `节点「${node.name}」不支持方法调用`);
    }
    const callable = Reflect.get(target as object, method);
    if (!Object.prototype.hasOwnProperty.call(target, method) || typeof callable !== "function") {
      throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `节点「${node.name}.${method}」不是可调用方法`);
    }
    return callable.apply(target, args.map((arg) => this.toHostValue(arg))) as RuntimeValue;
  }

  registerBinding(getter: () => RuntimeValue, node: RuntimeNodeHandle, property: string): void {
    assertSafeProperty(property);
    this.bindings.push({ getter, node, prop: property, prev: undefined, initialized: false });
  }

  registerWatch(getter: () => RuntimeValue, handler: (value: RuntimeValue) => void): void {
    this.watchers.push({ getter, handler, prev: undefined, initialized: false });
  }

  registerFrame(handler: (time: number, delta: number) => void): void {
    this.frameHandlers.push(handler);
  }

  registerEvent(node: RuntimeNodeHandle, event: string, handler: (value?: RuntimeValue) => void): void {
    assertSafeProperty(event);
    const target = this.rawNode(node);
    if (target === null || (typeof target !== "object" && typeof target !== "function")) {
      throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `节点「${node.name}」不支持事件`);
    }
    const nativeAddEventListener = Reflect.get(target as object, "addEventListener");
    if (typeof nativeAddEventListener === "function") {
      nativeAddEventListener.call(target, event, handler);
      return;
    }
    let eventMap = this.events.get(target);
    if (!eventMap) {
      eventMap = new Map();
      this.events.set(target, eventMap);
    }
    let handlers = eventMap.get(event);
    if (!handlers) {
      handlers = [];
      eventMap.set(event, handlers);
    }
    handlers.push(handler);
  }

  animate(node: RuntimeNodeHandle, property: string, value: RuntimeValue, duration: number): void {
    assertSafeProperty(property);
    const from = this.readNodeProperty(node, property);
    const isVector = isVectorLike(from);
    this.tweens.push({
      node,
      prop: property,
      from: isVector ? normalizeVector(from) : from,
      to: isVector ? normalizeVector(value) : value,
      duration: Math.max(0, duration),
      elapsed: 0,
      isVector,
    });
  }

  animateTo(node: RuntimeNodeHandle, target: RuntimeNodeHandle, duration: number): void {
    const from = this.readNodeProperty(node, "position") ?? this.rawNode(node);
    const to = this.readNodeProperty(target, "position") ?? this.rawNode(target);
    this.tweens.push({
      node,
      prop: "position",
      from: normalizeVector(from),
      to: normalizeVector(to),
      duration: Math.max(0, duration),
      elapsed: 0,
      isVector: true,
    });
  }

  /** Compatibility helper for hosts that still call the legacy callback name. */
  bind = (getter: () => any, node: any, prop: string): void => {
    this.registerBinding(getter, this.asNodeHandle(node), prop);
  };

  watch = (getter: () => any, handler: (value: any) => void): void => {
    this.registerWatch(getter, handler);
  };

  onFrame = (handler: (time: number) => void): void => {
    this.registerFrame((time) => handler(time));
  };

  on = (node: any, event: string, handler: (value?: any) => void): void => {
    this.registerEvent(this.asNodeHandle(node), event, handler);
  };

  /** Dispatch an event to handlers registered through the explicit host boundary. */
  emit(node: any, event: string, value?: RuntimeValue): void {
    assertSafeProperty(event);
    const target = isNodeHandle(node) ? this.rawNode(node) : node;
    const handlers = this.events.get(target)?.get(event);
    if (!handlers) return;
    for (const handler of [...handlers]) handler(value);
  }

  /** Parse canonical source and execute its structured runtime representation. */
  run(source: string, sourceName = "source.bds"): void {
    this.runProgram(compileRuntime(source, sourceName));
  }

  runProgram(program: RuntimeProgram): void {
    this.executor.execute(program, this);
  }

  /**
   * Legacy entry point deliberately refuses generated code. Keeping the name
   * makes stale callers fail closed instead of regressing to dynamic eval.
   */
  runCompiled(program: RuntimeProgram): void;
  runCompiled(code: string, nodeNames: readonly string[]): never;
  runCompiled(programOrCode: RuntimeProgram | string): void {
    if (typeof programOrCode === "string") {
      throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", "runCompiled 不再执行生成 JavaScript；请使用 run() 或 runProgram() 传入 RuntimeProgram");
    }
    this.runProgram(programOrCode);
  }

  /** Advance one frame from a Babylon render loop or requestAnimationFrame. */
  tick(deltaTime: number): void {
    try {
      this.tickInternal(deltaTime);
    } catch (error) {
      if (error instanceof RuntimeExecutionError) throw error;
      throw new RuntimeExecutionError("RUNTIME_HOST_FAILURE", `帧运行失败: ${error instanceof Error ? error.message : String(error)}`, undefined, error);
    }
  }

  private tickInternal(deltaTime: number): void {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "deltaTime 必须是非负有限数字");
    this.time += deltaTime;

    for (const handler of [...this.frameHandlers]) handler(this.time, deltaTime);

    for (const watcher of [...this.watchers]) {
      const value = watcher.getter();
      if (!watcher.initialized || !Object.is(value, watcher.prev)) {
        watcher.handler(value);
        watcher.initialized = true;
        watcher.prev = value;
      }
    }

    for (const binding of [...this.bindings]) {
      const value = binding.getter();
      if (!binding.initialized || !Object.is(value, binding.prev)) {
        this.writeNodeProperty(binding.node, binding.prop, value);
        binding.initialized = true;
        binding.prev = value;
      }
    }

    let activeTweens = 0;
    for (const tween of this.tweens) {
      tween.elapsed += deltaTime;
      const t = tween.duration === 0 ? 1 : Math.min(tween.elapsed / tween.duration, 1);
      if (tween.isVector) {
        writeVectorLerp(this, tween.node, tween.prop, normalizeVector(tween.from), normalizeVector(tween.to), t);
      } else {
        const from = requireFiniteNumber(tween.from, "动画起始值");
        const to = requireFiniteNumber(tween.to, "动画目标值");
        this.writeNodeProperty(tween.node, tween.prop, from + (to - from) * t);
      }
      if (t < 1) {
        this.tweens[activeTweens] = tween;
        activeTweens += 1;
      }
    }
    this.tweens.length = activeTweens;
  }

  /** Convenience: run an auto requestAnimationFrame loop (browser only). */
  startAutoLoop(): void {
    let last = performance.now();
    const loop = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      this.tick(delta);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private rawNode(node: RuntimeNodeHandle): any {
    if (!isNodeHandle(node)) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "无效的 runtime 节点句柄");
    const value = this.nodeValues.get(node);
    if (value === undefined) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `节点「${node.name}」句柄已失效`);
    return value;
  }

  private asNodeHandle(node: unknown): RuntimeNodeHandle {
    if (isNodeHandle(node)) return node;
    for (const ref of this.nodeRefs.values()) if (this.nodeValues.get(ref) === node) return ref;
    const ref = Object.freeze({ kind: "RuntimeNode", name: "<legacy>" }) as RuntimeNodeHandle;
    this.nodeValues.set(ref, node);
    return ref;
  }

  private toHostValue(value: RuntimeValue): unknown {
    if (isNodeHandle(value)) return this.rawNode(value);
    if (Array.isArray(value)) return value.map((item) => this.toHostValue(item));
    if (value !== null && typeof value === "object" && !isCallableLike(value)) {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value as Record<string, RuntimeValue>)) result[key] = this.toHostValue(item);
      return result;
    }
    return value;
  }
}

/** Compatibility no-op: runtime no longer caches compiled JavaScript executors. */
export function clearRuntimeCompilationCache(): void {
  // Intentionally empty. Structured RuntimeProgram data needs no JS compiler cache.
}

export function runtimeCompilationCacheSize(): number {
  return 0;
}

function assertSafeName(name: string): void {
  if (typeof name !== "string" || name.length === 0 || isUnsafeRuntimeName(name)) {
    throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `名称「${name}」被运行时安全策略拒绝`);
  }
}

function assertSafeProperty(property: string): void {
  if (typeof property !== "string" || property.length === 0 || isUnsafeRuntimeName(property)) {
    throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `属性「${property}」被运行时安全策略拒绝`);
  }
}

function isNodeHandle(value: unknown): value is RuntimeNodeHandle {
  return value !== null && typeof value === "object" && (value as { kind?: unknown }).kind === "RuntimeNode";
}

function isCallableLike(value: unknown): boolean {
  return value !== null && typeof value === "object" && (value as { kind?: unknown }).kind === "RuntimeCallable";
}

function isVectorLike(value: RuntimeValue): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).x === "number" &&
    typeof (value as Record<string, unknown>).y === "number";
}

function normalizeVector(value: unknown): { x: number; y: number; z: number } {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    return {
      x: typeof object.x === "number" ? object.x : 0,
      y: typeof object.y === "number" ? object.y : 0,
      z: typeof object.z === "number" ? object.z : 0,
    };
  }
  return { x: 0, y: 0, z: 0 };
}

function writeVectorLerp(runtime: BadodoRuntime, node: RuntimeNodeHandle, property: string, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, t: number): void {
  const current = runtime.readNodeProperty(node, property);
  if (current !== null && typeof current === "object" && !Array.isArray(current)) {
    const target = current as Record<string, unknown>;
    target.x = from.x + (to.x - from.x) * t;
    target.y = from.y + (to.y - from.y) * t;
    target.z = from.z + (to.z - from.z) * t;
    return;
  }
  runtime.writeNodeProperty(node, property, {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  });
}

function requireFiniteNumber(value: RuntimeValue, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `${label} 必须是有限数字`);
  return value;
}
