import * as AST from "./ast";
import { Mapping } from "./sourcemap";
import { resolveScopes, ScopeResolution } from "./scope";

export interface TypeScriptGeneratorOptions {
  /** Emit TypeScript annotations for the BDS annotations that have a safe projection. */
  emitTypes?: boolean;
}

export class TypeScriptGenerator {
  private indentLevel = 0;
  private output = "";
  private mappings: Mapping[] = [];
  private knownTypes = new Set<string>();
  private scopes: ScopeResolution | null = null;
  private readonly options: Required<TypeScriptGeneratorOptions>;

  constructor(options: TypeScriptGeneratorOptions = {}) {
    this.options = { emitTypes: options.emitTypes === true };
  }

  generate(node: AST.Program): string {
    this.output = "";
    this.mappings = [];
    this.scopes = resolveScopes(node);
    this.knownTypes = new Set(node.body.filter((stmt): stmt is AST.TypeDecl | AST.EnumDecl | AST.SharedDecl => stmt.kind === "TypeDecl" || stmt.kind === "EnumDecl" || stmt.kind === "SharedDecl").map((stmt) => stmt.name));
    for (const stmt of node.body) {
      this.writeStmt(stmt);
      this.output += "\n";
    }
    return this.output.trim();
  }

  getMappings(): Mapping[] {
    return this.mappings;
  }

  private currentLine(): number {
    let line = 1;
    for (let i = 0; i < this.output.length; i++) {
      if (this.output[i] === "\n") line++;
    }
    return line;
  }

  private writeStmt(stmt: AST.Stmt): void {
    if (stmt.kind === "SharedDecl" || (stmt.kind === "TypeDecl" && !this.options.emitTypes)) return;
    this.mappings.push({ generatedLine: this.currentLine(), sourceLine: stmt.line });
    this.writeIndent();

    switch (stmt.kind) {
      case "TypeDecl": {
        if (this.options.emitTypes) {
          this.output += `interface ${stmt.name} {\n`;
          this.indentLevel++;
          for (const field of stmt.fields) {
            this.writeIndent();
            this.output += `${field.name}${field.optional ? "?" : ""}: ${typeRefToTypeScript(field.type, this.knownTypes)};\n`;
          }
          this.indentLevel--;
          this.writeIndent();
          this.output += "}";
        }
        break;
      }
      case "EnumDecl":
        this.output += `const ${stmt.name} = Object.freeze({ ${stmt.values.map((value) => `${value}: ${JSON.stringify(value)}`).join(", ")} });`;
        break;
      case "ImportDecl": {
        const named = stmt.names.length > 0
          ? `{ ${stmt.names.map((item) => item.imported === item.local ? item.imported : `${item.imported} as ${item.local}`).join(", ")} }`
          : "";
        const bindings = [stmt.defaultImport, named].filter(Boolean).join(", ");
        this.output += bindings ? `import ${bindings} from ${JSON.stringify(stmt.source)};` : `import ${JSON.stringify(stmt.source)};`;
        break;
      }
      case "VarDecl":
        if (this.scopes?.isReassignment(stmt)) {
          this.output += `${stmt.name} = ${this.writeExpr(stmt.value)};`;
          break;
        }
        this.output += `let ${stmt.name}${this.writeTypeAnnotation(stmt.typeAnnotation)} = ${this.writeExpr(stmt.value)};`;
        break;
      case "Assign":
        this.output += `${this.writeExpr(stmt.target)} = ${this.writeExpr(stmt.value)};`;
        break;
      case "If": {
        this.output += `if (${this.writeExpr(stmt.condition)}) {\n`;
        this.indentLevel++;
        this.writeBlock(stmt.thenBlock);
        this.indentLevel--;
        this.writeIndent();
        this.output += "}";
        if (stmt.elseBlock) {
          this.output += " else {\n";
          this.indentLevel++;
          this.writeBlock(stmt.elseBlock);
          this.indentLevel--;
          this.writeIndent();
          this.output += "}";
        }
        break;
      }
      case "Repeat": {
        const count = this.writeExpr(stmt.count);
        this.output += `for (let __i = 0; __i < ${count}; __i++) {\n`;
        this.indentLevel++;
        this.writeBlock(stmt.body);
        this.indentLevel--;
        this.writeIndent();
        this.output += "}";
        break;
      }
      case "FuncDef": {
        const params = stmt.params.map((name, index) => `${name}${this.writeTypeAnnotation(stmt.paramTypes?.[index])}`).join(", ");
        const returnType = this.options.emitTypes && stmt.returnType
          ? `: ${stmt.async ? `Promise<${typeRefToTypeScript(stmt.returnType, this.knownTypes)}>` : typeRefToTypeScript(stmt.returnType, this.knownTypes)}`
          : "";
        this.output += `${stmt.async ? "async " : ""}function ${stmt.name}(${params})${returnType} {\n`;
        this.indentLevel++;
        this.writeBlock(stmt.body);
        this.indentLevel--;
        this.writeIndent();
        this.output += "}";
        break;
      }
      case "Return": {
        if (stmt.value) {
          this.output += `return ${this.writeExpr(stmt.value)};`;
        } else {
          this.output += "return;";
        }
        break;
      }
      case "When": {
        const target = this.writeExpr(stmt.target);
        this.output += `on(${target}, "${stmt.event}", () => {\n`;
        this.indentLevel++;
        this.writeBlock(stmt.body);
        this.indentLevel--;
        this.writeIndent();
        this.output += "});";
        break;
      }
      case "BindStmt": {
        const source = this.writeExpr(stmt.source);
        const target = stmt.target;
        const node = this.writeExpr(target.object);
        const prop = target.member;
        this.output += `bind(() => ${source}, ${node}, "${prop}");`;
        break;
      }
      case "WatchStmt": {
        const source = this.writeExpr(stmt.source);
        this.output += `watch(() => ${source}, (value) => {\n`;
        this.indentLevel++;
        this.writeBlock(stmt.body);
        this.indentLevel--;
        this.writeIndent();
        this.output += "});";
        break;
      }
      case "EveryFrame": {
        this.output += "onFrame((time) => {\n";
        this.indentLevel++;
        this.writeBlock(stmt.body);
        this.indentLevel--;
        this.writeIndent();
        this.output += "});";
        break;
      }
      case "Animate": {
        const value = this.writeExpr(stmt.value);
        const duration = this.writeExpr(stmt.duration);
        if (stmt.target.kind === "MemberAccess") {
          const node = this.writeExpr(stmt.target.object);
          const prop = stmt.target.member;
          this.output += `animate(${node}, "${prop}", ${value}, ${duration});`;
        } else {
          const node = stmt.target.name;
          this.output += `animateTo(${node}, ${value}, ${duration});`;
        }
        break;
      }
      case "ForIn": {
        const iterable = this.writeExpr(stmt.iterable);
        const binding = this.scopes?.isLoopItemReassigned(stmt) ? "let" : "const";
        this.output += `for (${binding} ${stmt.item} of ${iterable}) {\n`;
        this.indentLevel++;
        this.writeBlock(stmt.body);
        this.indentLevel--;
        this.writeIndent();
        this.output += "}";
        break;
      }
      case "ExpressionStmt":
        this.output += `${this.writeExpr(stmt.expression)};`;
        break;
    }
  }

  private writeBlock(block: AST.Block): void {
    if (block.body.length === 0) {
      this.writeIndent();
      this.output += "// no-op\n";
      return;
    }
    for (const stmt of block.body) {
      this.writeStmt(stmt);
      this.output += "\n";
    }
  }

  private writeExpr(expr: AST.Expr, parentPrecedence = 0, samePrecedenceNeedsParens = false): string {
    switch (expr.kind) {
      case "Literal":
        return this.writeLiteral(expr.value);
      case "Identifier":
        return expr.name;
      case "MemberAccess":
        {
          const text = `${this.writeExpr(expr.object, 5)}.${expr.member}`;
          return 5 < parentPrecedence ? `(${text})` : text;
        }
      case "IndexAccess":
        {
          const text = `${this.writeExpr(expr.object, 5)}[${this.writeExpr(expr.index)}]`;
          return 5 < parentPrecedence ? `(${text})` : text;
        }
      case "ArrayLiteral":
        return `[${expr.elements.map((e) => this.writeExpr(e)).join(", ")}]`;
      case "MapLiteral": {
        const text = `{ ${expr.entries.map((entry) => `${JSON.stringify(entry.key)}: ${this.writeExpr(entry.value)}`).join(", ")} }`;
        return 5 < parentPrecedence ? `(${text})` : text;
      }
      case "AwaitExpr": {
        const text = `await ${this.writeExpr(expr.operand, 4)}`;
        return 4 < parentPrecedence ? `(${text})` : text;
      }
      case "Call":
        {
          const callee = this.writeExpr(expr.callee, 5);
          const args = expr.args.map((arg) => this.writeExpr(arg)).join(", ");
          const text = `${callee}(${args})`;
          return 5 < parentPrecedence ? `(${text})` : text;
        }
      case "BinaryOp":
        {
          const precedence = binaryPrecedence(expr.op);
          const leftNeedsParens = precedence === 1 && expr.left.kind === "BinaryOp" && binaryPrecedence(expr.left.op) === precedence;
          const text = `${this.writeExpr(expr.left, precedence, leftNeedsParens)} ${expr.op} ${this.writeExpr(expr.right, precedence, true)}`;
          return precedence < parentPrecedence || (precedence === parentPrecedence && samePrecedenceNeedsParens) ? `(${text})` : text;
        }
      case "UnaryOp":
        {
          const precedence = 4;
          const operandNeedsParens = expr.operand.kind === "UnaryOp";
          const text = `${expr.op}${this.writeExpr(expr.operand, precedence, operandNeedsParens)}`;
          return precedence < parentPrecedence || (precedence === parentPrecedence && samePrecedenceNeedsParens) ? `(${text})` : text;
        }
    }
  }

  private writeLiteral(value: number | string | boolean | null): string {
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(value);
    return String(value);
  }

  private writeTypeAnnotation(type: AST.TypeRef | null | undefined): string {
    if (!this.options.emitTypes || !type) return "";
    return `: ${typeRefToTypeScript(type, this.knownTypes)}`;
  }

  private writeIndent(): void {
    this.output += "  ".repeat(this.indentLevel);
  }
}

function binaryPrecedence(operator: string): number {
  if (operator === "*" || operator === "/") return 3;
  if (operator === "+" || operator === "-") return 2;
  return 1;
}

export function generateTypeScript(ast: AST.Program, options: TypeScriptGeneratorOptions = {}): string {
  return new TypeScriptGenerator(options).generate(ast);
}

export function generateWithMap(ast: AST.Program, options: TypeScriptGeneratorOptions = {}): { code: string; mappings: Mapping[] } {
  const gen = new TypeScriptGenerator(options);
  const code = gen.generate(ast);
  return { code, mappings: gen.getMappings() };
}

function typeRefToTypeScript(type: AST.TypeRef, knownTypes: ReadonlySet<string> = new Set()): string {
  switch (type.name) {
    case "bool": return "boolean";
    case "i32":
    case "f64":
    case "number": return "number";
    case "string": return "string";
    case "bytes": return "Uint8Array";
    case "null": return "null";
    case "array": return "unknown[]";
    case "map": return "Record<string, unknown>";
    case "option": return "Option<unknown>";
    case "result": return "Result<unknown, unknown>";
    case "unit": return "void";
    default: return knownTypes.has(type.name) ? type.name : "unknown";
  }
}
