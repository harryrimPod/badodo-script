export type Node =
  | Program
  | Block
  | VarDecl
  | Assign
  | If
  | Repeat
  | FuncDef
  | Return
  | When
  | BindStmt
  | WatchStmt
  | EveryFrame
  | Animate
  | ForIn
  | SharedDecl
  | TypeDecl
  | EnumDecl
  | ImportDecl
  | ExpressionStmt
  | Call
  | MemberAccess
  | IndexAccess
  | ArrayLiteral
  | MapLiteral
  | AwaitExpr
  | Identifier
  | BinaryOp
  | UnaryOp
  | Literal;

export interface Program {
  kind: "Program";
  body: Stmt[];
}

export interface Block {
  kind: "Block";
  body: Stmt[];
}

export type Stmt =
  | VarDecl
  | Assign
  | If
  | Repeat
  | FuncDef
  | Return
  | When
  | BindStmt
  | WatchStmt
  | EveryFrame
  | Animate
  | ForIn
  | SharedDecl
  | TypeDecl
  | EnumDecl
  | ImportDecl
  | ExpressionStmt;

export interface VarDecl {
  kind: "VarDecl";
  name: string;
  value: Expr;
  line: number;
  typeAnnotation?: TypeRef;
}

export interface TypeRef {
  kind: "TypeRef";
  name: string;
}

export interface Assign {
  kind: "Assign";
  target: Expr;
  value: Expr;
  line: number;
}

export interface If {
  kind: "If";
  condition: Expr;
  thenBlock: Block;
  elseBlock: Block | null;
  line: number;
}

export interface Repeat {
  kind: "Repeat";
  count: Expr;
  body: Block;
  line: number;
}

export interface FuncDef {
  kind: "FuncDef";
  name: string;
  params: string[];
  paramTypes?: Array<TypeRef | null>;
  returnType?: TypeRef;
  body: Block;
  line: number;
  async?: boolean;
}

export interface ImportDecl {
  kind: "ImportDecl";
  source: string;
  defaultImport?: string;
  names: Array<{ imported: string; local: string }>;
  line: number;
}

export interface Return {
  kind: "Return";
  value: Expr | null;
  line: number;
}

export interface When {
  kind: "When";
  target: Expr;
  event: string;
  body: Block;
  line: number;
}

export interface BindStmt {
  kind: "BindStmt";
  source: Expr;
  target: MemberAccess;
  line: number;
}

export interface WatchStmt {
  kind: "WatchStmt";
  source: Expr;
  body: Block;
  line: number;
}

export interface EveryFrame {
  kind: "EveryFrame";
  body: Block;
  line: number;
}

export interface Animate {
  kind: "Animate";
  target: Identifier | MemberAccess;
  value: Expr;
  duration: Expr;
  line: number;
}

export interface ForIn {
  kind: "ForIn";
  item: string;
  iterable: Expr;
  body: Block;
  line: number;
}

export interface SharedDecl {
  kind: "SharedDecl";
  name: string;
  fields: SharedField[];
  line: number;
}

export interface TypeDecl {
  kind: "TypeDecl";
  name: string;
  fields: SharedField[];
  line: number;
}

export interface EnumDecl {
  kind: "EnumDecl";
  name: string;
  values: string[];
  line: number;
}

export interface SharedField {
  name: string;
  type: TypeRef;
  optional?: boolean;
  line: number;
}

export interface ExpressionStmt {
  kind: "ExpressionStmt";
  expression: Expr;
  line: number;
}

export type Expr =
  | Call
  | MemberAccess
  | IndexAccess
  | ArrayLiteral
  | MapLiteral
  | AwaitExpr
  | Identifier
  | BinaryOp
  | UnaryOp
  | Literal;

export interface Call {
  kind: "Call";
  callee: Expr;
  args: Expr[];
}

export interface MemberAccess {
  kind: "MemberAccess";
  object: Expr;
  member: string;
}

export interface IndexAccess {
  kind: "IndexAccess";
  object: Expr;
  index: Expr;
}

export interface ArrayLiteral {
  kind: "ArrayLiteral";
  elements: Expr[];
}

export interface MapLiteral {
  kind: "MapLiteral";
  entries: Array<{ key: string; value: Expr }>;
}

export interface AwaitExpr {
  kind: "AwaitExpr";
  operand: Expr;
}

export interface Identifier {
  kind: "Identifier";
  name: string;
}

export interface BinaryOp {
  kind: "BinaryOp";
  op: string;
  left: Expr;
  right: Expr;
}

export interface UnaryOp {
  kind: "UnaryOp";
  op: string;
  operand: Expr;
}

export interface Literal {
  kind: "Literal";
  value: number | string | boolean | null;
}
