import * as AST from "./ast";

/**
 * Minimal scope resolution for variable declaration vs. reassignment.
 *
 * BDS has no `let`/`var` keyword: `name = value` is parsed as a `VarDecl`.
 * This pass decides, per `VarDecl`, whether it declares a new binding or
 * assigns an existing one, so every backend (TypeScript generator and the
 * structured executor) applies the same rule (docs/spec.md 5.1.1):
 *
 * 1. Scopes are lexical: the program, each function body, and each block
 *    (if / else / repeat / for / when / watch / every frame).
 * 2. `name = value` assigns when `name` is already bound in the current scope
 *    or an enclosing scope inside the same function (or the top level when
 *    outside any function). Otherwise it declares `name` in the current scope.
 * 3. Lookup stops at the nearest function boundary: a function body never
 *    assigns a top-level (or outer-function) variable; it declares its own.
 * 4. Function parameters, `for` items, the implicit `watch` value and the
 *    implicit `every frame` time are bindings of their own scope.
 * 5. Bindings are visible from the point of declaration onwards (source
 *    order). A binding declared inside a block is not visible after it.
 * 6. Names of functions, enums and imports are not reassignable variables;
 *    `name = value` with such a name keeps its previous (declaring) behaviour.
 *
 * This is deliberately not a typed semantic IR: it records only what the
 * declaration/assignment decision needs.
 */

type BindingKind = "variable" | "parameter" | "loop-item" | "implicit" | "function" | "enum" | "import";

const REASSIGNABLE: ReadonlySet<BindingKind> = new Set<BindingKind>(["variable", "parameter", "loop-item", "implicit"]);

interface Scope {
  readonly kind: "program" | "function" | "block";
  readonly bindings: Map<string, BindingKind>;
  readonly parent?: Scope;
}

export interface ScopeResolution {
  /** True when this `VarDecl` assigns an existing binding instead of declaring one. */
  isReassignment(statement: AST.VarDecl): boolean;
  /** True when the item variable of this `for` loop is reassigned inside its body. */
  isLoopItemReassigned(statement: AST.ForIn): boolean;
}

export function resolveScopes(program: AST.Program): ScopeResolution {
  const reassignments = new WeakSet<AST.VarDecl>();
  const reassignedLoops = new WeakSet<AST.ForIn>();
  const loopOwners = new WeakMap<Scope, AST.ForIn>();

  const lookupAssignable = (scope: Scope, name: string): Scope | undefined => {
    let current: Scope | undefined = scope;
    while (current) {
      const kind = current.bindings.get(name);
      if (kind !== undefined) return REASSIGNABLE.has(kind) ? current : undefined;
      if (current.kind === "function" || current.kind === "program") return undefined;
      current = current.parent;
    }
    return undefined;
  };

  const block = (parent: Scope, statements: readonly AST.Stmt[], implicit?: string): void => {
    const scope: Scope = { kind: "block", bindings: new Map(), parent };
    if (implicit) scope.bindings.set(implicit, "implicit");
    visitAll(statements, scope);
  };

  const visitAll = (statements: readonly AST.Stmt[], scope: Scope): void => {
    for (const statement of statements) {
      if (statement.kind === "FuncDef") scope.bindings.set(statement.name, "function");
    }
    for (const statement of statements) visit(statement, scope);
  };

  const visit = (statement: AST.Stmt, scope: Scope): void => {
    switch (statement.kind) {
      case "VarDecl": {
        const owner = lookupAssignable(scope, statement.name);
        if (owner) {
          reassignments.add(statement);
          if (owner.bindings.get(statement.name) === "loop-item") {
            const loop = loopOwners.get(owner);
            if (loop) reassignedLoops.add(loop);
          }
        } else if (!scope.bindings.has(statement.name)) {
          scope.bindings.set(statement.name, "variable");
        }
        return;
      }
      case "EnumDecl":
        scope.bindings.set(statement.name, "enum");
        return;
      case "ImportDecl":
        if (statement.defaultImport) scope.bindings.set(statement.defaultImport, "import");
        for (const item of statement.names) scope.bindings.set(item.local, "import");
        return;
      case "FuncDef": {
        const fn: Scope = { kind: "function", bindings: new Map(), parent: scope };
        for (const param of statement.params) fn.bindings.set(param, "parameter");
        visitAll(statement.body.body, fn);
        return;
      }
      case "If":
        block(scope, statement.thenBlock.body);
        if (statement.elseBlock) block(scope, statement.elseBlock.body);
        return;
      case "Repeat":
      case "When":
        block(scope, statement.body.body);
        return;
      case "WatchStmt":
        block(scope, statement.body.body, "value");
        return;
      case "EveryFrame":
        block(scope, statement.body.body, "time");
        return;
      case "ForIn": {
        const loopScope: Scope = { kind: "block", bindings: new Map([[statement.item, "loop-item" as BindingKind]]), parent: scope };
        loopOwners.set(loopScope, statement);
        block(loopScope, statement.body.body);
        return;
      }
      case "Assign":
      case "Return":
      case "BindStmt":
      case "Animate":
      case "ExpressionStmt":
      case "TypeDecl":
      case "SharedDecl":
        return;
    }
  };

  visitAll(program.body, { kind: "program", bindings: new Map() });

  return {
    isReassignment: (statement) => reassignments.has(statement),
    isLoopItemReassigned: (statement) => reassignedLoops.has(statement),
  };
}
