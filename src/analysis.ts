import * as AST from "./ast";

/**
 * Symbol classification used by the Phase 0 semantic contract.
 *
 * This analysis is intentionally non-blocking: an unknown root identifier is
 * reported as a scene-node candidate instead of becoming a compile error. That
 * preserves the current BDS authoring model while making the distinction
 * explicit for the future typed compiler.
 */
export type SymbolKind =
  | "variable"
  | "function"
  | "parameter"
  | "loop-variable"
  | "type"
  | "builtin"
  | "runtime"
  | "scene-node"
  | "unresolved";

export interface SymbolDeclaration {
  name: string;
  kind: Exclude<SymbolKind, "scene-node" | "unresolved">;
  scope: string;
  line?: number;
}

export interface SymbolReference {
  root: string;
  path: string[];
  kind: SymbolKind;
  scope: string;
  line?: number;
}

export interface SymbolDiagnostic {
  code: "BDS-SYMBOL-001" | "BDS-SYMBOL-002";
  severity: "info" | "warning";
  message: string;
  name: string;
  line?: number;
}

export interface SymbolAnalysis {
  declarations: SymbolDeclaration[];
  references: SymbolReference[];
  sceneNodes: string[];
  diagnostics: SymbolDiagnostic[];
}

const BUILTINS = new Set(["vec3", "color", "some", "none", "ok", "err", "is_ok", "unwrap"]);
const RUNTIME_NAMES = new Set(["time", "value", "delta", "bind", "watch", "onFrame", "on", "animate", "animateTo"]);

interface Scope {
  name: string;
  symbols: Map<string, SymbolDeclaration>;
}

export function analyzeProgram(program: AST.Program): SymbolAnalysis {
  const declarations: SymbolDeclaration[] = [];
  const references: SymbolReference[] = [];
  const diagnostics: SymbolDiagnostic[] = [];
  const sceneNodes = new Set<string>();
  const scopes: Scope[] = [{ name: "module", symbols: new Map() }];

  const declare = (name: string, kind: SymbolDeclaration["kind"], line?: number): void => {
    const scope = scopes[scopes.length - 1];
    if (scope.symbols.has(name)) {
      diagnostics.push({
        code: "BDS-SYMBOL-002",
        severity: "warning",
        message: `作用域「${scope.name}」中重复声明「${name}」`,
        name,
        line,
      });
      return;
    }
    const declaration: SymbolDeclaration = { name, kind, scope: scope.name, line };
    scope.symbols.set(name, declaration);
    declarations.push(declaration);
  };

  const lookup = (name: string): SymbolKind => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const symbol = scopes[i].symbols.get(name);
      if (symbol) return symbol.kind;
    }
    if (BUILTINS.has(name)) return "builtin";
    if (RUNTIME_NAMES.has(name)) return "runtime";
    return "scene-node";
  };

  const reference = (expr: AST.Expr, line?: number): void => {
    const { root, path } = rootPath(expr);
    if (!root) {
      visitExpr(expr, line);
      return;
    }
    const kind = lookup(root);
    references.push({ root, path, kind, scope: scopes[scopes.length - 1].name, line });
    if (kind === "scene-node") {
      sceneNodes.add(root);
      diagnostics.push({
        code: "BDS-SYMBOL-001",
        severity: "info",
        message: `未声明标识符「${root}」按兼容规则视为场景节点候选`,
        name: root,
        line,
      });
    }
    // A rootPath reference covers member access, but indexes and call arguments
    // can contain additional expressions that still need analysis.
    switch (expr.kind) {
      case "MemberAccess":
        return;
      case "IndexAccess":
        visitExpr(expr.index, line);
        return;
      case "Call":
        for (const arg of expr.args) visitExpr(arg, line);
        return;
      default:
        return;
    }
  };

  const visitExpr = (expr: AST.Expr, line?: number): void => {
    switch (expr.kind) {
      case "Identifier":
      case "MemberAccess":
      case "IndexAccess":
      case "Call":
        reference(expr, line);
        return;
      case "ArrayLiteral":
        for (const element of expr.elements) visitExpr(element, line);
        return;
      case "MapLiteral":
        for (const entry of expr.entries) visitExpr(entry.value, line);
        return;
      case "AwaitExpr":
        visitExpr(expr.operand, line);
        return;
      case "BinaryOp":
        visitExpr(expr.left, line);
        visitExpr(expr.right, line);
        return;
      case "UnaryOp":
        visitExpr(expr.operand, line);
        return;
      case "Literal":
        return;
    }
  };

  const visitBlock = (block: AST.Block, scopeName: string, implicit?: string): void => {
    scopes.push({ name: scopeName, symbols: new Map() });
    if (implicit) declare(implicit, "variable");
    for (const stmt of block.body) visitStmt(stmt);
    scopes.pop();
  };

  const visitStmt = (stmt: AST.Stmt): void => {
    switch (stmt.kind) {
      case "VarDecl":
        declare(stmt.name, "variable", stmt.line);
        visitExpr(stmt.value, stmt.line);
        return;
      case "Assign":
        visitExpr(stmt.target, stmt.line);
        visitExpr(stmt.value, stmt.line);
        return;
      case "If":
        visitExpr(stmt.condition, stmt.line);
        visitBlock(stmt.thenBlock, `if@${stmt.line}`);
        if (stmt.elseBlock) visitBlock(stmt.elseBlock, `else@${stmt.line}`);
        return;
      case "Repeat":
        visitExpr(stmt.count, stmt.line);
        visitBlock(stmt.body, `repeat@${stmt.line}`);
        return;
      case "FuncDef":
        declare(stmt.name, "function", stmt.line);
        scopes.push({ name: `func:${stmt.name}@${stmt.line}`, symbols: new Map() });
        for (const param of stmt.params) declare(param, "parameter", stmt.line);
        for (const bodyStmt of stmt.body.body) visitStmt(bodyStmt);
        scopes.pop();
        return;
      case "Return":
        if (stmt.value) visitExpr(stmt.value, stmt.line);
        return;
      case "When":
        visitExpr(stmt.target, stmt.line);
        visitBlock(stmt.body, `when@${stmt.line}`);
        return;
      case "BindStmt":
        visitExpr(stmt.source, stmt.line);
        visitExpr(stmt.target, stmt.line);
        return;
      case "WatchStmt":
        visitExpr(stmt.source, stmt.line);
        visitBlock(stmt.body, `watch@${stmt.line}`, "value");
        return;
      case "EveryFrame":
        visitBlock(stmt.body, `every-frame@${stmt.line}`, "time");
        return;
      case "Animate":
        visitExpr(stmt.target, stmt.line);
        visitExpr(stmt.value, stmt.line);
        visitExpr(stmt.duration, stmt.line);
        return;
      case "ForIn":
        visitExpr(stmt.iterable, stmt.line);
        scopes.push({ name: `for@${stmt.line}`, symbols: new Map() });
        declare(stmt.item, "loop-variable", stmt.line);
        for (const bodyStmt of stmt.body.body) visitStmt(bodyStmt);
        scopes.pop();
        return;
      case "SharedDecl":
      case "TypeDecl":
      case "EnumDecl":
        declare(stmt.name, "type", stmt.line);
        return;
      case "ImportDecl":
        if (stmt.defaultImport) declare(stmt.defaultImport, "variable", stmt.line);
        for (const item of stmt.names) declare(item.local, "variable", stmt.line);
        return;
      case "ExpressionStmt":
        visitExpr(stmt.expression, stmt.line);
        return;
    }
  };

  for (const stmt of program.body) visitStmt(stmt);
  return { declarations, references, sceneNodes: Array.from(sceneNodes).sort(), diagnostics };
}

function rootPath(expr: AST.Expr): { root: string | null; path: string[] } {
  if (expr.kind === "Identifier") return { root: expr.name, path: [] };
  if (expr.kind === "MemberAccess") {
    const parent = rootPath(expr.object);
    return parent.root ? { root: parent.root, path: [...parent.path, expr.member] } : { root: null, path: [] };
  }
  if (expr.kind === "IndexAccess") return rootPath(expr.object);
  if (expr.kind === "Call") return rootPath(expr.callee);
  return { root: null, path: [] };
}
