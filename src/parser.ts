import { Token, TokenType } from "./token";
import * as AST from "./ast";

export class ParseError extends Error {
  constructor(message: string, public token: Token) {
    super(`第 ${token.line} 行第 ${token.col} 列：${message}`);
    this.name = "ParseError";
  }
}

export class Parser {
  private pos = 0;
  private blockDepth = 0;
  private asyncFunctionDepth = 0;

  constructor(private tokens: Token[]) {}

  parse(): AST.Program {
    const body: AST.Stmt[] = [];
    this.skipNewlines();
    while (!this.isAtEnd()) {
      const stmt = this.parseStmt();
      if (stmt) body.push(stmt);
      this.skipNewlines();
    }
    return { kind: "Program", body };
  }

  private parseStmt(): AST.Stmt | null {
    this.skipNewlines();
    if (this.isAtEnd()) return null;

    const token = this.peek();

    switch (token.type) {
      case TokenType.IF:
        return this.parseIf();
      case TokenType.REPEAT:
        return this.parseRepeat();
      case TokenType.FUNC:
        return this.parseFunc();
      case TokenType.ASYNC:
        return this.parseAsyncFunc();
      case TokenType.IMPORT:
        return this.parseImport();
      case TokenType.WHEN:
        return this.parseWhen();
      case TokenType.BIND:
        return this.parseBind();
      case TokenType.WATCH:
        return this.parseWatch();
      case TokenType.EVERY:
        return this.parseEvery();
      case TokenType.ANIMATE:
        return this.parseAnimate();
      case TokenType.FOR:
        return this.parseForIn();
      case TokenType.AT:
        return this.parseAnnotation();
      case TokenType.TYPE:
        return this.parseTypeDecl();
      case TokenType.ENUM:
        return this.parseEnumDecl();
      case TokenType.RETURN:
        return this.parseReturn();
      default:
        return this.parseSimpleStmt();
    }
  }

  private parseIf(): AST.If {
    const line = this.peek().line;
    this.consume(TokenType.IF, "Expected 'if'");
    const condition = this.parseExpr();
    this.consume(TokenType.COLON, "if 的条件后面需要一个冒号 :，例如：\n\n  if 温度 > 80:");
    const thenBlock = this.parseBlock();

    let elseBlock: AST.Block | null = null;
    this.skipNewlines();
    if (this.match(TokenType.ELSE)) {
      this.consume(TokenType.COLON, "'else' 后面需要一个冒号 :");
      elseBlock = this.parseBlock();
    }

    return { kind: "If", condition, thenBlock, elseBlock, line };
  }

  private parseRepeat(): AST.Repeat {
    const line = this.peek().line;
    this.consume(TokenType.REPEAT, "Expected 'repeat'");
    const count = this.parseExpr();
    this.consume(TokenType.COLON, "repeat 的次数后面需要一个冒号 :，例如：\n\n  repeat 3:");
    const body = this.parseBlock();
    return { kind: "Repeat", count, body, line };
  }

  private parseFunc(): AST.FuncDef {
    const line = this.peek().line;
    this.consume(TokenType.FUNC, "Expected 'func'");
    const name = this.consume(TokenType.IDENT, "func 后面需要一个函数名，例如：func open_door():").value;
    this.consume(TokenType.LPAREN, "函数名后面需要一对括号 ()");
    const params: string[] = [];
    const paramTypes: Array<AST.TypeRef | null> = [];
    if (this.peek().type !== TokenType.RPAREN) {
      params.push(this.consume(TokenType.IDENT, "参数需要是一个名字").value);
      paramTypes.push(this.match(TokenType.COLON) ? this.parseTypeRef() : null);
      while (this.match(TokenType.COMMA)) {
        params.push(this.consume(TokenType.IDENT, "参数需要是一个名字").value);
        paramTypes.push(this.match(TokenType.COLON) ? this.parseTypeRef() : null);
      }
    }
    this.consume(TokenType.RPAREN, "参数列表需要一个右括号 )");
    const returnType = this.match(TokenType.ARROW) ? this.parseTypeRef() : undefined;
    this.consume(TokenType.COLON, "函数签名后面需要一个冒号 :，例如：\n\n  func open_door():");
    const body = this.parseBlock();
    const result: AST.FuncDef = { kind: "FuncDef", name, params, body, line };
    if (paramTypes.some((type) => type !== null)) result.paramTypes = paramTypes;
    if (returnType) result.returnType = returnType;
    return result;
  }

  private parseAsyncFunc(): AST.FuncDef {
    const line = this.peek().line;
    this.consume(TokenType.ASYNC, "async 后面需要 func");
    this.asyncFunctionDepth++;
    let result: AST.FuncDef;
    try {
      result = this.parseFunc();
    } finally {
      this.asyncFunctionDepth--;
    }
    return { ...result, async: true, line };
  }

  private parseImport(): AST.ImportDecl {
    const line = this.peek().line;
    this.consume(TokenType.IMPORT, "Expected 'import'");
    const names: Array<{ imported: string; local: string }> = [];
    let defaultImport: string | undefined;
    if (this.peek().type === TokenType.STRING) {
      const source = this.advance().value;
      return { kind: "ImportDecl", source, names, line };
    }
    if (this.peek().type === TokenType.LBRACE) {
      this.advance();
      if (this.peek().type !== TokenType.RBRACE) {
        do {
          const imported = this.consume(TokenType.IDENT, "import 花括号中需要导出名称").value;
          const local = this.match(TokenType.AS)
            ? this.consume(TokenType.IDENT, "import as 后面需要本地名称").value
            : imported;
          names.push({ imported, local });
        } while (this.match(TokenType.COMMA));
      }
      this.consume(TokenType.RBRACE, "import 名称列表需要右花括号 }");
    } else {
      defaultImport = this.consume(TokenType.IDENT, "import 需要默认名称、花括号名称或字符串").value;
    }
    this.consume(TokenType.FROM, "import 名称后需要 from");
    const source = this.consume(TokenType.STRING, "from 后面需要模块字符串").value;
    return { kind: "ImportDecl", source, defaultImport, names, line };
  }

  private parseWhen(): AST.When {
    const line = this.peek().line;
    this.consume(TokenType.WHEN, "Expected 'when'");
    const fullTarget = this.parseTarget();

    if (fullTarget.kind === "Identifier") {
      throw new ParseError("事件需要写成「节点.事件」的形式，例如：when button.click:", this.previous());
    }

    this.consume(TokenType.COLON, "事件后面需要一个冒号 :，例如：\n\n  when button.click:");
    const body = this.parseBlock();
    return { kind: "When", target: fullTarget.object, event: fullTarget.member, body, line };
  }

  private parseReturn(): AST.Return {
    const line = this.peek().line;
    this.consume(TokenType.RETURN, "Expected 'return'");
    let value: AST.Expr | null = null;
    if (!this.isAtEnd() && !this.isLineBreak()) {
      value = this.parseExpr();
    }
    return { kind: "Return", value, line };
  }

  private parseBind(): AST.BindStmt {
    const line = this.peek().line;
    this.consume(TokenType.BIND, "Expected 'bind'");
    const source = this.parseTarget();
    this.consume(TokenType.ARROW, "bind 需要一个箭头 -> 来连接数据源和目标，例如：\n\n  bind temperature -> gauge.value");
    const target = this.parseTarget();
    if (target.kind === "Identifier") {
      throw new ParseError("bind 的目标需要写成「节点.属性」的形式，例如：gauge.value", this.previous());
    }
    return { kind: "BindStmt", source, target, line };
  }

  private parseWatch(): AST.WatchStmt {
    const line = this.peek().line;
    this.consume(TokenType.WATCH, "Expected 'watch'");
    const source = this.parseTarget();
    this.consume(TokenType.COLON, "watch 后面需要一个冒号 :，例如：\n\n  watch temperature:");
    const body = this.parseBlock();
    return { kind: "WatchStmt", source, body, line };
  }

  private parseEvery(): AST.EveryFrame {
    const line = this.peek().line;
    this.consume(TokenType.EVERY, "Expected 'every'");
    const frame = this.consume(TokenType.IDENT, "every 后面需要 frame，例如：\n\n  every frame:");
    if (frame.value !== "frame") {
      throw new ParseError("every 后面需要 frame，例如：every frame:", frame);
    }
    this.consume(TokenType.COLON, "every frame 后面需要一个冒号 :");
    const body = this.parseBlock();
    return { kind: "EveryFrame", body, line };
  }

  private parseAnimate(): AST.Animate {
    const line = this.peek().line;
    this.consume(TokenType.ANIMATE, "Expected 'animate'");
    const target = this.parseTarget();
    this.consume(TokenType.TO, "animate 需要一个 to 来表示目标，例如：\n\n  animate door.y to 2 in 0.5");
    const value = this.parseExpr();
    this.consume(TokenType.IN, "animate 需要一个 in 来表示时长，例如：\n\n  animate door.y to 2 in 0.5");
    const duration = this.parseExpr();
    return { kind: "Animate", target, value, duration, line };
  }

  private parseForIn(): AST.ForIn {
    const line = this.peek().line;
    this.consume(TokenType.FOR, "Expected 'for'");
    const item = this.consume(TokenType.IDENT, "for 后面需要一个变量名，例如：\n\n  for item in items:").value;
    this.consume(TokenType.IN, "for 循环需要一个 in，例如：\n\n  for item in items:");
    const iterable = this.parseExpr();
    this.consume(TokenType.COLON, "for 循环后面需要一个冒号 :，例如：\n\n  for item in items:");
    const body = this.parseBlock();
    return { kind: "ForIn", item, iterable, body, line };
  }

  private parseAnnotation(): AST.SharedDecl {
    const line = this.peek().line;
    if (this.blockDepth > 0) {
      throw new ParseError("@shared type 只能出现在文件顶层", this.peek());
    }
    this.consume(TokenType.AT, "注解需要以 @ 开头");
    const annotation = this.consume(TokenType.IDENT, "@ 后面需要 shared，例如：@shared type Device:");
    if (annotation.value !== "shared") {
      throw new ParseError("当前只支持 @shared 注解", annotation);
    }
    this.consume(TokenType.TYPE, "@shared 后面需要 type，例如：@shared type Device:");
    const name = this.consume(TokenType.IDENT, "shared type 后面需要一个类型名").value;
    this.consume(TokenType.COLON, "shared type 名称后面需要一个冒号 :");
    const fields = this.parseSharedFields();
    return { kind: "SharedDecl", name, fields, line };
  }

  private parseTypeDecl(): AST.TypeDecl {
    const line = this.peek().line;
    if (this.blockDepth > 0) throw new ParseError("type 只能出现在文件顶层", this.peek());
    this.consume(TokenType.TYPE, "Expected 'type'");
    const name = this.consume(TokenType.IDENT, "type 后面需要一个类型名").value;
    this.consume(TokenType.COLON, "type 名称后面需要冒号 :");
    return { kind: "TypeDecl", name, fields: this.parseNamedFields("type"), line };
  }

  private parseEnumDecl(): AST.EnumDecl {
    const line = this.peek().line;
    if (this.blockDepth > 0) throw new ParseError("enum 只能出现在文件顶层", this.peek());
    this.consume(TokenType.ENUM, "Expected 'enum'");
    const name = this.consume(TokenType.IDENT, "enum 后面需要一个名称").value;
    this.consume(TokenType.COLON, "enum 名称后面需要冒号 :");
    this.skipNewlines();
    this.consume(TokenType.INDENT, "enum 后面需要缩进的成员列表");
    const values: string[] = [];
    while (!this.isAtEnd() && this.peek().type !== TokenType.DEDENT) {
      this.skipNewlines();
      if (this.peek().type === TokenType.DEDENT) break;
      values.push(this.consume(TokenType.IDENT, "enum 成员需要一个名字").value);
      if (this.peek().type !== TokenType.NEWLINE && this.peek().type !== TokenType.DEDENT && !this.isAtEnd()) {
        throw new ParseError("enum 成员行只能包含一个名字", this.peek());
      }
    }
    this.consume(TokenType.DEDENT, "enum 成员列表需要结束缩进");
    if (values.length === 0) throw new ParseError("enum 至少需要一个成员", this.previous());
    if (new Set(values).size !== values.length) throw new ParseError("enum 成员不能重复", this.previous());
    return { kind: "EnumDecl", name, values, line };
  }

  private parseSharedFields(): AST.SharedField[] {
    return this.parseNamedFields("shared type");
  }

  private parseNamedFields(label: string): AST.SharedField[] {
    this.skipNewlines();
    this.consume(TokenType.INDENT, `${label} 后面需要缩进的字段列表`);
    const fields: AST.SharedField[] = [];
    while (!this.isAtEnd() && this.peek().type !== TokenType.DEDENT) {
      this.skipNewlines();
      if (this.peek().type === TokenType.DEDENT) break;
      const line = this.peek().line;
      const name = this.consume(TokenType.IDENT, "shared 字段需要一个名字").value;
      const optional = this.match(TokenType.QUESTION);
      this.consume(TokenType.COLON, "shared 字段后面需要类型，例如：id: string");
      const type = this.parseTypeRef();
      if (this.peek().type === TokenType.ASSIGN) {
        throw new ParseError("shared 字段暂不支持默认值", this.peek());
      }
      if (this.peek().type !== TokenType.NEWLINE && this.peek().type !== TokenType.DEDENT && !this.isAtEnd()) {
        throw new ParseError("shared 字段行只能包含「名字: 类型」", this.peek());
      }
      fields.push({ name, type, optional: optional || undefined, line });
    }
    this.consume(TokenType.DEDENT, "shared 字段列表需要结束缩进");
    if (fields.length === 0) {
      throw new ParseError(`${label} 至少需要一个字段`, this.previous());
    }
    return fields;
  }

  private parseSimpleStmt(): AST.Stmt {
    const line = this.peek().line;
    if (this.peek().type === TokenType.IDENT && this.peek(1).type === TokenType.COLON) {
      const name = this.advance().value;
      this.advance(); // colon
      const typeAnnotation = this.parseTypeRef();
      this.consume(TokenType.ASSIGN, "类型声明后需要一个赋值，例如：x: i32 = 1");
      const value = this.parseExpr();
      return { kind: "VarDecl", name, value, line, typeAnnotation };
    }
    const expr = this.parseExpr();

    if (expr.kind === "Identifier" || expr.kind === "MemberAccess" || expr.kind === "IndexAccess") {
      if (this.match(TokenType.ASSIGN)) {
        const value = this.parseExpr();
        if (expr.kind === "Identifier") {
          return { kind: "VarDecl", name: expr.name, value, line };
        }
        return { kind: "Assign", target: expr, value, line };
      }
    }

    return { kind: "ExpressionStmt", expression: expr, line };
  }

  private parseTypeRef(): AST.TypeRef {
    const token = this.consume(TokenType.IDENT, "类型注解需要一个类型名，例如：i32、f64、string");
    return { kind: "TypeRef", name: token.value };
  }

  private parseBlock(): AST.Block {
    this.skipNewlines();
    this.consume(TokenType.INDENT, "这里需要一个缩进的代码块。请在冒号 : 后面换行，并让下一行比当前行缩进更靠右");
    const body: AST.Stmt[] = [];
    this.blockDepth++;
    try {
      while (!this.isAtEnd() && this.peek().type !== TokenType.DEDENT) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT) break;
        const stmt = this.parseStmt();
        if (stmt) body.push(stmt);
        this.skipNewlines();
      }

      this.consume(TokenType.DEDENT, "代码块需要在这里结束：请把下一行的缩进退回到上一层");
    } finally {
      this.blockDepth--;
    }
    return { kind: "Block", body };
  }

  private parseExpr(): AST.Expr {
    return this.parseComparison();
  }

  private parseComparison(): AST.Expr {
    let left = this.parseAdditive();
    while (this.isComparisonOp()) {
      const op = this.advance().value;
      const right = this.parseAdditive();
      left = { kind: "BinaryOp", op, left, right };
    }
    return left;
  }

  private parseAdditive(): AST.Expr {
    let left = this.parseMultiplicative();
    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const op = this.previous().value;
      const right = this.parseMultiplicative();
      left = { kind: "BinaryOp", op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): AST.Expr {
    let left = this.parseUnary();
    while (this.match(TokenType.STAR, TokenType.SLASH)) {
      const op = this.previous().value;
      const right = this.parseUnary();
      left = { kind: "BinaryOp", op, left, right };
    }
    return left;
  }

  private parseUnary(): AST.Expr {
    if (this.match(TokenType.AWAIT)) {
      if (this.asyncFunctionDepth === 0) {
        throw new ParseError("await 只能出现在 async func 内", this.previous());
      }
      return { kind: "AwaitExpr", operand: this.parseUnary() };
    }
    if (this.match(TokenType.MINUS, TokenType.PLUS)) {
      const op = this.previous().value;
      const operand = this.parseUnary();
      return { kind: "UnaryOp", op, operand };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AST.Expr {
    const token = this.peek();
    let expr: AST.Expr;

    switch (token.type) {
      case TokenType.NUMBER:
        this.advance();
        expr = { kind: "Literal", value: parseFloat(token.value) };
        break;
      case TokenType.STRING:
        this.advance();
        expr = { kind: "Literal", value: token.value };
        break;
      case TokenType.BOOL:
        this.advance();
        expr = { kind: "Literal", value: token.value === "true" };
        break;
      case TokenType.NULL:
        this.advance();
        expr = { kind: "Literal", value: null };
        break;
      case TokenType.LPAREN: {
        this.advance();
        expr = this.parseExpr();
        this.consume(TokenType.RPAREN, "括号内的表达式需要一个右括号 ) 来结束");
        break;
      }
      case TokenType.LBRACKET:
        expr = this.parseArrayLiteral();
        break;
      case TokenType.LBRACE:
        expr = this.parseMapLiteral();
        break;
      case TokenType.IDENT:
        return this.parsePostfix();
      default:
        throw new ParseError(describeUnexpectedToken(token), token);
    }
    return this.parsePostfixTail(expr);
  }

  private parseArrayLiteral(): AST.ArrayLiteral {
    this.consume(TokenType.LBRACKET, "Expected '['");
    const elements: AST.Expr[] = [];
    if (this.peek().type !== TokenType.RBRACKET) {
      elements.push(this.parseExpr());
      while (this.match(TokenType.COMMA)) {
        elements.push(this.parseExpr());
      }
    }
    this.consume(TokenType.RBRACKET, "数组需要一个右方括号 ] 来结束");
    return { kind: "ArrayLiteral", elements };
  }

  private parseMapLiteral(): AST.MapLiteral {
    this.consume(TokenType.LBRACE, "Expected '{'");
    const entries: Array<{ key: string; value: AST.Expr }> = [];
    if (this.peek().type !== TokenType.RBRACE) {
      do {
        const keyToken = this.peek();
        let key: string;
        if (keyToken.type === TokenType.STRING || keyToken.type === TokenType.IDENT) {
          key = this.advance().value;
        } else {
          throw new ParseError("字典键需要字符串或名字", keyToken);
        }
        this.consume(TokenType.COLON, "字典键后需要冒号 :");
        entries.push({ key, value: this.parseExpr() });
      } while (this.match(TokenType.COMMA));
    }
    this.consume(TokenType.RBRACE, "字典需要右花括号 }");
    return { kind: "MapLiteral", entries };
  }

  private parsePostfix(): AST.Expr {
    const expr: AST.Expr = {
      kind: "Identifier",
      name: this.consume(TokenType.IDENT, "这里需要一个名字（节点名、变量名或函数名）").value,
    };
    return this.parsePostfixTail(expr);
  }

  private parsePostfixTail(initial: AST.Expr): AST.Expr {
    let expr = initial;
    while (true) {
      if (this.match(TokenType.DOT)) {
        const member = this.consume(TokenType.IDENT, "点号 . 后面需要一个名字，例如：door.open").value;
        expr = { kind: "MemberAccess", object: expr, member };
      } else if (this.match(TokenType.LBRACKET)) {
        const index = this.parseExpr();
        this.consume(TokenType.RBRACKET, "索引访问需要一个右方括号 ]，例如：items[0]");
        expr = { kind: "IndexAccess", object: expr, index };
      } else if (this.match(TokenType.LPAREN)) {
        const args: AST.Expr[] = [];
        if (this.peek().type !== TokenType.RPAREN) {
          args.push(this.parseExpr());
          while (this.match(TokenType.COMMA)) {
            args.push(this.parseExpr());
          }
        }
        this.consume(TokenType.RPAREN, "参数列表需要一个右括号 ) 来结束");
        expr = { kind: "Call", callee: expr, args };
      } else {
        break;
      }
    }

    return expr;
  }

  private parseTarget(): AST.Identifier | AST.MemberAccess {
    let object: AST.Identifier | AST.MemberAccess = {
      kind: "Identifier",
      name: this.consume(TokenType.IDENT, "这里需要一个名字（节点名、变量名或函数名）").value,
    };

    while (this.match(TokenType.DOT)) {
      const member = this.consume(TokenType.IDENT, "点号 . 后面需要一个名字，例如：door.open").value;
      object = { kind: "MemberAccess", object, member };
    }

    return object;
  }

  private isComparisonOp(): boolean {
    return [
      TokenType.EQ,
      TokenType.NEQ,
      TokenType.GT,
      TokenType.LT,
      TokenType.GTE,
      TokenType.LTE,
    ].includes(this.peek().type);
  }

  private skipNewlines(): void {
    while (this.peek().type === TokenType.NEWLINE) {
      this.advance();
    }
  }

  private isLineBreak(): boolean {
    return this.peek().type === TokenType.NEWLINE || this.peek().type === TokenType.DEDENT || this.peek().type === TokenType.EOF;
  }

  private match(...types: TokenType[]): boolean {
    if (types.includes(this.peek().type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.peek().type !== type) {
      throw new ParseError(message, this.peek());
    }
    return this.advance();
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.pos++;
    return this.previous();
  }

  private previous(): Token {
    return this.tokens[this.pos - 1];
  }

  private peek(offset = 0): Token {
    return this.tokens[this.pos + offset] ?? this.tokens[this.tokens.length - 1];
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }
}

export function parse(tokens: Token[]): AST.Program {
  return new Parser(tokens).parse();
}

/** Readable message for a token that cannot start an expression; never shows an empty 「」. */
function describeUnexpectedToken(token: Token): string {
  switch (token.type) {
    case TokenType.INDENT: {
      const widths = token.indent ? `应为 ${token.indent.expected} 个空格，实际 ${token.indent.actual} 个空格。` : "";
      return `这一行的缩进比上一行多：${widths}只有以冒号 : 结尾的行（例如 if、when、func）后面才能增加缩进`;
    }
    case TokenType.DEDENT:
      return "代码块在这里结束了，但上一行还没有写完。请检查上一行是否缺少内容";
    case TokenType.NEWLINE:
      return "这一行在这里提前结束了（行尾），后面还需要一个值。可以写数字、文本、true/false，或者一个名字";
    case TokenType.EOF:
      return "代码在这里结束了（文件结尾），后面还需要一个值。可以写数字、文本、true/false，或者一个名字";
    default:
      return token.value
        ? `这里无法理解「${token.value}」。可以写数字、文本、true/false，或者一个名字`
        : "这里无法理解。可以写数字、文本、true/false，或者一个名字";
  }
}
