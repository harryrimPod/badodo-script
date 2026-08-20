import * as AST from "../ast";

// Implicit variables provided by the runtime callbacks, not scene nodes.
const RESERVED = new Set(["time", "value", "delta", "vec3", "color", "some", "none", "ok", "err", "is_ok", "unwrap"]);

/**
 * Collect scene-node identifier names from an AST.
 *
 * Rule: any identifier that is referenced but NOT a declared variable,
 * function name, function parameter, or reserved runtime name is treated
 * as a scene-node reference and must be injected into scope.
 */
export function collectNodes(program: AST.Program): string[] {
  const locals = new Set<string>();
  const nodes = new Set<string>();

  // Pass 1: gather declared local names (variables, functions, params).
  for (const stmt of program.body) {
    collectLocals(stmt, locals);
  }

  // Pass 2: gather referenced identifiers that are not locals/reserved.
  for (const stmt of program.body) {
    collectRefs(stmt, locals, nodes);
  }

  return Array.from(nodes).sort();
}

function collectLocals(stmt: AST.Stmt, locals: Set<string>): void {
  switch (stmt.kind) {
    case "VarDecl":
      locals.add(stmt.name);
      collectExprLocals(stmt.value, locals);
      break;
    case "FuncDef":
      locals.add(stmt.name);
      for (const p of stmt.params) locals.add(p);
      for (const s of stmt.body.body) collectLocals(s, locals);
      break;
    case "If":
      collectExprLocals(stmt.condition, locals);
      for (const s of stmt.thenBlock.body) collectLocals(s, locals);
      if (stmt.elseBlock) for (const s of stmt.elseBlock.body) collectLocals(s, locals);
      break;
    case "Repeat":
      collectExprLocals(stmt.count, locals);
      for (const s of stmt.body.body) collectLocals(s, locals);
      break;
    case "When":
      for (const s of stmt.body.body) collectLocals(s, locals);
      break;
    case "BindStmt":
      collectExprLocals(stmt.source, locals);
      break;
    case "WatchStmt":
      collectExprLocals(stmt.source, locals);
      for (const s of stmt.body.body) collectLocals(s, locals);
      break;
    case "EveryFrame":
      for (const s of stmt.body.body) collectLocals(s, locals);
      break;
    case "Animate":
      collectExprLocals(stmt.target, locals);
      collectExprLocals(stmt.value, locals);
      collectExprLocals(stmt.duration, locals);
      break;
    case "ForIn":
      locals.add(stmt.item);
      collectExprLocals(stmt.iterable, locals);
      for (const s of stmt.body.body) collectLocals(s, locals);
      break;
    case "SharedDecl":
    case "TypeDecl":
    case "EnumDecl":
      locals.add(stmt.name);
      break;
    case "ImportDecl":
      if (stmt.defaultImport) locals.add(stmt.defaultImport);
      for (const item of stmt.names) locals.add(item.local);
      break;
    case "Assign":
      collectExprLocals(stmt.target, locals);
      collectExprLocals(stmt.value, locals);
      break;
    case "Return":
      if (stmt.value) collectExprLocals(stmt.value, locals);
      break;
    case "ExpressionStmt":
      collectExprLocals(stmt.expression, locals);
      break;
  }
}

function collectExprLocals(expr: AST.Expr, locals: Set<string>): void {
  switch (expr.kind) {
    case "Identifier":
    case "Literal":
      break;
    case "MemberAccess":
      collectExprLocals(expr.object, locals);
      break;
    case "IndexAccess":
      collectExprLocals(expr.object, locals);
      collectExprLocals(expr.index, locals);
      break;
    case "ArrayLiteral":
      for (const e of expr.elements) collectExprLocals(e, locals);
      break;
    case "MapLiteral":
      for (const entry of expr.entries) collectExprLocals(entry.value, locals);
      break;
    case "AwaitExpr":
      collectExprLocals(expr.operand, locals);
      break;
    case "Call":
      collectExprLocals(expr.callee, locals);
      for (const a of expr.args) collectExprLocals(a, locals);
      break;
    case "BinaryOp":
      collectExprLocals(expr.left, locals);
      collectExprLocals(expr.right, locals);
      break;
    case "UnaryOp":
      collectExprLocals(expr.operand, locals);
      break;
  }
}

function collectRefs(stmt: AST.Stmt, locals: Set<string>, nodes: Set<string>): void {
  switch (stmt.kind) {
    case "VarDecl":
      collectExprRefs(stmt.value, locals, nodes);
      break;
    case "FuncDef":
      for (const s of stmt.body.body) collectRefs(s, locals, nodes);
      break;
    case "If":
      collectExprRefs(stmt.condition, locals, nodes);
      for (const s of stmt.thenBlock.body) collectRefs(s, locals, nodes);
      if (stmt.elseBlock) for (const s of stmt.elseBlock.body) collectRefs(s, locals, nodes);
      break;
    case "Repeat":
      collectExprRefs(stmt.count, locals, nodes);
      for (const s of stmt.body.body) collectRefs(s, locals, nodes);
      break;
    case "When":
      collectExprRefs(stmt.target, locals, nodes);
      for (const s of stmt.body.body) collectRefs(s, locals, nodes);
      break;
    case "BindStmt":
      collectExprRefs(stmt.source, locals, nodes);
      collectExprRefs(stmt.target, locals, nodes);
      break;
    case "WatchStmt":
      collectExprRefs(stmt.source, locals, nodes);
      for (const s of stmt.body.body) collectRefs(s, locals, nodes);
      break;
    case "EveryFrame":
      for (const s of stmt.body.body) collectRefs(s, locals, nodes);
      break;
    case "Animate":
      collectExprRefs(stmt.target, locals, nodes);
      collectExprRefs(stmt.value, locals, nodes);
      collectExprRefs(stmt.duration, locals, nodes);
      break;
    case "ForIn":
      collectExprRefs(stmt.iterable, locals, nodes);
      for (const s of stmt.body.body) collectRefs(s, locals, nodes);
      break;
    case "SharedDecl":
      break;
    case "ImportDecl":
      break;
    case "Assign":
      collectExprRefs(stmt.value, locals, nodes);
      // target root (e.g. `motor` in `motor.speed = x`) is a node reference
      collectExprRefs(stmt.target, locals, nodes);
      break;
    case "Return":
      if (stmt.value) collectExprRefs(stmt.value, locals, nodes);
      break;
    case "ExpressionStmt":
      collectExprRefs(stmt.expression, locals, nodes);
      break;
  }
}

function collectExprRefs(expr: AST.Expr, locals: Set<string>, nodes: Set<string>): void {
  switch (expr.kind) {
    case "Identifier":
      if (!locals.has(expr.name) && !RESERVED.has(expr.name)) {
        nodes.add(expr.name);
      }
      break;
    case "Literal":
      break;
    case "MemberAccess":
      collectExprRefs(expr.object, locals, nodes);
      break;
    case "IndexAccess":
      collectExprRefs(expr.object, locals, nodes);
      collectExprRefs(expr.index, locals, nodes);
      break;
    case "ArrayLiteral":
      for (const e of expr.elements) collectExprRefs(e, locals, nodes);
      break;
    case "MapLiteral":
      for (const entry of expr.entries) collectExprRefs(entry.value, locals, nodes);
      break;
    case "AwaitExpr":
      collectExprRefs(expr.operand, locals, nodes);
      break;
    case "Call":
      collectExprRefs(expr.callee, locals, nodes);
      for (const a of expr.args) collectExprRefs(a, locals, nodes);
      break;
    case "BinaryOp":
      collectExprRefs(expr.left, locals, nodes);
      collectExprRefs(expr.right, locals, nodes);
      break;
    case "UnaryOp":
      collectExprRefs(expr.operand, locals, nodes);
      break;
  }
}
