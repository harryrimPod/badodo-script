import * as AST from "./ast";

export type BdsType =
  | { kind: "unknown" }
  | { kind: "unit" }
  | { kind: "bool" }
  | { kind: "i32" }
  | { kind: "f64" }
  | { kind: "string" }
  | { kind: "bytes" }
  | { kind: "null" }
  | { kind: "array"; element: BdsType }
  | { kind: "map"; value: BdsType }
  | { kind: "option"; value: BdsType }
  | { kind: "result"; value: BdsType; error: BdsType }
  | { kind: "record"; name: string; fields: Record<string, BdsType> }
  | { kind: "node"; path: string[] }
  | { kind: "function"; params: BdsType[]; result: BdsType };

export interface TypeDiagnostic {
  code: "BDS-TYPE-001" | "BDS-TYPE-002" | "BDS-TYPE-003" | "BDS-TYPE-004";
  severity: "warning" | "error";
  message: string;
  line?: number;
}

export interface TypeCheckResult {
  diagnostics: TypeDiagnostic[];
  expressionTypes: Map<AST.Expr, BdsType>;
  declarationTypes: Map<AST.VarDecl, BdsType>;
}

const UNKNOWN: BdsType = { kind: "unknown" };
const UNIT: BdsType = { kind: "unit" };

interface Environment {
  parent?: Environment;
  values: Map<string, BdsType>;
}

interface FunctionContext {
  expectedReturn: BdsType;
  returns: BdsType[];
}

export function checkProgram(program: AST.Program): TypeCheckResult {
  const diagnostics: TypeDiagnostic[] = [];
  const expressionTypes = new Map<AST.Expr, BdsType>();
  const declarationTypes = new Map<AST.VarDecl, BdsType>();
  const root: Environment = { values: new Map() };
  const sharedTypes = new Map<string, Extract<BdsType, { kind: "record" }>>();

  for (const stmt of program.body) {
    if (stmt.kind === "SharedDecl" || stmt.kind === "TypeDecl") {
      sharedTypes.set(stmt.name, { kind: "record", name: stmt.name, fields: {} });
    }
    if (stmt.kind === "EnumDecl") {
      sharedTypes.set(stmt.name, { kind: "record", name: stmt.name, fields: Object.fromEntries(stmt.values.map((value) => [value, { kind: "string" as const }])) });
    }
  }
  for (const stmt of program.body) {
    if (stmt.kind === "SharedDecl" || stmt.kind === "TypeDecl") {
      const record = sharedTypes.get(stmt.name)!;
      for (const field of stmt.fields) record.fields[field.name] = typeFromRef(field.type, field.line);
      root.values.set(stmt.name, record);
    }
    if (stmt.kind === "EnumDecl") root.values.set(stmt.name, sharedTypes.get(stmt.name)!);
  }

  for (const stmt of program.body) {
    if (stmt.kind === "FuncDef") {
      const params = (stmt.paramTypes ?? []).map((type) => (type ? typeFromRef(type, stmt.line) : UNKNOWN));
      root.values.set(stmt.name, { kind: "function", params, result: stmt.returnType ? typeFromRef(stmt.returnType, stmt.line) : UNKNOWN });
    }
  }

  for (const stmt of program.body) checkStmt(stmt, root);
  return { diagnostics, expressionTypes, declarationTypes };

  function checkStmt(stmt: AST.Stmt, env: Environment, fn?: FunctionContext): void {
    switch (stmt.kind) {
      case "ImportDecl":
        return;
      case "VarDecl": {
        const inferred = checkExpr(stmt.value, env);
        const expected = stmt.typeAnnotation ? typeFromRef(stmt.typeAnnotation, stmt.line) : inferred;
        if (stmt.typeAnnotation && !assignable(inferred, expected)) {
          report("BDS-TYPE-001", "error", `变量「${stmt.name}」的值类型 ${typeName(inferred)} 不匹配注解 ${typeName(expected)}`, stmt.line);
        }
        env.values.set(stmt.name, expected);
        declarationTypes.set(stmt, expected);
        return;
      }
      case "Assign": {
        const value = checkExpr(stmt.value, env);
        if (stmt.target.kind === "Identifier") {
          const previous = lookup(env, stmt.target.name);
          if (previous && !assignable(value, previous)) {
            report("BDS-TYPE-001", "error", `变量「${stmt.target.name}」不能从 ${typeName(previous)} 赋值为 ${typeName(value)}`, stmt.line);
          }
        }
        checkExpr(stmt.target, env);
        return;
      }
      case "If":
        requireBoolean(checkExpr(stmt.condition, env), stmt.line, "if 条件");
        checkBlock(stmt.thenBlock, env, fn, `if@${stmt.line}`);
        if (stmt.elseBlock) checkBlock(stmt.elseBlock, env, fn, `else@${stmt.line}`);
        return;
      case "Repeat":
        requireNumeric(checkExpr(stmt.count, env), stmt.line, "repeat 次数");
        checkBlock(stmt.body, env, fn, `repeat@${stmt.line}`);
        return;
      case "FuncDef": {
        const signature = lookup(env, stmt.name);
        const functionType = signature?.kind === "function" ? signature : { kind: "function", params: [], result: UNKNOWN } as BdsType & { kind: "function" };
        const child: Environment = { parent: env, values: new Map() };
        for (let i = 0; i < stmt.params.length; i++) child.values.set(stmt.params[i], functionType.params[i] ?? UNKNOWN);
        const context: FunctionContext = { expectedReturn: functionType.result, returns: [] };
        for (const bodyStmt of stmt.body.body) checkStmt(bodyStmt, child, context);
        if (stmt.returnType) {
          for (const returned of context.returns) {
            if (!assignable(returned, context.expectedReturn)) {
              report("BDS-TYPE-001", "error", `函数「${stmt.name}」返回 ${typeName(returned)}，但声明为 ${typeName(context.expectedReturn)}`, stmt.line);
            }
          }
        }
        return;
      }
      case "Return": {
        const returned = stmt.value ? checkExpr(stmt.value, env) : UNIT;
        if (fn) fn.returns.push(returned);
        return;
      }
      case "When":
        checkExpr(stmt.target, env);
        checkBlock(stmt.body, env, fn, `when@${stmt.line}`);
        return;
      case "BindStmt":
        checkExpr(stmt.source, env);
        checkExpr(stmt.target, env);
        return;
      case "WatchStmt": {
        const source = checkExpr(stmt.source, env);
        const child: Environment = { parent: env, values: new Map([["value", source]]) };
        for (const bodyStmt of stmt.body.body) checkStmt(bodyStmt, child, fn);
        return;
      }
      case "EveryFrame": {
        const child: Environment = { parent: env, values: new Map([["time", { kind: "f64" }]]) };
        for (const bodyStmt of stmt.body.body) checkStmt(bodyStmt, child, fn);
        return;
      }
      case "Animate":
        checkExpr(stmt.target, env);
        checkExpr(stmt.value, env);
        requireNumeric(checkExpr(stmt.duration, env), stmt.line, "animate 时长");
        return;
      case "ForIn": {
        const iterable = checkExpr(stmt.iterable, env);
        const item = iterable.kind === "array" ? iterable.element : iterable.kind === "map" ? iterable.value : UNKNOWN;
        const child: Environment = { parent: env, values: new Map([[stmt.item, item]]) };
        for (const bodyStmt of stmt.body.body) checkStmt(bodyStmt, child, fn);
        return;
      }
      case "SharedDecl":
      case "TypeDecl":
      case "EnumDecl":
        return;
      case "ExpressionStmt":
        checkExpr(stmt.expression, env);
        return;
    }
  }

  function checkBlock(block: AST.Block, env: Environment, fn: FunctionContext | undefined, name: string): void {
    const child: Environment = { parent: env, values: new Map() };
    for (const stmt of block.body) checkStmt(stmt, child, fn);
    void name;
  }

  function checkExpr(expr: AST.Expr, env: Environment): BdsType {
    let type: BdsType;
    switch (expr.kind) {
      case "Literal":
        type = expr.value === null ? { kind: "null" } : typeof expr.value === "boolean" ? { kind: "bool" } : typeof expr.value === "string" ? { kind: "string" } : Number.isInteger(expr.value) ? { kind: "i32" } : { kind: "f64" };
        break;
      case "Identifier":
        type = lookup(env, expr.name) ?? { kind: "node", path: [expr.name] };
        break;
      case "MemberAccess": {
        const object = checkExpr(expr.object, env);
        if (object.kind === "node") type = { kind: "node", path: [...object.path, expr.member] };
        else if (object.kind === "record") type = object.fields[expr.member] ?? UNKNOWN;
        else type = UNKNOWN;
        break;
      }
      case "IndexAccess": {
        const object = checkExpr(expr.object, env);
        const indexType = checkExpr(expr.index, env);
        if (object.kind === "array") requireNumeric(indexType, undefined, "数组索引");
        type = object.kind === "array" ? object.element : object.kind === "map" ? object.value : UNKNOWN;
        break;
      }
      case "ArrayLiteral": {
        const elements = expr.elements.map((element) => checkExpr(element, env));
        type = { kind: "array", element: elements.reduce((common, item) => merge(common, item), UNKNOWN) };
        break;
      }
      case "MapLiteral": {
        const values = expr.entries.map((entry) => checkExpr(entry.value, env));
        type = { kind: "map", value: values.reduce((common, item) => merge(common, item), UNKNOWN) };
        break;
      }
      case "AwaitExpr":
        type = checkExpr(expr.operand, env);
        break;
      case "Call": {
        const callee = checkExpr(expr.callee, env);
        for (const arg of expr.args) checkExpr(arg, env);
        if (expr.callee.kind === "Identifier" && expr.callee.name === "vec3") type = { kind: "node", path: ["Vec3"] };
        else if (expr.callee.kind === "Identifier" && expr.callee.name === "color") type = { kind: "node", path: ["Color"] };
        else if (expr.callee.kind === "Identifier" && expr.callee.name === "some") type = { kind: "option", value: expr.args.length ? checkExpr(expr.args[0], env) : UNKNOWN };
        else if (expr.callee.kind === "Identifier" && expr.callee.name === "none") type = { kind: "option", value: UNKNOWN };
        else if (expr.callee.kind === "Identifier" && expr.callee.name === "ok") type = { kind: "result", value: expr.args.length ? checkExpr(expr.args[0], env) : UNKNOWN, error: UNKNOWN };
        else if (expr.callee.kind === "Identifier" && expr.callee.name === "err") type = { kind: "result", value: UNKNOWN, error: expr.args.length ? checkExpr(expr.args[0], env) : UNKNOWN };
        else if (expr.callee.kind === "Identifier" && expr.callee.name === "is_ok") type = { kind: "bool" };
        else if (expr.callee.kind === "Identifier" && expr.callee.name === "unwrap") type = UNKNOWN;
        else type = callee.kind === "function" ? callee.result : UNKNOWN;
        break;
      }
      case "BinaryOp": {
        const left = checkExpr(expr.left, env);
        const right = checkExpr(expr.right, env);
        if (["+", "-", "*", "/"].includes(expr.op)) {
          if (!isNumeric(left) || !isNumeric(right)) report("BDS-TYPE-003", "error", `运算符「${expr.op}」需要数值操作数`);
          type = left.kind === "f64" || right.kind === "f64" ? { kind: "f64" } : { kind: "i32" };
        } else {
          type = { kind: "bool" };
        }
        break;
      }
      case "UnaryOp":
        type = checkExpr(expr.operand, env);
        requireNumeric(type, undefined, "一元数值运算");
        break;
    }
    expressionTypes.set(expr, type);
    return type;
  }

  function typeFromRef(ref: AST.TypeRef, line?: number): BdsType {
    switch (ref.name) {
      case "bool": return { kind: "bool" };
      case "i32": return { kind: "i32" };
      case "f64": return { kind: "f64" };
      case "string": return { kind: "string" };
      case "bytes": return { kind: "bytes" };
      case "null": return { kind: "null" };
      case "array": return { kind: "array", element: UNKNOWN };
      case "map": return { kind: "map", value: UNKNOWN };
      case "option": return { kind: "option", value: UNKNOWN };
      case "result": return { kind: "result", value: UNKNOWN, error: UNKNOWN };
      case "record": return sharedTypes.get(ref.name) ?? UNKNOWN;
      default:
        if (sharedTypes.has(ref.name)) return sharedTypes.get(ref.name)!;
        report("BDS-TYPE-002", "warning", `类型「${ref.name}」尚未在 Phase 1 核心类型中定义`, line);
        return UNKNOWN;
    }
  }

  function lookup(env: Environment, name: string): BdsType | undefined {
    for (let current: Environment | undefined = env; current; current = current.parent) {
      const value = current.values.get(name);
      if (value) return value;
    }
    if (name === "vec3") return { kind: "function", params: [{ kind: "f64" }, { kind: "f64" }, { kind: "f64" }], result: { kind: "node", path: ["Vec3"] } };
    if (name === "color") return { kind: "function", params: [{ kind: "f64" }, { kind: "f64" }, { kind: "f64" }], result: { kind: "node", path: ["Color"] } };
    if (name === "some") return { kind: "function", params: [UNKNOWN], result: { kind: "option", value: UNKNOWN } };
    if (name === "none") return { kind: "function", params: [], result: { kind: "option", value: UNKNOWN } };
    if (name === "ok") return { kind: "function", params: [UNKNOWN], result: { kind: "result", value: UNKNOWN, error: UNKNOWN } };
    if (name === "err") return { kind: "function", params: [UNKNOWN], result: { kind: "result", value: UNKNOWN, error: UNKNOWN } };
    if (name === "is_ok") return { kind: "function", params: [UNKNOWN], result: { kind: "bool" } };
    if (name === "unwrap") return { kind: "function", params: [UNKNOWN], result: UNKNOWN };
    if (["time", "delta"].includes(name)) return { kind: "f64" };
    if (name === "value") return UNKNOWN;
    return undefined;
  }

  function assignable(actual: BdsType, expected: BdsType): boolean {
    return actual.kind === "unknown" || expected.kind === "unknown" || actual.kind === expected.kind || (actual.kind === "i32" && expected.kind === "f64") || (actual.kind === "record" && expected.kind === "record" && actual.name === expected.name) || (actual.kind === "map" && expected.kind === "record");
  }

  function merge(left: BdsType, right: BdsType): BdsType {
    if (left.kind === "unknown") return right;
    if (right.kind === "unknown" || left.kind === right.kind) return left;
    if (left.kind === "i32" && right.kind === "f64" || left.kind === "f64" && right.kind === "i32") return { kind: "f64" };
    return UNKNOWN;
  }

  function isNumeric(type: BdsType): boolean {
    return type.kind === "i32" || type.kind === "f64" || type.kind === "unknown";
  }

  function requireNumeric(type: BdsType, line: number | undefined, context: string): void {
    if (!isNumeric(type)) report("BDS-TYPE-003", "error", `${context}需要数值类型`, line);
  }

  function requireBoolean(type: BdsType, line: number, context: string): void {
    if (type.kind !== "bool" && type.kind !== "unknown") report("BDS-TYPE-004", "error", `${context}需要 bool`, line);
  }

  function typeName(type: BdsType): string {
    if (type.kind === "array") return `array<${typeName(type.element)}>`;
    if (type.kind === "map") return `map<${typeName(type.value)}>`;
    if (type.kind === "option") return `Option<${typeName(type.value)}>`;
    if (type.kind === "result") return `Result<${typeName(type.value)}, ${typeName(type.error)}>`;
    if (type.kind === "record") return type.name;
    if (type.kind === "node") return type.path.join(".");
    if (type.kind === "function") return "func";
    return type.kind;
  }

  function report(code: TypeDiagnostic["code"], severity: TypeDiagnostic["severity"], message: string, line?: number): void {
    diagnostics.push({ code, severity, message, line });
  }
}
