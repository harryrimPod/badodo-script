import * as AST from "../ast";
import { RuntimeExecutionError, asRuntimeHostFailure } from "./errors";
import { assertRuntimeProgram, isUnsafeRuntimeName, RuntimeProgram } from "./program";
import { resolveScopes } from "../scope";

export type RuntimePrimitive = null | boolean | number | string;

/** Opaque node handle. The executor never inspects the host-owned handle. */
export interface RuntimeNodeHandle {
  readonly kind: "RuntimeNode";
  readonly name: string;
}

export interface RuntimeRecord {
  readonly [key: string]: RuntimeValue;
}

export interface RuntimeCallable {
  readonly kind: "RuntimeCallable";
  readonly name: string;
  readonly invoke: (args: readonly RuntimeValue[], state: ExecutionState, host: RuntimeHost) => RuntimeValue;
}

export type RuntimeValue = RuntimePrimitive | undefined | RuntimeValue[] | RuntimeRecord | RuntimeNodeHandle | RuntimeCallable;

/** Explicit host capabilities available to canonical runtime programs. */
export interface RuntimeHost {
  resolveNode(name: string): RuntimeNodeHandle;
  readNodeProperty(node: RuntimeNodeHandle, property: string): RuntimeValue;
  writeNodeProperty(node: RuntimeNodeHandle, property: string, value: RuntimeValue): void;
  invokeNodeMethod(node: RuntimeNodeHandle, method: string, args: readonly RuntimeValue[]): RuntimeValue;
  registerBinding(getter: () => RuntimeValue, node: RuntimeNodeHandle, property: string): void;
  registerWatch(getter: () => RuntimeValue, handler: (value: RuntimeValue) => void): void;
  registerFrame(handler: (time: number, delta: number) => void): void;
  registerEvent(node: RuntimeNodeHandle, event: string, handler: (value?: RuntimeValue) => void): void;
  animate(node: RuntimeNodeHandle, property: string, value: RuntimeValue, duration: number): void;
  animateTo(node: RuntimeNodeHandle, target: RuntimeNodeHandle, duration: number): void;
}

export interface RuntimeLimits {
  readonly maxSteps: number;
  readonly maxLoopIterations: number;
  readonly maxCallDepth: number;
}

export const DEFAULT_RUNTIME_LIMITS: RuntimeLimits = Object.freeze({
  maxSteps: 10_000,
  maxLoopIterations: 1_000,
  maxCallDepth: 64,
});

export interface ExecutionState {
  readonly limits: RuntimeLimits;
  steps: number;
  loopIterations: number;
  callDepth: number;
}

class Environment {
  private readonly values = new Map<string, RuntimeValue>();

  constructor(private readonly parent?: Environment) {}

  define(name: string, value: RuntimeValue): void {
    this.values.set(name, value);
  }

  hasLocal(name: string): boolean {
    return this.values.has(name);
  }

  lookup(name: string): RuntimeValue | undefined {
    if (this.values.has(name)) return this.values.get(name);
    return this.parent?.lookup(name);
  }

  has(name: string): boolean {
    return this.values.has(name) || Boolean(this.parent?.has(name));
  }

  assign(name: string, value: RuntimeValue): void {
    if (this.values.has(name)) {
      this.values.set(name, value);
      return;
    }
    if (this.parent?.has(name)) {
      this.parent.assign(name, value);
      return;
    }
    throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `变量「${name}」尚未声明`);
  }
}

class ReturnSignal {
  constructor(readonly value: RuntimeValue) {}
}

/**
 * Interpreter for the versioned canonical RuntimeProgram data.
 *
 * It deliberately evaluates AST data through explicit host capabilities. No
 * generated JavaScript is parsed, compiled, or executed here.
 */
export class RuntimeExecutor {
  readonly limits: RuntimeLimits;
  /**
   * `VarDecl` nodes that assign an existing binding (docs/spec.md 5.1.1),
   * collected per executed program. Keyed by node identity, so programs run
   * by the same executor never affect each other.
   */
  private readonly reassignments = new WeakSet<AST.VarDecl>();
  private readonly resolvedPrograms = new WeakSet<AST.Program>();

  constructor(limits: Partial<RuntimeLimits> = {}) {
    this.limits = normalizeLimits(limits);
  }

  execute(programInput: RuntimeProgram, host: RuntimeHost): void {
    const program = assertRuntimeProgram(programInput);
    const state = this.newState();
    this.assertExecutableProgram(program, state);
    this.resolveProgramScopes(program.ast);
    const root = new Environment();
    this.installBuiltins(root);
    this.predeclareFunctions(program.ast.body, root, state);
    try {
      this.executeStatements(program.ast.body, root, state, host);
    } catch (error) {
      if (error instanceof ReturnSignal) return;
      throw this.normalizeRuntimeError(error);
    }
  }

  private resolveProgramScopes(ast: AST.Program): void {
    if (this.resolvedPrograms.has(ast)) return;
    const resolution = resolveScopes(ast);
    const collect = (statements: readonly AST.Stmt[]): void => {
      for (const statement of statements) {
        switch (statement.kind) {
          case "VarDecl":
            if (resolution.isReassignment(statement)) this.reassignments.add(statement);
            break;
          case "If":
            collect(statement.thenBlock.body);
            if (statement.elseBlock) collect(statement.elseBlock.body);
            break;
          case "Repeat":
          case "FuncDef":
          case "When":
          case "WatchStmt":
          case "EveryFrame":
          case "ForIn":
            collect(statement.body.body);
            break;
          default:
            break;
        }
      }
    };
    collect(ast.body);
    this.resolvedPrograms.add(ast);
  }

  private newState(): ExecutionState {
    return { limits: this.limits, steps: 0, loopIterations: 0, callDepth: 0 };
  }

  private assertExecutableProgram(program: RuntimeProgram, state: ExecutionState): void {
    void state;
    if (program.ast.body.some((statement) => statement.kind === "ImportDecl")) {
      throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", "运行时不能直接执行包含 import 的 BDS；请先由 bundler 处理模块");
    }
    for (const name of program.nodeNames) {
      if (isUnsafeRuntimeName(name)) {
        throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `节点名称「${name}」被运行时安全策略拒绝`);
      }
    }
  }

  private installBuiltins(environment: Environment): void {
    environment.define("vec3", callable("vec3", (args) => {
      requireArity("vec3", args, 3);
      return record({ x: requireNumber(args[0], "vec3.x"), y: requireNumber(args[1], "vec3.y"), z: requireNumber(args[2], "vec3.z") });
    }));
    environment.define("color", callable("color", (args) => {
      requireArity("color", args, 3);
      return record({ r: requireNumber(args[0], "color.r"), g: requireNumber(args[1], "color.g"), b: requireNumber(args[2], "color.b") });
    }));
    environment.define("some", callable("some", (args) => {
      requireArity("some", args, 1);
      return record({ kind: "some", value: args[0] });
    }));
    environment.define("none", callable("none", (args) => {
      requireArity("none", args, 0);
      return record({ kind: "none" });
    }));
    environment.define("ok", callable("ok", (args) => {
      requireArity("ok", args, 1);
      return record({ ok: true, value: args[0] });
    }));
    environment.define("err", callable("err", (args) => {
      requireArity("err", args, 1);
      return record({ ok: false, error: args[0] });
    }));
    environment.define("is_ok", callable("is_ok", (args) => {
      requireArity("is_ok", args, 1);
      const value = args[0];
      return isRecord(value) && value.ok === true;
    }));
    environment.define("unwrap", callable("unwrap", (args) => {
      requireArity("unwrap", args, 1);
      const value = args[0];
      if (!isRecord(value) || value.ok !== true) {
        throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `Result unwrap 失败: ${String(isRecord(value) ? value.error : value)}`);
      }
      return value.value;
    }));
    environment.define("time", 0);
    environment.define("delta", 0);
    environment.define("value", undefined);
  }

  private predeclareFunctions(statements: readonly AST.Stmt[], environment: Environment, state: ExecutionState): void {
    for (const statement of statements) {
      if (statement.kind !== "FuncDef" || environment.hasLocal(statement.name)) continue;
      environment.define(statement.name, this.makeFunction(statement, environment, state));
    }
  }

  private makeFunction(definition: AST.FuncDef, closure: Environment, _definitionState: ExecutionState): RuntimeCallable {
    return callable(definition.name, (args, state, host) => {
      if (definition.async) {
        throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `运行时暂不支持 async func「${definition.name}」的异步执行`, definition.line);
      }
      if (state.callDepth >= state.limits.maxCallDepth) {
        throw new RuntimeExecutionError("RUNTIME_CALL_DEPTH_LIMIT", `函数调用深度超过 ${state.limits.maxCallDepth}`, definition.line);
      }
      state.callDepth += 1;
      try {
        const functionEnvironment = new Environment(closure);
        for (let i = 0; i < definition.params.length; i += 1) {
          functionEnvironment.define(definition.params[i], args[i]);
        }
        this.predeclareFunctions(definition.body.body, functionEnvironment, state);
        try {
          this.executeStatements(definition.body.body, functionEnvironment, state, host);
        } catch (error) {
          if (error instanceof ReturnSignal) return error.value;
          throw error;
        }
        return undefined;
      } finally {
        state.callDepth -= 1;
      }
    });
  }

  private executeStatements(statements: readonly AST.Stmt[], environment: Environment, state: ExecutionState, host: RuntimeHost): void {
    for (const statement of statements) {
      this.step(state, statement.line);
      this.executeStatement(statement, environment, state, host);
    }
  }

  private executeStatement(statement: AST.Stmt, environment: Environment, state: ExecutionState, host: RuntimeHost): void {
    switch (statement.kind) {
      case "SharedDecl":
      case "TypeDecl":
      case "FuncDef":
        return;
      case "EnumDecl": {
        const values: Record<string, RuntimeValue> = Object.create(null) as Record<string, RuntimeValue>;
        for (const value of statement.values) values[value] = value;
        environment.define(statement.name, Object.freeze(values));
        return;
      }
      case "ImportDecl":
        throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", "运行时不能执行 import", statement.line);
      case "VarDecl": {
        const value = this.evaluate(statement.value, environment, state, host, statement.line);
        if (this.reassignments.has(statement)) {
          environment.assign(statement.name, value);
        } else {
          environment.define(statement.name, value);
        }
        return;
      }
      case "Assign":
        this.assign(statement.target, this.evaluate(statement.value, environment, state, host, statement.line), environment, state, host, statement.line);
        return;
      case "If":
        if (this.isTruthy(this.evaluate(statement.condition, environment, state, host, statement.line))) {
          this.executeBlock(statement.thenBlock, environment, state, host);
        } else if (statement.elseBlock) {
          this.executeBlock(statement.elseBlock, environment, state, host);
        }
        return;
      case "Repeat": {
        const count = requireNumber(this.evaluate(statement.count, environment, state, host, statement.line), "repeat count");
        const iterations = Math.max(0, Math.trunc(count));
        for (let index = 0; index < iterations; index += 1) {
          this.loopStep(state, statement.line);
          this.executeBlock(statement.body, environment, state, host);
        }
        return;
      }
      case "Return":
        throw new ReturnSignal(statement.value ? this.evaluate(statement.value, environment, state, host, statement.line) : undefined);
      case "When": {
        const target = this.requireNode(this.evaluate(statement.target, environment, state, host, statement.line), statement.line);
        try {
          host.registerEvent(target, statement.event, (value) => {
            const callbackState = this.newState();
            const callbackEnvironment = new Environment(environment);
            callbackEnvironment.define("value", value);
            try {
              this.executeBlock(statement.body, callbackEnvironment, callbackState, host);
            } catch (error) {
              throw this.normalizeRuntimeError(error);
            }
          });
        } catch (error) {
          throw asRuntimeHostFailure(error, "注册事件", statement.line);
        }
        return;
      }
      case "BindStmt": {
        const target = this.requireNode(this.evaluate(statement.target.object, environment, state, host, statement.line), statement.line);
        const getter = () => this.evaluateCallback(statement.source, environment, host, "bind");
        try {
          host.registerBinding(getter, target, statement.target.member);
        } catch (error) {
          throw asRuntimeHostFailure(error, "注册绑定", statement.line);
        }
        return;
      }
      case "WatchStmt": {
        const getter = () => this.evaluateCallback(statement.source, environment, host, "watch");
        const handler = (value: RuntimeValue) => {
          const callbackState = this.newState();
          const callbackEnvironment = new Environment(environment);
          callbackEnvironment.define("value", value);
          try {
            this.executeBlock(statement.body, callbackEnvironment, callbackState, host);
          } catch (error) {
            throw this.normalizeRuntimeError(error);
          }
        };
        try {
          host.registerWatch(getter, handler);
        } catch (error) {
          throw asRuntimeHostFailure(error, "注册监听", statement.line);
        }
        return;
      }
      case "EveryFrame": {
        const handler = (time: number, delta: number) => {
          const callbackState = this.newState();
          const callbackEnvironment = new Environment(environment);
          callbackEnvironment.define("time", time);
          callbackEnvironment.define("delta", delta);
          try {
            this.executeBlock(statement.body, callbackEnvironment, callbackState, host);
          } catch (error) {
            throw this.normalizeRuntimeError(error);
          }
        };
        try {
          host.registerFrame(handler);
        } catch (error) {
          throw asRuntimeHostFailure(error, "注册帧处理器", statement.line);
        }
        return;
      }
      case "Animate": {
        const value = this.evaluate(statement.value, environment, state, host, statement.line);
        const duration = requireNumber(this.evaluate(statement.duration, environment, state, host, statement.line), "animate duration");
        try {
          if (statement.target.kind === "MemberAccess") {
            const node = this.requireNode(this.evaluate(statement.target.object, environment, state, host, statement.line), statement.line);
            host.animate(node, statement.target.member, value, duration);
          } else {
            const node = this.requireNode(this.evaluate(statement.target, environment, state, host, statement.line), statement.line);
            const target = this.requireNode(value, statement.line);
            host.animateTo(node, target, duration);
          }
        } catch (error) {
          throw asRuntimeHostFailure(error, "注册动画", statement.line);
        }
        return;
      }
      case "ForIn": {
        const iterable = this.evaluate(statement.iterable, environment, state, host, statement.line);
        const values = iterableValues(iterable, statement.line);
        for (const value of values) {
          this.loopStep(state, statement.line);
          const iterationEnvironment = new Environment(environment);
          iterationEnvironment.define(statement.item, value);
          this.executeBlock(statement.body, iterationEnvironment, state, host);
        }
        return;
      }
      case "ExpressionStmt":
        this.evaluate(statement.expression, environment, state, host, statement.line);
        return;
    }
  }

  private executeBlock(block: AST.Block, parent: Environment, state: ExecutionState, host: RuntimeHost): void {
    const environment = new Environment(parent);
    this.predeclareFunctions(block.body, environment, state);
    this.executeStatements(block.body, environment, state, host);
  }

  private assign(target: AST.Expr, value: RuntimeValue, environment: Environment, state: ExecutionState, host: RuntimeHost, line: number): void {
    if (target.kind === "Identifier") {
      if (isUnsafeRuntimeName(target.name)) throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `名称「${target.name}」被运行时安全策略拒绝`, line);
      environment.assign(target.name, value);
      return;
    }
    if (target.kind === "MemberAccess") {
      const object = this.evaluate(target.object, environment, state, host, line);
      this.writeMember(object, target.member, value, host, line);
      return;
    }
    if (target.kind === "IndexAccess") {
      const object = this.evaluate(target.object, environment, state, host, line);
      const index = this.evaluate(target.index, environment, state, host, line);
      this.writeMember(object, propertyKey(index, line), value, host, line);
      return;
    }
    throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", "该表达式不能作为赋值目标", line);
  }

  private evaluateCallback(expression: AST.Expr, environment: Environment, host: RuntimeHost, operation: string): RuntimeValue {
    const state = this.newState();
    try {
      return this.evaluate(expression, environment, state, host, undefined);
    } catch (error) {
      throw this.normalizeRuntimeError(error, `${operation} getter 执行失败`);
    }
  }

  private evaluate(expression: AST.Expr, environment: Environment, state: ExecutionState, host: RuntimeHost, line?: number): RuntimeValue {
    this.step(state, line);
    switch (expression.kind) {
      case "Literal": return expression.value;
      case "Identifier": return this.resolveIdentifier(expression.name, environment, host, line);
      case "ArrayLiteral": return expression.elements.map((element) => this.evaluate(element, environment, state, host, line));
      case "MapLiteral": {
        const value: Record<string, RuntimeValue> = Object.create(null) as Record<string, RuntimeValue>;
        for (const entry of expression.entries) {
          assertSafeProperty(entry.key, line);
          value[entry.key] = this.evaluate(entry.value, environment, state, host, line);
        }
        return value;
      }
      case "MemberAccess": {
        const object = this.evaluate(expression.object, environment, state, host, line);
        return this.readMember(object, expression.member, host, line);
      }
      case "IndexAccess": {
        const object = this.evaluate(expression.object, environment, state, host, line);
        const index = this.evaluate(expression.index, environment, state, host, line);
        return this.readMember(object, propertyKey(index, line), host, line);
      }
      case "AwaitExpr":
        throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", "bounded runtime 不执行异步 await", line);
      case "UnaryOp": {
        const operand = requireNumber(this.evaluate(expression.operand, environment, state, host, line), "一元运算数");
        if (expression.op === "+") return operand;
        if (expression.op === "-") return -operand;
        throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `不支持的一元运算符「${expression.op}」`, line);
      }
      case "BinaryOp": {
        const left = this.evaluate(expression.left, environment, state, host, line);
        const right = this.evaluate(expression.right, environment, state, host, line);
        return this.binary(expression.op, left, right, line);
      }
      case "Call":
        return this.call(expression, environment, state, host, line);
    }
  }

  private resolveIdentifier(name: string, environment: Environment, host: RuntimeHost, line?: number): RuntimeValue {
    if (isUnsafeRuntimeName(name)) throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `名称「${name}」被运行时安全策略拒绝`, line);
    if (environment.has(name)) return environment.lookup(name);
    try {
      return host.resolveNode(name);
    } catch (error) {
      if (error instanceof RuntimeExecutionError) throw error;
      throw asRuntimeHostFailure(error, `解析节点「${name}」`, line);
    }
  }

  private call(expression: AST.Call, environment: Environment, state: ExecutionState, host: RuntimeHost, line?: number): RuntimeValue {
    const args = expression.args.map((arg) => this.evaluate(arg, environment, state, host, line));
    if (expression.callee.kind === "MemberAccess") {
      const object = this.evaluate(expression.callee.object, environment, state, host, line);
      if (isNode(object)) return this.invokeNode(object, expression.callee.member, args, host, line);
      return this.invokeCallable(this.readMember(object, expression.callee.member, host, line), args, state, host, line);
    }
    if (expression.callee.kind === "IndexAccess") {
      const object = this.evaluate(expression.callee.object, environment, state, host, line);
      const index = this.evaluate(expression.callee.index, environment, state, host, line);
      if (isNode(object)) return this.invokeNode(object, propertyKey(index, line), args, host, line);
      return this.invokeCallable(this.readMember(object, propertyKey(index, line), host, line), args, state, host, line);
    }
    const callee = this.evaluate(expression.callee, environment, state, host, line);
    return this.invokeCallable(callee, args, state, host, line);
  }

  private invokeNode(node: RuntimeNodeHandle, method: string, args: readonly RuntimeValue[], host: RuntimeHost, line?: number): RuntimeValue {
    assertSafeProperty(method, line);
    try {
      return host.invokeNodeMethod(node, method, args);
    } catch (error) {
      throw asRuntimeHostFailure(error, `调用节点「${node.name}.${method}」`, line);
    }
  }

  private invokeCallable(value: RuntimeValue, args: readonly RuntimeValue[], state: ExecutionState, host: RuntimeHost, line?: number): RuntimeValue {
    if (!isCallable(value)) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "调用目标不是受支持的 runtime function", line);
    this.step(state, line);
    try {
      return value.invoke(args, state, host);
    } catch (error) {
      throw this.normalizeRuntimeError(error);
    }
  }


  private readMember(value: RuntimeValue, property: string, host: RuntimeHost, line?: number): RuntimeValue {
    assertSafeProperty(property, line);
    if (isNode(value)) {
      try {
        return host.readNodeProperty(value, property);
      } catch (error) {
        throw asRuntimeHostFailure(error, `读取节点属性「${value.name}.${property}」`, line);
      }
    }
    if (Array.isArray(value)) {
      if (property === "length") return value.length;
      const index = arrayIndex(property);
      if (index === undefined) throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `数组属性「${property}」不是数据属性`, line);
      return value[index];
    }
    if (typeof value === "string") {
      if (property === "length") return value.length;
      const index = arrayIndex(property);
      return index === undefined ? undefined : value[index];
    }
    if (isRecord(value)) {
      if (!Object.prototype.hasOwnProperty.call(value, property)) return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, property);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `属性「${property}」不是受支持的数据属性`, line);
      }
      if (typeof descriptor.value === "function") throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `禁止读取原生函数属性「${property}」`, line);
      return descriptor.value as RuntimeValue;
    }
    throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `值不支持属性访问「${property}」`, line);
  }

  private writeMember(value: RuntimeValue, property: string, next: RuntimeValue, host: RuntimeHost, line?: number): void {
    assertSafeProperty(property, line);
    if (isNode(value)) {
      try {
        host.writeNodeProperty(value, property, next);
      } catch (error) {
        throw asRuntimeHostFailure(error, `写入节点属性「${value.name}.${property}」`, line);
      }
      return;
    }
    if (Array.isArray(value)) {
      const index = arrayIndex(property);
      if (index === undefined) throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `不能写入数组属性「${property}」`, line);
      value[index] = next;
      return;
    }
    if (isRecord(value)) {
      (value as Record<string, RuntimeValue>)[property] = next;
      return;
    }
    throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `值不支持属性写入「${property}」`, line);
  }

  private binary(operator: string, left: RuntimeValue, right: RuntimeValue, line?: number): RuntimeValue {
    switch (operator) {
      case "+":
        if (typeof left === "string" || typeof right === "string") return String(left) + String(right);
        return requireNumber(left, "加法左值", line) + requireNumber(right, "加法右值", line);
      case "-": return requireNumber(left, "减法左值", line) - requireNumber(right, "减法右值", line);
      case "*": return requireNumber(left, "乘法左值", line) * requireNumber(right, "乘法右值", line);
      case "/": return requireNumber(left, "除法左值", line) / requireNumber(right, "除法右值", line);
      case "==": return left === right;
      case "!=": return left !== right;
      case ">": return comparable(left, right, line, (a, b) => a > b);
      case "<": return comparable(left, right, line, (a, b) => a < b);
      case ">=": return comparable(left, right, line, (a, b) => a >= b);
      case "<=": return comparable(left, right, line, (a, b) => a <= b);
      default: throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `不支持的二元运算符「${operator}」`, line);
    }
  }

  private requireNode(value: RuntimeValue, line?: number): RuntimeNodeHandle {
    if (!isNode(value)) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "该操作需要一个场景节点", line);
    return value;
  }

  private isTruthy(value: RuntimeValue): boolean {
    return Boolean(value);
  }

  private step(state: ExecutionState, line?: number): void {
    state.steps += 1;
    if (state.steps > state.limits.maxSteps) {
      throw new RuntimeExecutionError("RUNTIME_STEP_LIMIT", `执行步数超过 ${state.limits.maxSteps}`, line);
    }
  }

  private loopStep(state: ExecutionState, line?: number): void {
    state.loopIterations += 1;
    if (state.loopIterations > state.limits.maxLoopIterations) {
      throw new RuntimeExecutionError("RUNTIME_LOOP_LIMIT", `循环迭代次数超过 ${state.limits.maxLoopIterations}`, line);
    }
  }

  private normalizeRuntimeError(error: unknown, context?: string): RuntimeExecutionError {
    if (error instanceof RuntimeExecutionError) {
      if (!context) return error;
      return new RuntimeExecutionError(error.code, `${context}: ${error.message}`, error.line, error);
    }
    const message = error instanceof Error ? error.message : String(error);
    return new RuntimeExecutionError("RUNTIME_HOST_FAILURE", context ? `${context}: ${message}` : message, undefined, error);
  }
}

function callable(name: string, invoke: (args: readonly RuntimeValue[], state: ExecutionState, host: RuntimeHost) => RuntimeValue): RuntimeCallable {
  return { kind: "RuntimeCallable", name, invoke };
}

function record(values: Record<string, RuntimeValue>): RuntimeRecord {
  return { ...values };
}

function normalizeLimits(limits: Partial<RuntimeLimits>): RuntimeLimits {
  const result = {
    maxSteps: limits.maxSteps ?? DEFAULT_RUNTIME_LIMITS.maxSteps,
    maxLoopIterations: limits.maxLoopIterations ?? DEFAULT_RUNTIME_LIMITS.maxLoopIterations,
    maxCallDepth: limits.maxCallDepth ?? DEFAULT_RUNTIME_LIMITS.maxCallDepth,
  };
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new RuntimeExecutionError("RUNTIME_PROGRAM_INVALID", `${name} 必须是正整数`);
  }
  return Object.freeze(result);
}

function requireArity(name: string, args: readonly RuntimeValue[], count: number): void {
  if (args.length !== count) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `${name} 需要 ${count} 个参数，收到 ${args.length} 个`);
}

function requireNumber(value: RuntimeValue, label: string, line?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `${label} 必须是有限数字`, line);
  return value;
}

function comparable(left: RuntimeValue, right: RuntimeValue, line: number | undefined, operation: (left: number | string, right: number | string) => boolean): boolean {
  // An unresolved CLI scene node historically compared like a plain object
  // (therefore false for relational checks). Keep that benign behavior while
  // never coercing opaque host handles or exposing their internals.
  if (isNode(left) || isNode(right)) return false;
  if (typeof left === "number" && typeof right === "number") return operation(left, right);
  if (typeof left === "string" && typeof right === "string") return operation(left, right);
  throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "比较运算需要同类型数字或字符串", line);
}

function iterableValues(value: RuntimeValue, line: number): RuntimeValue[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return Array.from(value);
  throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "for-in 只支持数组或字符串", line);
}

function propertyKey(value: RuntimeValue, line?: number): string {
  if (typeof value === "string") {
    assertSafeProperty(value, line);
    return value;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "属性索引必须是安全的字符串或非负整数", line);
}

function arrayIndex(property: string): number | undefined {
  if (!/^(?:0|[1-9][0-9]*)$/.test(property)) return undefined;
  const value = Number(property);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function assertSafeProperty(property: string, line?: number): void {
  if (isUnsafeRuntimeName(property)) throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `属性「${property}」被运行时安全策略拒绝`, line);
}

function isRecord(value: RuntimeValue): value is RuntimeRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isNode(value) && !isCallable(value);
}

function isNode(value: RuntimeValue): value is RuntimeNodeHandle {
  return value !== null && typeof value === "object" && (value as { kind?: unknown }).kind === "RuntimeNode";
}

function isCallable(value: RuntimeValue): value is RuntimeCallable {
  return value !== null && typeof value === "object" && (value as { kind?: unknown }).kind === "RuntimeCallable";
}
