import * as AST from "../ast";

/**
 * WASM backend: compile Badodo Script "pure compute" functions to WAT
 * (WebAssembly Text), then to a .wasm binary via wabt.
 *
 * Supported subset (all numbers are f64):
 *   - function params & local variables
 *   - number literals
 *   - arithmetic: + - * /
 *   - comparison: > < >= <= == !=
 *   - return
 *   - if / else (as an expression whose branches return a value)
 *   - calls to other pure functions
 *
 * Node access, events, bind/watch/animate/every-frame are NOT compiled to
 * WASM — they stay in the TypeScript/runtime path.
 */

interface FuncInfo {
  func: AST.FuncDef;
  params: string[];
  locals: string[];
}

const ARITH_OP: Record<string, string> = {
  "+": "f64.add",
  "-": "f64.sub",
  "*": "f64.mul",
  "/": "f64.div",
};

const CMP_OP: Record<string, string> = {
  ">": "f64.gt",
  "<": "f64.lt",
  ">=": "f64.ge",
  "<=": "f64.le",
  "==": "f64.eq",
  "!=": "f64.ne",
};

export function isPureFunction(func: AST.FuncDef): boolean {
  return isPureBlock(func.body);
}

function isPureBlock(block: AST.Block): boolean {
  for (const stmt of block.body) {
    if (!isPureStmt(stmt)) return false;
  }
  return true;
}

function isPureStmt(stmt: AST.Stmt): boolean {
  switch (stmt.kind) {
    case "VarDecl":
    case "Assign":
      return isPureExpr(stmt.value);
    case "Return":
      return stmt.value === null || isPureExpr(stmt.value);
    case "If":
      return isPureBlock(stmt.thenBlock) && (stmt.elseBlock ? isPureBlock(stmt.elseBlock) : true);
    case "ExpressionStmt":
      return isPureExpr(stmt.expression);
    case "Repeat":
    case "FuncDef":
    case "When":
    case "BindStmt":
    case "WatchStmt":
    case "EveryFrame":
    case "Animate":
    case "ForIn":
    case "SharedDecl":
    case "TypeDecl":
    case "EnumDecl":
    case "ImportDecl":
      return false;
  }
}

function isPureExpr(expr: AST.Expr): boolean {
  switch (expr.kind) {
    case "Literal":
      return typeof expr.value === "number";
    case "Identifier":
      return true;
    case "BinaryOp":
      return isPureExpr(expr.left) && isPureExpr(expr.right);
    case "UnaryOp":
      return isPureExpr(expr.operand);
    case "Call":
      return expr.callee.kind === "Identifier" && expr.args.every(isPureExpr);
    case "MemberAccess":
    case "IndexAccess":
    case "ArrayLiteral":
    case "MapLiteral":
    case "AwaitExpr":
      return false;
  }
}

export class WatGenerator {
  private funcs = new Map<string, FuncInfo>();

  constructor(private program: AST.Program) {}

  generate(): { wat: string; exported: string[] } {
    // Collect pure functions and their local variables.
    const pure: FuncInfo[] = [];
    for (const stmt of this.program.body) {
      if (stmt.kind === "FuncDef" && isPureFunction(stmt)) {
        pure.push(this.analyze(stmt));
      }
    }
    for (const info of pure) this.funcs.set(info.func.name, info);

    const parts = ["(module"];
    for (const info of pure) {
      parts.push(this.emitFunction(info));
    }
    for (const info of pure) {
      parts.push(`  (export "${info.func.name}" (func $${info.func.name}))`);
    }
    parts.push(")");

    return { wat: parts.join("\n"), exported: pure.map((p) => p.func.name) };
  }

  private analyze(func: AST.FuncDef): FuncInfo {
    const locals = new Set<string>();
    const collect = (block: AST.Block): void => {
      for (const stmt of block.body) {
        switch (stmt.kind) {
          case "VarDecl":
            locals.add(stmt.name);
            break;
          case "Assign":
            if (stmt.target.kind === "Identifier") locals.add(stmt.target.name);
            break;
          case "If":
            collect(stmt.thenBlock);
            if (stmt.elseBlock) collect(stmt.elseBlock);
            break;
          default:
            break;
        }
      }
    };
    collect(func.body);
    for (const p of func.params) locals.delete(p);
    return { func, params: func.params, locals: Array.from(locals) };
  }

  private emitFunction(info: FuncInfo): string {
    const { func, params, locals } = info;
    const lines: string[] = [];
    lines.push(`  (func $${func.name}`);
    params.forEach((p, i) => lines.push(`    (param $${p} f64)`));
    lines.push(`    (result f64)`);
    locals.forEach((l) => lines.push(`    (local $${l} f64)`));

    const body = this.emitBlock(func.body);
    lines.push(body);
    lines.push("  )");
    return lines.join("\n");
  }

  private emitBlock(block: AST.Block): string {
    const out: string[] = [];
    for (const stmt of block.body) {
      out.push(this.emitStmt(stmt));
    }
    return out.join("\n");
  }

  private emitStmt(stmt: AST.Stmt): string {
    switch (stmt.kind) {
      case "VarDecl":
        return `${this.emitExpr(stmt.value)}\n    local.set $${stmt.name}`;
      case "Assign":
        if (stmt.target.kind === "Identifier") {
          return `${this.emitExpr(stmt.value)}\n    local.set $${stmt.target.name}`;
        }
        throw new Error("WASM 后端不支持属性赋值");
      case "Return":
        if (stmt.value) return this.emitExpr(stmt.value);
        return "";
      case "ExpressionStmt":
        return `${this.emitExpr(stmt.expression)}\n    drop`;
      case "If":
        return this.emitIf(stmt);
      default:
        throw new Error(`WASM 后端不支持的语句: ${stmt.kind}`);
    }
  }

  private emitIf(stmt: AST.If): string {
    const cond = this.emitExpr(stmt.condition);
    const thenBody = this.emitBlock(stmt.thenBlock);
    const elseBody = stmt.elseBlock ? this.emitBlock(stmt.elseBlock) : "";
    const parts = [cond, "    (if (result f64)", `      (then\n${indent(thenBody, 8)}\n      )`];
    if (elseBody) {
      parts.push(`      (else\n${indent(elseBody, 8)}\n      )`);
    }
    parts.push("    )");
    return parts.join("\n");
  }

  private emitExpr(expr: AST.Expr): string {
    switch (expr.kind) {
      case "Literal":
        return `    f64.const ${expr.value}`;
      case "Identifier":
        return `    local.get $${expr.name}`;
      case "BinaryOp":
        if (ARITH_OP[expr.op]) {
          return `${this.emitExpr(expr.left)}\n${this.emitExpr(expr.right)}\n    ${ARITH_OP[expr.op]}`;
        }
        if (CMP_OP[expr.op]) {
          return `${this.emitExpr(expr.left)}\n${this.emitExpr(expr.right)}\n    ${CMP_OP[expr.op]}`;
        }
        throw new Error(`WASM 后端不支持的运算符: ${expr.op}`);
      case "UnaryOp":
        if (expr.op === "-") {
          return `    f64.const 0\n${this.emitExpr(expr.operand)}\n    f64.sub`;
        }
        return this.emitExpr(expr.operand);
      case "Call":
        if (expr.callee.kind !== "Identifier") throw new Error("WASM 后端不支持方法调用");
        const args = expr.args.map((a) => this.emitExpr(a)).join("\n");
        return `${args}\n    call $${expr.callee.name}`;
      default:
        throw new Error(`WASM 后端不支持的表达式: ${expr.kind}`);
    }
  }
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((l) => (l.length ? pad + l : l))
    .join("\n");
}

export function generateWat(program: AST.Program): { wat: string; exported: string[] } {
  return new WatGenerator(program).generate();
}
