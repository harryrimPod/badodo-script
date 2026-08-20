import { tokenize } from "../lexer";
import { parse } from "../parser";
import { generateTypeScript } from "../generator";
import { Program } from "../ast";
import { collectNodes } from "./collect-nodes";
import { assertBdsPayload, BDS_PAYLOAD_VERSION } from "../payload";

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

export interface RuntimeHandles {
  bind: (getter: () => any, node: any, prop: string) => void;
  watch: (getter: () => any, handler: (value: any) => void) => void;
  onFrame: (handler: (time: number) => void) => void;
  on: (node: any, event: string, handler: (value?: any) => void) => void;
}

type CompiledExecutor = (...args: any[]) => void;
const COMPILED_EXECUTOR_CACHE = new Map<string, CompiledExecutor>();
const MAX_COMPILED_EXECUTORS = 128;

/** Clear cached executors when a host unloads a scene or plugin. */
export function clearRuntimeCompilationCache(): void {
  COMPILED_EXECUTOR_CACHE.clear();
}

export function runtimeCompilationCacheSize(): number {
  return COMPILED_EXECUTOR_CACHE.size;
}

interface BindingEntry {
  getter: () => any;
  node: any;
  prop: string;
  prev: any;
  initialized: boolean;
}

interface WatchEntry {
  getter: () => any;
  handler: (value: any) => void;
  prev: any;
  initialized: boolean;
}

interface TweenEntry {
  node: any;
  prop: string;
  from: any;
  to: any;
  duration: number;
  elapsed: number;
  isVector: boolean;
}

/**
 * Badodo Script runtime.
 *
 * Responsibilities:
 *  - Resolve scene nodes by name and inject them into script scope.
 *  - Provide the four runtime functions the generated TypeScript depends on:
 *      bind / watch / onFrame (and node.on for events).
 *  - Drive per-frame polling so bind/watch react to value changes.
 *
 * Usage (browser, Babylon.js):
 *   const rt = new BadodoRuntime();
 *   rt.registerNode("door", mesh);
 *   rt.run(source);               // compile + execute
 *   scene.onBeforeRenderObservable.add(() => rt.tick(scene.getEngine().getDeltaTime() / 1000));
 */
export class BadodoRuntime {
  private nodes = new Map<string, any>();
  private resolvedNodeArgs = new Map<string, any[]>();
  private bindings: BindingEntry[] = [];
  private watchers: WatchEntry[] = [];
  private frameHandlers: ((time: number) => void)[] = [];
  private events = new Map<any, Map<string, Array<(value?: any) => void>>>();
  private tweens: TweenEntry[] = [];
  private time = 0;

  registerNode(name: string, node: any): void {
    this.nodes.set(name, node);
    this.resolvedNodeArgs.clear();
  }

  registerNodes(map: NodeMap): void {
    for (const [name, node] of Object.entries(map)) {
      this.nodes.set(name, node);
    }
    this.resolvedNodeArgs.clear();
  }

  resolveNode(name: string): any {
    const node = this.nodes.get(name);
    if (node === undefined) {
      throw new Error(`节点「${name}」未找到。请先用 registerNode("${name}", ...) 注册它。`);
    }
    return node;
  }

  private resolveNodeArgs(nodeNames: readonly string[]): any[] {
    const key = nodeNames.join("\u0000");
    const cached = this.resolvedNodeArgs.get(key);
    if (cached) return cached;
    const resolved = new Array<any>(nodeNames.length);
    for (let i = 0; i < nodeNames.length; i += 1) resolved[i] = this.resolveNode(nodeNames[i]);
    if (this.resolvedNodeArgs.size >= MAX_COMPILED_EXECUTORS) {
      const oldest = this.resolvedNodeArgs.keys().next().value;
      if (oldest !== undefined) this.resolvedNodeArgs.delete(oldest);
    }
    this.resolvedNodeArgs.set(key, resolved);
    return resolved;
  }

  bind = (getter: () => any, node: any, prop: string): void => {
    this.bindings.push({ getter, node, prop, prev: undefined, initialized: false });
  };

  watch = (getter: () => any, handler: (value: any) => void): void => {
    this.watchers.push({ getter, handler, prev: undefined, initialized: false });
  };

  onFrame = (handler: (time: number) => void): void => {
    this.frameHandlers.push(handler);
  };

  /** Animate node[prop] from its current value to `value` over `duration` seconds. */
  animate = (node: any, prop: string, value: any, duration: number): void => {
    const from = node[prop];
    const isVector = isVectorLike(from);
    const to = isVector ? normalizeVector(value) : value;
    this.tweens.push({ node, prop, from: isVector ? normalizeVector(from) : from, to, duration, elapsed: 0, isVector });
  };

  /** Animate a node's position to another node's position over `duration` seconds. */
  animateTo = (node: any, target: any, duration: number): void => {
    const from = node.position ?? node;
    const to = target.position ?? target;
    this.tweens.push({ node, prop: "position", from: normalizeVector(from), to: normalizeVector(to), duration, elapsed: 0, isVector: true });
  };

  on = (node: any, event: string, handler: (value?: any) => void): void => {
    if (node == null) {
      throw new Error(`无法给空节点注册事件「${event}」`);
    }
    // Prefer the node's native listener interface if present.
    if (typeof node.addEventListener === "function") {
      node.addEventListener(event, handler);
      return;
    }
    let eventMap = this.events.get(node);
    if (!eventMap) {
      eventMap = new Map();
      this.events.set(node, eventMap);
    }
    let handlers = eventMap.get(event);
    if (!handlers) {
      handlers = [];
      eventMap.set(event, handlers);
    }
    handlers.push(handler);
  };

  /** Dispatch an event to all handlers registered via `on`. */
  emit(node: any, event: string, value?: any): void {
    const eventMap = this.events.get(node);
    if (!eventMap) return;
    const handlers = eventMap.get(event);
    if (!handlers) return;
    const handlerCount = handlers.length;
    for (let i = 0; i < handlerCount; i += 1) handlers[i](value);
  }

  /** Run a Badodo Script source string against the registered nodes. */
  run(source: string): void {
    const { ast, typescript } = compileWithAst(source);
    if (ast.body.some((stmt) => stmt.kind === "ImportDecl")) {
      throw new Error("包含 import 的 BDS 必须先交给 Node/浏览器 bundler 解析，再调用 runCompiled 执行");
    }
    const nodeNames = collectNodes(ast);
    this.runCompiled(typescript, nodeNames);
  }

  /** Execute already-compiled JavaScript with the given node names injected. */
  runCompiled(code: string, nodeNames: string[]): void {
    assertBdsPayload({ version: BDS_PAYLOAD_VERSION, nodeNames, code });
    const args = [
      ...this.resolveNodeArgs(nodeNames),
      this.bind,
      this.watch,
      this.onFrame,
      this.on,
      this.animate,
      this.animateTo,
      vec3,
      color,
      some,
      none,
      ok,
      err,
      is_ok,
      unwrap,
    ];
    const cacheKey = `${nodeNames.join("\u0000")}\u0000${code}`;
    let fn = COMPILED_EXECUTOR_CACHE.get(cacheKey);
    if (!fn) {
      fn = new Function(...nodeNames, "bind", "watch", "onFrame", "on", "animate", "animateTo", "vec3", "color", "some", "none", "ok", "err", "is_ok", "unwrap", code) as CompiledExecutor;
      if (COMPILED_EXECUTOR_CACHE.size >= MAX_COMPILED_EXECUTORS) {
        const oldest = COMPILED_EXECUTOR_CACHE.keys().next().value;
        if (oldest !== undefined) COMPILED_EXECUTOR_CACHE.delete(oldest);
      }
      COMPILED_EXECUTOR_CACHE.set(cacheKey, fn);
    }
    fn(...args);
  }

  /** Advance one frame. Call this from Babylon's render loop or requestAnimationFrame. */
  tick(deltaTime: number): void {
    this.time += deltaTime;

    for (const handler of this.frameHandlers) {
      handler(this.time);
    }

    for (const w of this.watchers) {
      const value = w.getter();
      if (!w.initialized || !Object.is(value, w.prev)) {
        w.initialized = true;
        w.prev = value;
        w.handler(value);
      }
    }

    for (const b of this.bindings) {
      const value = b.getter();
      if (!b.initialized || !Object.is(value, b.prev)) {
        b.initialized = true;
        b.prev = value;
        b.node[b.prop] = value;
      }
    }

    let activeTweens = 0;
    for (let i = 0; i < this.tweens.length; i += 1) {
      const tween = this.tweens[i];
      tween.elapsed += deltaTime;
      const t = Math.min(tween.elapsed / tween.duration, 1);
      if (tween.isVector) {
        writeVectorLerp(tween.node, tween.prop, tween.from, tween.to, t);
      } else {
        tween.node[tween.prop] = tween.from + (tween.to - tween.from) * t;
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
}

interface CompileWithAstResult {
  ast: Program;
  typescript: string;
}

function compileWithAst(source: string): CompileWithAstResult {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const typescript = generateTypeScript(ast);
  return { ast, typescript };
}

function isVectorLike(value: any): boolean {
  return (
    value != null &&
    typeof value === "object" &&
    typeof value.x === "number" &&
    typeof value.y === "number"
  );
}

function normalizeVector(value: any): { x: number; y: number; z: number } {
  return {
    x: value?.x ?? 0,
    y: value?.y ?? 0,
    z: value?.z ?? 0,
  };
}

function writeVectorLerp(node: any, prop: string, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, t: number): void {
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;
  const z = from.z + (to.z - from.z) * t;
  if (prop === "position" && node.position && typeof node.position === "object") {
    node.position.x = x;
    node.position.y = y;
    node.position.z = z;
    return;
  }
  if (node[prop] && typeof node[prop] === "object") {
    node[prop].x = x;
    node[prop].y = y;
    node[prop].z = z;
    return;
  }
  node[prop] = { x, y, z };
}
