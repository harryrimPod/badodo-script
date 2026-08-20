"use strict";
var BDSCompiler = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/editor/compiler-browser.ts
  var compiler_browser_exports = {};
  __export(compiler_browser_exports, {
    StrictCompileError: () => StrictCompileError,
    compile: () => compile,
    compileStrict: () => compileStrict,
    parse: () => parse,
    tokenize: () => tokenize
  });

  // src/token.ts
  var KEYWORDS = {
    if: "IF" /* IF */,
    else: "ELSE" /* ELSE */,
    repeat: "REPEAT" /* REPEAT */,
    func: "FUNC" /* FUNC */,
    return: "RETURN" /* RETURN */,
    when: "WHEN" /* WHEN */,
    bind: "BIND" /* BIND */,
    watch: "WATCH" /* WATCH */,
    every: "EVERY" /* EVERY */,
    animate: "ANIMATE" /* ANIMATE */,
    to: "TO" /* TO */,
    in: "IN" /* IN */,
    for: "FOR" /* FOR */,
    import: "IMPORT" /* IMPORT */,
    from: "FROM" /* FROM */,
    as: "AS" /* AS */,
    async: "ASYNC" /* ASYNC */,
    await: "AWAIT" /* AWAIT */,
    type: "TYPE" /* TYPE */,
    enum: "ENUM" /* ENUM */,
    true: "BOOL" /* BOOL */,
    false: "BOOL" /* BOOL */,
    null: "NULL" /* NULL */
  };
  function keywordOrIdent(name) {
    return KEYWORDS[name] ?? "IDENT" /* IDENT */;
  }

  // src/lexer.ts
  var LexerError = class extends Error {
    constructor(message, line, col) {
      super(`\u7B2C ${line} \u884C\u7B2C ${col} \u5217\uFF1A${message}`);
      this.line = line;
      this.col = col;
      this.name = "LexerError";
    }
    line;
    col;
  };
  var Lexer = class {
    constructor(source) {
      this.source = source;
    }
    source;
    pos = 0;
    line = 1;
    col = 1;
    indentStack = [0];
    pendingTokens = [];
    tokenize() {
      const tokens = [];
      while (this.pos < this.source.length) {
        const token = this.nextToken();
        if (token) tokens.push(token);
      }
      while (this.indentStack.length > 1) {
        this.indentStack.pop();
        tokens.push(this.makeToken("DEDENT" /* DEDENT */, ""));
      }
      tokens.push(this.makeToken("EOF" /* EOF */, ""));
      return tokens;
    }
    nextToken() {
      if (this.pendingTokens.length > 0) {
        return this.pendingTokens.shift();
      }
      this.skipSpaces();
      if (this.pos >= this.source.length) return null;
      const ch = this.peek();
      if (ch === "\n") return this.handleNewline();
      if (ch === "#") {
        this.skipComment();
        return null;
      }
      if (ch === '"') return this.readString();
      if (this.isDigit(ch) || ch === "." && this.isDigit(this.peek(1))) {
        return this.readNumber();
      }
      if (this.isIdentStart(ch)) return this.readIdentOrKeyword();
      return this.readOperatorOrPunct();
    }
    handleNewline() {
      this.advance();
      this.line++;
      this.col = 1;
      const nextNonSpace = this.findNextNonSpacePos();
      if (nextNonSpace === -1) {
        return null;
      }
      const indent = this.countIndent();
      const currentIndent = this.indentStack[this.indentStack.length - 1];
      if (indent > currentIndent) {
        this.indentStack.push(indent);
        return this.makeToken("INDENT" /* INDENT */, "");
      }
      if (indent < currentIndent) {
        const dedents = [];
        while (indent < this.indentStack[this.indentStack.length - 1]) {
          this.indentStack.pop();
          dedents.push(this.makeToken("DEDENT" /* DEDENT */, ""));
        }
        if (indent !== this.indentStack[this.indentStack.length - 1]) {
          throw new LexerError("\u7F29\u8FDB\u4E0D\u4E00\u81F4\uFF0C\u8BF7\u68C0\u67E5\u8FD9\u4E00\u884C\u7684\u7A7A\u683C\u6570\u91CF\u662F\u5426\u548C\u4E0A\u4E00\u884C\u5BF9\u9F50", this.line, this.col);
        }
        if (dedents.length > 0) {
          this.pendingTokens.push(...dedents.slice(1));
          return dedents[0];
        }
      }
      return this.makeToken("NEWLINE" /* NEWLINE */, "");
    }
    findNextNonSpacePos() {
      let i = this.pos;
      while (i < this.source.length && (this.source[i] === " " || this.source[i] === "	" || this.source[i] === "\r")) {
        i++;
      }
      if (i >= this.source.length || this.source[i] === "\n" || this.source[i] === "#") {
        return -1;
      }
      return i;
    }
    countIndent() {
      let count = 0;
      while (this.pos < this.source.length && (this.source[this.pos] === " " || this.source[this.pos] === "	")) {
        if (this.source[this.pos] === "	") count += 4;
        else count++;
        this.advance();
      }
      return count;
    }
    skipSpaces() {
      while (this.pos < this.source.length && (this.peek() === " " || this.peek() === "	" || this.peek() === "\r")) {
        this.advance();
      }
    }
    skipComment() {
      while (this.pos < this.source.length && this.peek() !== "\n") {
        this.advance();
      }
    }
    readString() {
      const startLine = this.line;
      const startCol = this.col;
      this.advance();
      let value = "";
      while (this.pos < this.source.length && this.peek() !== '"') {
        if (this.peek() === "\\") {
          this.advance();
          const escaped = this.peek();
          switch (escaped) {
            case '"':
              value += '"';
              break;
            case "n":
              value += "\n";
              break;
            case "t":
              value += "	";
              break;
            case "\\":
              value += "\\";
              break;
            default:
              value += escaped;
              break;
          }
        } else {
          value += this.peek();
        }
        this.advance();
      }
      if (this.pos >= this.source.length) {
        throw new LexerError('\u5B57\u7B26\u4E32\u6CA1\u6709\u95ED\u5408\u7684\u5F15\u53F7\uFF0C\u8BF7\u5728\u7ED3\u5C3E\u52A0\u4E0A "', startLine, startCol);
      }
      this.advance();
      return this.makeToken("STRING" /* STRING */, value, startLine, startCol);
    }
    readNumber() {
      const startLine = this.line;
      const startCol = this.col;
      let value = "";
      let dotCount = 0;
      while (this.pos < this.source.length && (this.isDigit(this.peek()) || this.peek() === ".")) {
        if (this.peek() === ".") {
          dotCount++;
          if (dotCount > 1) break;
        }
        value += this.peek();
        this.advance();
      }
      return this.makeToken("NUMBER" /* NUMBER */, value, startLine, startCol);
    }
    readIdentOrKeyword() {
      const startLine = this.line;
      const startCol = this.col;
      let value = "";
      while (this.pos < this.source.length && this.isIdentPart(this.peek())) {
        value += this.peek();
        this.advance();
      }
      const type = keywordOrIdent(value);
      return this.makeToken(type, value, startLine, startCol);
    }
    readOperatorOrPunct() {
      const startLine = this.line;
      const startCol = this.col;
      const ch = this.peek();
      const twoChar = this.source.slice(this.pos, this.pos + 2);
      const twoCharMap = {
        "==": "EQ" /* EQ */,
        "!=": "NEQ" /* NEQ */,
        ">=": "GTE" /* GTE */,
        "<=": "LTE" /* LTE */,
        "->": "ARROW" /* ARROW */
      };
      if (twoCharMap[twoChar]) {
        this.advance();
        this.advance();
        return this.makeToken(twoCharMap[twoChar], twoChar, startLine, startCol);
      }
      const oneCharMap = {
        "=": "ASSIGN" /* ASSIGN */,
        "+": "PLUS" /* PLUS */,
        "-": "MINUS" /* MINUS */,
        "*": "STAR" /* STAR */,
        "/": "SLASH" /* SLASH */,
        ">": "GT" /* GT */,
        "<": "LT" /* LT */,
        "(": "LPAREN" /* LPAREN */,
        ")": "RPAREN" /* RPAREN */,
        "[": "LBRACKET" /* LBRACKET */,
        "]": "RBRACKET" /* RBRACKET */,
        "{": "LBRACE" /* LBRACE */,
        "}": "RBRACE" /* RBRACE */,
        ":": "COLON" /* COLON */,
        ".": "DOT" /* DOT */,
        ",": "COMMA" /* COMMA */,
        "@": "AT" /* AT */,
        "?": "QUESTION" /* QUESTION */
      };
      if (oneCharMap[ch]) {
        this.advance();
        return this.makeToken(oneCharMap[ch], ch, startLine, startCol);
      }
      throw new LexerError(`\u65E0\u6CD5\u7406\u89E3\u7684\u5B57\u7B26\u300C${ch}\u300D`, this.line, this.col);
    }
    peek(offset = 0) {
      return this.source[this.pos + offset] ?? "\0";
    }
    advance() {
      if (this.pos < this.source.length) {
        this.pos++;
        this.col++;
      }
    }
    isDigit(ch) {
      return ch >= "0" && ch <= "9";
    }
    isIdentStart(ch) {
      return ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z" || ch === "_";
    }
    isIdentPart(ch) {
      return this.isIdentStart(ch) || this.isDigit(ch);
    }
    makeToken(type, value, line, col) {
      return { type, value, line: line ?? this.line, col: col ?? this.col };
    }
  };
  function tokenize(source) {
    return new Lexer(source).tokenize();
  }

  // src/parser.ts
  var ParseError = class extends Error {
    constructor(message, token) {
      super(`\u7B2C ${token.line} \u884C\u7B2C ${token.col} \u5217\uFF1A${message}`);
      this.token = token;
      this.name = "ParseError";
    }
    token;
  };
  var Parser = class {
    constructor(tokens) {
      this.tokens = tokens;
    }
    tokens;
    pos = 0;
    blockDepth = 0;
    asyncFunctionDepth = 0;
    parse() {
      const body = [];
      this.skipNewlines();
      while (!this.isAtEnd()) {
        const stmt = this.parseStmt();
        if (stmt) body.push(stmt);
        this.skipNewlines();
      }
      return { kind: "Program", body };
    }
    parseStmt() {
      this.skipNewlines();
      if (this.isAtEnd()) return null;
      const token = this.peek();
      switch (token.type) {
        case "IF" /* IF */:
          return this.parseIf();
        case "REPEAT" /* REPEAT */:
          return this.parseRepeat();
        case "FUNC" /* FUNC */:
          return this.parseFunc();
        case "ASYNC" /* ASYNC */:
          return this.parseAsyncFunc();
        case "IMPORT" /* IMPORT */:
          return this.parseImport();
        case "WHEN" /* WHEN */:
          return this.parseWhen();
        case "BIND" /* BIND */:
          return this.parseBind();
        case "WATCH" /* WATCH */:
          return this.parseWatch();
        case "EVERY" /* EVERY */:
          return this.parseEvery();
        case "ANIMATE" /* ANIMATE */:
          return this.parseAnimate();
        case "FOR" /* FOR */:
          return this.parseForIn();
        case "AT" /* AT */:
          return this.parseAnnotation();
        case "TYPE" /* TYPE */:
          return this.parseTypeDecl();
        case "ENUM" /* ENUM */:
          return this.parseEnumDecl();
        case "RETURN" /* RETURN */:
          return this.parseReturn();
        default:
          return this.parseSimpleStmt();
      }
    }
    parseIf() {
      const line = this.peek().line;
      this.consume("IF" /* IF */, "Expected 'if'");
      const condition = this.parseExpr();
      this.consume("COLON" /* COLON */, "if \u7684\u6761\u4EF6\u540E\u9762\u9700\u8981\u4E00\u4E2A\u5192\u53F7 :\uFF0C\u4F8B\u5982\uFF1A\n\n  if \u6E29\u5EA6 > 80:");
      const thenBlock = this.parseBlock();
      let elseBlock = null;
      this.skipNewlines();
      if (this.match("ELSE" /* ELSE */)) {
        this.consume("COLON" /* COLON */, "'else' \u540E\u9762\u9700\u8981\u4E00\u4E2A\u5192\u53F7 :");
        elseBlock = this.parseBlock();
      }
      return { kind: "If", condition, thenBlock, elseBlock, line };
    }
    parseRepeat() {
      const line = this.peek().line;
      this.consume("REPEAT" /* REPEAT */, "Expected 'repeat'");
      const count = this.parseExpr();
      this.consume("COLON" /* COLON */, "repeat \u7684\u6B21\u6570\u540E\u9762\u9700\u8981\u4E00\u4E2A\u5192\u53F7 :\uFF0C\u4F8B\u5982\uFF1A\n\n  repeat 3:");
      const body = this.parseBlock();
      return { kind: "Repeat", count, body, line };
    }
    parseFunc() {
      const line = this.peek().line;
      this.consume("FUNC" /* FUNC */, "Expected 'func'");
      const name = this.consume("IDENT" /* IDENT */, "func \u540E\u9762\u9700\u8981\u4E00\u4E2A\u51FD\u6570\u540D\uFF0C\u4F8B\u5982\uFF1Afunc open_door():").value;
      this.consume("LPAREN" /* LPAREN */, "\u51FD\u6570\u540D\u540E\u9762\u9700\u8981\u4E00\u5BF9\u62EC\u53F7 ()");
      const params = [];
      const paramTypes = [];
      if (this.peek().type !== "RPAREN" /* RPAREN */) {
        params.push(this.consume("IDENT" /* IDENT */, "\u53C2\u6570\u9700\u8981\u662F\u4E00\u4E2A\u540D\u5B57").value);
        paramTypes.push(this.match("COLON" /* COLON */) ? this.parseTypeRef() : null);
        while (this.match("COMMA" /* COMMA */)) {
          params.push(this.consume("IDENT" /* IDENT */, "\u53C2\u6570\u9700\u8981\u662F\u4E00\u4E2A\u540D\u5B57").value);
          paramTypes.push(this.match("COLON" /* COLON */) ? this.parseTypeRef() : null);
        }
      }
      this.consume("RPAREN" /* RPAREN */, "\u53C2\u6570\u5217\u8868\u9700\u8981\u4E00\u4E2A\u53F3\u62EC\u53F7 )");
      const returnType = this.match("ARROW" /* ARROW */) ? this.parseTypeRef() : void 0;
      this.consume("COLON" /* COLON */, "\u51FD\u6570\u7B7E\u540D\u540E\u9762\u9700\u8981\u4E00\u4E2A\u5192\u53F7 :\uFF0C\u4F8B\u5982\uFF1A\n\n  func open_door():");
      const body = this.parseBlock();
      const result = { kind: "FuncDef", name, params, body, line };
      if (paramTypes.some((type) => type !== null)) result.paramTypes = paramTypes;
      if (returnType) result.returnType = returnType;
      return result;
    }
    parseAsyncFunc() {
      const line = this.peek().line;
      this.consume("ASYNC" /* ASYNC */, "async \u540E\u9762\u9700\u8981 func");
      this.asyncFunctionDepth++;
      let result;
      try {
        result = this.parseFunc();
      } finally {
        this.asyncFunctionDepth--;
      }
      return { ...result, async: true, line };
    }
    parseImport() {
      const line = this.peek().line;
      this.consume("IMPORT" /* IMPORT */, "Expected 'import'");
      const names = [];
      let defaultImport;
      if (this.peek().type === "STRING" /* STRING */) {
        const source2 = this.advance().value;
        return { kind: "ImportDecl", source: source2, names, line };
      }
      if (this.peek().type === "LBRACE" /* LBRACE */) {
        this.advance();
        if (this.peek().type !== "RBRACE" /* RBRACE */) {
          do {
            const imported = this.consume("IDENT" /* IDENT */, "import \u82B1\u62EC\u53F7\u4E2D\u9700\u8981\u5BFC\u51FA\u540D\u79F0").value;
            const local = this.match("AS" /* AS */) ? this.consume("IDENT" /* IDENT */, "import as \u540E\u9762\u9700\u8981\u672C\u5730\u540D\u79F0").value : imported;
            names.push({ imported, local });
          } while (this.match("COMMA" /* COMMA */));
        }
        this.consume("RBRACE" /* RBRACE */, "import \u540D\u79F0\u5217\u8868\u9700\u8981\u53F3\u82B1\u62EC\u53F7 }");
      } else {
        defaultImport = this.consume("IDENT" /* IDENT */, "import \u9700\u8981\u9ED8\u8BA4\u540D\u79F0\u3001\u82B1\u62EC\u53F7\u540D\u79F0\u6216\u5B57\u7B26\u4E32").value;
      }
      this.consume("FROM" /* FROM */, "import \u540D\u79F0\u540E\u9700\u8981 from");
      const source = this.consume("STRING" /* STRING */, "from \u540E\u9762\u9700\u8981\u6A21\u5757\u5B57\u7B26\u4E32").value;
      return { kind: "ImportDecl", source, defaultImport, names, line };
    }
    parseWhen() {
      const line = this.peek().line;
      this.consume("WHEN" /* WHEN */, "Expected 'when'");
      const fullTarget = this.parseTarget();
      if (fullTarget.kind === "Identifier") {
        throw new ParseError("\u4E8B\u4EF6\u9700\u8981\u5199\u6210\u300C\u8282\u70B9.\u4E8B\u4EF6\u300D\u7684\u5F62\u5F0F\uFF0C\u4F8B\u5982\uFF1Awhen button.click:", this.previous());
      }
      this.consume("COLON" /* COLON */, "\u4E8B\u4EF6\u540E\u9762\u9700\u8981\u4E00\u4E2A\u5192\u53F7 :\uFF0C\u4F8B\u5982\uFF1A\n\n  when button.click:");
      const body = this.parseBlock();
      return { kind: "When", target: fullTarget.object, event: fullTarget.member, body, line };
    }
    parseReturn() {
      const line = this.peek().line;
      this.consume("RETURN" /* RETURN */, "Expected 'return'");
      let value = null;
      if (!this.isAtEnd() && !this.isLineBreak()) {
        value = this.parseExpr();
      }
      return { kind: "Return", value, line };
    }
    parseBind() {
      const line = this.peek().line;
      this.consume("BIND" /* BIND */, "Expected 'bind'");
      const source = this.parseTarget();
      this.consume("ARROW" /* ARROW */, "bind \u9700\u8981\u4E00\u4E2A\u7BAD\u5934 -> \u6765\u8FDE\u63A5\u6570\u636E\u6E90\u548C\u76EE\u6807\uFF0C\u4F8B\u5982\uFF1A\n\n  bind temperature -> gauge.value");
      const target = this.parseTarget();
      if (target.kind === "Identifier") {
        throw new ParseError("bind \u7684\u76EE\u6807\u9700\u8981\u5199\u6210\u300C\u8282\u70B9.\u5C5E\u6027\u300D\u7684\u5F62\u5F0F\uFF0C\u4F8B\u5982\uFF1Agauge.value", this.previous());
      }
      return { kind: "BindStmt", source, target, line };
    }
    parseWatch() {
      const line = this.peek().line;
      this.consume("WATCH" /* WATCH */, "Expected 'watch'");
      const source = this.parseTarget();
      this.consume("COLON" /* COLON */, "watch \u540E\u9762\u9700\u8981\u4E00\u4E2A\u5192\u53F7 :\uFF0C\u4F8B\u5982\uFF1A\n\n  watch temperature:");
      const body = this.parseBlock();
      return { kind: "WatchStmt", source, body, line };
    }
    parseEvery() {
      const line = this.peek().line;
      this.consume("EVERY" /* EVERY */, "Expected 'every'");
      const frame = this.consume("IDENT" /* IDENT */, "every \u540E\u9762\u9700\u8981 frame\uFF0C\u4F8B\u5982\uFF1A\n\n  every frame:");
      if (frame.value !== "frame") {
        throw new ParseError("every \u540E\u9762\u9700\u8981 frame\uFF0C\u4F8B\u5982\uFF1Aevery frame:", frame);
      }
      this.consume("COLON" /* COLON */, "every frame \u540E\u9762\u9700\u8981\u4E00\u4E2A\u5192\u53F7 :");
      const body = this.parseBlock();
      return { kind: "EveryFrame", body, line };
    }
    parseAnimate() {
      const line = this.peek().line;
      this.consume("ANIMATE" /* ANIMATE */, "Expected 'animate'");
      const target = this.parseTarget();
      this.consume("TO" /* TO */, "animate \u9700\u8981\u4E00\u4E2A to \u6765\u8868\u793A\u76EE\u6807\uFF0C\u4F8B\u5982\uFF1A\n\n  animate door.y to 2 in 0.5");
      const value = this.parseExpr();
      this.consume("IN" /* IN */, "animate \u9700\u8981\u4E00\u4E2A in \u6765\u8868\u793A\u65F6\u957F\uFF0C\u4F8B\u5982\uFF1A\n\n  animate door.y to 2 in 0.5");
      const duration = this.parseExpr();
      return { kind: "Animate", target, value, duration, line };
    }
    parseForIn() {
      const line = this.peek().line;
      this.consume("FOR" /* FOR */, "Expected 'for'");
      const item = this.consume("IDENT" /* IDENT */, "for \u540E\u9762\u9700\u8981\u4E00\u4E2A\u53D8\u91CF\u540D\uFF0C\u4F8B\u5982\uFF1A\n\n  for item in items:").value;
      this.consume("IN" /* IN */, "for \u5FAA\u73AF\u9700\u8981\u4E00\u4E2A in\uFF0C\u4F8B\u5982\uFF1A\n\n  for item in items:");
      const iterable = this.parseExpr();
      this.consume("COLON" /* COLON */, "for \u5FAA\u73AF\u540E\u9762\u9700\u8981\u4E00\u4E2A\u5192\u53F7 :\uFF0C\u4F8B\u5982\uFF1A\n\n  for item in items:");
      const body = this.parseBlock();
      return { kind: "ForIn", item, iterable, body, line };
    }
    parseAnnotation() {
      const line = this.peek().line;
      if (this.blockDepth > 0) {
        throw new ParseError("@shared type \u53EA\u80FD\u51FA\u73B0\u5728\u6587\u4EF6\u9876\u5C42", this.peek());
      }
      this.consume("AT" /* AT */, "\u6CE8\u89E3\u9700\u8981\u4EE5 @ \u5F00\u5934");
      const annotation = this.consume("IDENT" /* IDENT */, "@ \u540E\u9762\u9700\u8981 shared\uFF0C\u4F8B\u5982\uFF1A@shared type Device:");
      if (annotation.value !== "shared") {
        throw new ParseError("\u5F53\u524D\u53EA\u652F\u6301 @shared \u6CE8\u89E3", annotation);
      }
      this.consume("TYPE" /* TYPE */, "@shared \u540E\u9762\u9700\u8981 type\uFF0C\u4F8B\u5982\uFF1A@shared type Device:");
      const name = this.consume("IDENT" /* IDENT */, "shared type \u540E\u9762\u9700\u8981\u4E00\u4E2A\u7C7B\u578B\u540D").value;
      this.consume("COLON" /* COLON */, "shared type \u540D\u79F0\u540E\u9762\u9700\u8981\u4E00\u4E2A\u5192\u53F7 :");
      const fields = this.parseSharedFields();
      return { kind: "SharedDecl", name, fields, line };
    }
    parseTypeDecl() {
      const line = this.peek().line;
      if (this.blockDepth > 0) throw new ParseError("type \u53EA\u80FD\u51FA\u73B0\u5728\u6587\u4EF6\u9876\u5C42", this.peek());
      this.consume("TYPE" /* TYPE */, "Expected 'type'");
      const name = this.consume("IDENT" /* IDENT */, "type \u540E\u9762\u9700\u8981\u4E00\u4E2A\u7C7B\u578B\u540D").value;
      this.consume("COLON" /* COLON */, "type \u540D\u79F0\u540E\u9762\u9700\u8981\u5192\u53F7 :");
      return { kind: "TypeDecl", name, fields: this.parseNamedFields("type"), line };
    }
    parseEnumDecl() {
      const line = this.peek().line;
      if (this.blockDepth > 0) throw new ParseError("enum \u53EA\u80FD\u51FA\u73B0\u5728\u6587\u4EF6\u9876\u5C42", this.peek());
      this.consume("ENUM" /* ENUM */, "Expected 'enum'");
      const name = this.consume("IDENT" /* IDENT */, "enum \u540E\u9762\u9700\u8981\u4E00\u4E2A\u540D\u79F0").value;
      this.consume("COLON" /* COLON */, "enum \u540D\u79F0\u540E\u9762\u9700\u8981\u5192\u53F7 :");
      this.skipNewlines();
      this.consume("INDENT" /* INDENT */, "enum \u540E\u9762\u9700\u8981\u7F29\u8FDB\u7684\u6210\u5458\u5217\u8868");
      const values = [];
      while (!this.isAtEnd() && this.peek().type !== "DEDENT" /* DEDENT */) {
        this.skipNewlines();
        if (this.peek().type === "DEDENT" /* DEDENT */) break;
        values.push(this.consume("IDENT" /* IDENT */, "enum \u6210\u5458\u9700\u8981\u4E00\u4E2A\u540D\u5B57").value);
        if (this.peek().type !== "NEWLINE" /* NEWLINE */ && this.peek().type !== "DEDENT" /* DEDENT */ && !this.isAtEnd()) {
          throw new ParseError("enum \u6210\u5458\u884C\u53EA\u80FD\u5305\u542B\u4E00\u4E2A\u540D\u5B57", this.peek());
        }
      }
      this.consume("DEDENT" /* DEDENT */, "enum \u6210\u5458\u5217\u8868\u9700\u8981\u7ED3\u675F\u7F29\u8FDB");
      if (values.length === 0) throw new ParseError("enum \u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u6210\u5458", this.previous());
      if (new Set(values).size !== values.length) throw new ParseError("enum \u6210\u5458\u4E0D\u80FD\u91CD\u590D", this.previous());
      return { kind: "EnumDecl", name, values, line };
    }
    parseSharedFields() {
      return this.parseNamedFields("shared type");
    }
    parseNamedFields(label) {
      this.skipNewlines();
      this.consume("INDENT" /* INDENT */, `${label} \u540E\u9762\u9700\u8981\u7F29\u8FDB\u7684\u5B57\u6BB5\u5217\u8868`);
      const fields = [];
      while (!this.isAtEnd() && this.peek().type !== "DEDENT" /* DEDENT */) {
        this.skipNewlines();
        if (this.peek().type === "DEDENT" /* DEDENT */) break;
        const line = this.peek().line;
        const name = this.consume("IDENT" /* IDENT */, "shared \u5B57\u6BB5\u9700\u8981\u4E00\u4E2A\u540D\u5B57").value;
        const optional = this.match("QUESTION" /* QUESTION */);
        this.consume("COLON" /* COLON */, "shared \u5B57\u6BB5\u540E\u9762\u9700\u8981\u7C7B\u578B\uFF0C\u4F8B\u5982\uFF1Aid: string");
        const type = this.parseTypeRef();
        if (this.peek().type === "ASSIGN" /* ASSIGN */) {
          throw new ParseError("shared \u5B57\u6BB5\u6682\u4E0D\u652F\u6301\u9ED8\u8BA4\u503C", this.peek());
        }
        if (this.peek().type !== "NEWLINE" /* NEWLINE */ && this.peek().type !== "DEDENT" /* DEDENT */ && !this.isAtEnd()) {
          throw new ParseError("shared \u5B57\u6BB5\u884C\u53EA\u80FD\u5305\u542B\u300C\u540D\u5B57: \u7C7B\u578B\u300D", this.peek());
        }
        fields.push({ name, type, optional: optional || void 0, line });
      }
      this.consume("DEDENT" /* DEDENT */, "shared \u5B57\u6BB5\u5217\u8868\u9700\u8981\u7ED3\u675F\u7F29\u8FDB");
      if (fields.length === 0) {
        throw new ParseError(`${label} \u81F3\u5C11\u9700\u8981\u4E00\u4E2A\u5B57\u6BB5`, this.previous());
      }
      return fields;
    }
    parseSimpleStmt() {
      const line = this.peek().line;
      if (this.peek().type === "IDENT" /* IDENT */ && this.peek(1).type === "COLON" /* COLON */) {
        const name = this.advance().value;
        this.advance();
        const typeAnnotation = this.parseTypeRef();
        this.consume("ASSIGN" /* ASSIGN */, "\u7C7B\u578B\u58F0\u660E\u540E\u9700\u8981\u4E00\u4E2A\u8D4B\u503C\uFF0C\u4F8B\u5982\uFF1Ax: i32 = 1");
        const value = this.parseExpr();
        return { kind: "VarDecl", name, value, line, typeAnnotation };
      }
      const expr = this.parseExpr();
      if (expr.kind === "Identifier" || expr.kind === "MemberAccess" || expr.kind === "IndexAccess") {
        if (this.match("ASSIGN" /* ASSIGN */)) {
          const value = this.parseExpr();
          if (expr.kind === "Identifier") {
            return { kind: "VarDecl", name: expr.name, value, line };
          }
          return { kind: "Assign", target: expr, value, line };
        }
      }
      return { kind: "ExpressionStmt", expression: expr, line };
    }
    parseTypeRef() {
      const token = this.consume("IDENT" /* IDENT */, "\u7C7B\u578B\u6CE8\u89E3\u9700\u8981\u4E00\u4E2A\u7C7B\u578B\u540D\uFF0C\u4F8B\u5982\uFF1Ai32\u3001f64\u3001string");
      return { kind: "TypeRef", name: token.value };
    }
    parseBlock() {
      this.skipNewlines();
      this.consume("INDENT" /* INDENT */, "\u8FD9\u91CC\u9700\u8981\u4E00\u4E2A\u7F29\u8FDB\u7684\u4EE3\u7801\u5757\u3002\u8BF7\u5728\u5192\u53F7 : \u540E\u9762\u6362\u884C\uFF0C\u5E76\u8BA9\u4E0B\u4E00\u884C\u6BD4\u5F53\u524D\u884C\u7F29\u8FDB\u66F4\u9760\u53F3");
      const body = [];
      this.blockDepth++;
      try {
        while (!this.isAtEnd() && this.peek().type !== "DEDENT" /* DEDENT */) {
          this.skipNewlines();
          if (this.peek().type === "DEDENT" /* DEDENT */) break;
          const stmt = this.parseStmt();
          if (stmt) body.push(stmt);
          this.skipNewlines();
        }
        this.consume("DEDENT" /* DEDENT */, "Expected end of block");
      } finally {
        this.blockDepth--;
      }
      return { kind: "Block", body };
    }
    parseExpr() {
      return this.parseComparison();
    }
    parseComparison() {
      let left = this.parseAdditive();
      while (this.isComparisonOp()) {
        const op = this.advance().value;
        const right = this.parseAdditive();
        left = { kind: "BinaryOp", op, left, right };
      }
      return left;
    }
    parseAdditive() {
      let left = this.parseMultiplicative();
      while (this.match("PLUS" /* PLUS */, "MINUS" /* MINUS */)) {
        const op = this.previous().value;
        const right = this.parseMultiplicative();
        left = { kind: "BinaryOp", op, left, right };
      }
      return left;
    }
    parseMultiplicative() {
      let left = this.parseUnary();
      while (this.match("STAR" /* STAR */, "SLASH" /* SLASH */)) {
        const op = this.previous().value;
        const right = this.parseUnary();
        left = { kind: "BinaryOp", op, left, right };
      }
      return left;
    }
    parseUnary() {
      if (this.match("AWAIT" /* AWAIT */)) {
        if (this.asyncFunctionDepth === 0) {
          throw new ParseError("await \u53EA\u80FD\u51FA\u73B0\u5728 async func \u5185", this.previous());
        }
        return { kind: "AwaitExpr", operand: this.parseUnary() };
      }
      if (this.match("MINUS" /* MINUS */, "PLUS" /* PLUS */)) {
        const op = this.previous().value;
        const operand = this.parseUnary();
        return { kind: "UnaryOp", op, operand };
      }
      return this.parsePrimary();
    }
    parsePrimary() {
      const token = this.peek();
      let expr;
      switch (token.type) {
        case "NUMBER" /* NUMBER */:
          this.advance();
          expr = { kind: "Literal", value: parseFloat(token.value) };
          break;
        case "STRING" /* STRING */:
          this.advance();
          expr = { kind: "Literal", value: token.value };
          break;
        case "BOOL" /* BOOL */:
          this.advance();
          expr = { kind: "Literal", value: token.value === "true" };
          break;
        case "NULL" /* NULL */:
          this.advance();
          expr = { kind: "Literal", value: null };
          break;
        case "LPAREN" /* LPAREN */: {
          this.advance();
          expr = this.parseExpr();
          this.consume("RPAREN" /* RPAREN */, "\u62EC\u53F7\u5185\u7684\u8868\u8FBE\u5F0F\u9700\u8981\u4E00\u4E2A\u53F3\u62EC\u53F7 ) \u6765\u7ED3\u675F");
          break;
        }
        case "LBRACKET" /* LBRACKET */:
          expr = this.parseArrayLiteral();
          break;
        case "LBRACE" /* LBRACE */:
          expr = this.parseMapLiteral();
          break;
        case "IDENT" /* IDENT */:
          return this.parsePostfix();
        default:
          throw new ParseError(`\u8FD9\u91CC\u65E0\u6CD5\u7406\u89E3\u300C${token.value}\u300D\u3002\u53EF\u4EE5\u5199\u6570\u5B57\u3001\u6587\u672C\u3001true/false\uFF0C\u6216\u8005\u4E00\u4E2A\u540D\u5B57`, token);
      }
      return this.parsePostfixTail(expr);
    }
    parseArrayLiteral() {
      this.consume("LBRACKET" /* LBRACKET */, "Expected '['");
      const elements = [];
      if (this.peek().type !== "RBRACKET" /* RBRACKET */) {
        elements.push(this.parseExpr());
        while (this.match("COMMA" /* COMMA */)) {
          elements.push(this.parseExpr());
        }
      }
      this.consume("RBRACKET" /* RBRACKET */, "\u6570\u7EC4\u9700\u8981\u4E00\u4E2A\u53F3\u65B9\u62EC\u53F7 ] \u6765\u7ED3\u675F");
      return { kind: "ArrayLiteral", elements };
    }
    parseMapLiteral() {
      this.consume("LBRACE" /* LBRACE */, "Expected '{'");
      const entries = [];
      if (this.peek().type !== "RBRACE" /* RBRACE */) {
        do {
          const keyToken = this.peek();
          let key;
          if (keyToken.type === "STRING" /* STRING */ || keyToken.type === "IDENT" /* IDENT */) {
            key = this.advance().value;
          } else {
            throw new ParseError("\u5B57\u5178\u952E\u9700\u8981\u5B57\u7B26\u4E32\u6216\u540D\u5B57", keyToken);
          }
          this.consume("COLON" /* COLON */, "\u5B57\u5178\u952E\u540E\u9700\u8981\u5192\u53F7 :");
          entries.push({ key, value: this.parseExpr() });
        } while (this.match("COMMA" /* COMMA */));
      }
      this.consume("RBRACE" /* RBRACE */, "\u5B57\u5178\u9700\u8981\u53F3\u82B1\u62EC\u53F7 }");
      return { kind: "MapLiteral", entries };
    }
    parsePostfix() {
      const expr = {
        kind: "Identifier",
        name: this.consume("IDENT" /* IDENT */, "\u8FD9\u91CC\u9700\u8981\u4E00\u4E2A\u540D\u5B57\uFF08\u8282\u70B9\u540D\u3001\u53D8\u91CF\u540D\u6216\u51FD\u6570\u540D\uFF09").value
      };
      return this.parsePostfixTail(expr);
    }
    parsePostfixTail(initial) {
      let expr = initial;
      while (true) {
        if (this.match("DOT" /* DOT */)) {
          const member = this.consume("IDENT" /* IDENT */, "\u70B9\u53F7 . \u540E\u9762\u9700\u8981\u4E00\u4E2A\u540D\u5B57\uFF0C\u4F8B\u5982\uFF1Adoor.open").value;
          expr = { kind: "MemberAccess", object: expr, member };
        } else if (this.match("LBRACKET" /* LBRACKET */)) {
          const index = this.parseExpr();
          this.consume("RBRACKET" /* RBRACKET */, "\u7D22\u5F15\u8BBF\u95EE\u9700\u8981\u4E00\u4E2A\u53F3\u65B9\u62EC\u53F7 ]\uFF0C\u4F8B\u5982\uFF1Aitems[0]");
          expr = { kind: "IndexAccess", object: expr, index };
        } else if (this.match("LPAREN" /* LPAREN */)) {
          const args = [];
          if (this.peek().type !== "RPAREN" /* RPAREN */) {
            args.push(this.parseExpr());
            while (this.match("COMMA" /* COMMA */)) {
              args.push(this.parseExpr());
            }
          }
          this.consume("RPAREN" /* RPAREN */, "\u53C2\u6570\u5217\u8868\u9700\u8981\u4E00\u4E2A\u53F3\u62EC\u53F7 ) \u6765\u7ED3\u675F");
          expr = { kind: "Call", callee: expr, args };
        } else {
          break;
        }
      }
      return expr;
    }
    parseTarget() {
      let object = {
        kind: "Identifier",
        name: this.consume("IDENT" /* IDENT */, "\u8FD9\u91CC\u9700\u8981\u4E00\u4E2A\u540D\u5B57\uFF08\u8282\u70B9\u540D\u3001\u53D8\u91CF\u540D\u6216\u51FD\u6570\u540D\uFF09").value
      };
      while (this.match("DOT" /* DOT */)) {
        const member = this.consume("IDENT" /* IDENT */, "\u70B9\u53F7 . \u540E\u9762\u9700\u8981\u4E00\u4E2A\u540D\u5B57\uFF0C\u4F8B\u5982\uFF1Adoor.open").value;
        object = { kind: "MemberAccess", object, member };
      }
      return object;
    }
    isComparisonOp() {
      return [
        "EQ" /* EQ */,
        "NEQ" /* NEQ */,
        "GT" /* GT */,
        "LT" /* LT */,
        "GTE" /* GTE */,
        "LTE" /* LTE */
      ].includes(this.peek().type);
    }
    skipNewlines() {
      while (this.peek().type === "NEWLINE" /* NEWLINE */) {
        this.advance();
      }
    }
    isLineBreak() {
      return this.peek().type === "NEWLINE" /* NEWLINE */ || this.peek().type === "DEDENT" /* DEDENT */ || this.peek().type === "EOF" /* EOF */;
    }
    match(...types) {
      if (types.includes(this.peek().type)) {
        this.advance();
        return true;
      }
      return false;
    }
    consume(type, message) {
      if (this.peek().type !== type) {
        throw new ParseError(message, this.peek());
      }
      return this.advance();
    }
    advance() {
      if (!this.isAtEnd()) this.pos++;
      return this.previous();
    }
    previous() {
      return this.tokens[this.pos - 1];
    }
    peek(offset = 0) {
      return this.tokens[this.pos + offset] ?? this.tokens[this.tokens.length - 1];
    }
    isAtEnd() {
      return this.peek().type === "EOF" /* EOF */;
    }
  };
  function parse(tokens) {
    return new Parser(tokens).parse();
  }

  // src/generator.ts
  var TypeScriptGenerator = class {
    indentLevel = 0;
    output = "";
    mappings = [];
    knownTypes = /* @__PURE__ */ new Set();
    options;
    constructor(options = {}) {
      this.options = { emitTypes: options.emitTypes === true };
    }
    generate(node) {
      this.output = "";
      this.mappings = [];
      this.knownTypes = new Set(node.body.filter((stmt) => stmt.kind === "TypeDecl" || stmt.kind === "EnumDecl" || stmt.kind === "SharedDecl").map((stmt) => stmt.name));
      for (const stmt of node.body) {
        this.writeStmt(stmt);
        this.output += "\n";
      }
      return this.output.trim();
    }
    getMappings() {
      return this.mappings;
    }
    currentLine() {
      let line = 1;
      for (let i = 0; i < this.output.length; i++) {
        if (this.output[i] === "\n") line++;
      }
      return line;
    }
    writeStmt(stmt) {
      if (stmt.kind === "SharedDecl" || stmt.kind === "TypeDecl" && !this.options.emitTypes) return;
      this.mappings.push({ generatedLine: this.currentLine(), sourceLine: stmt.line });
      this.writeIndent();
      switch (stmt.kind) {
        case "TypeDecl": {
          if (this.options.emitTypes) {
            this.output += `interface ${stmt.name} {
`;
            this.indentLevel++;
            for (const field of stmt.fields) {
              this.writeIndent();
              this.output += `${field.name}${field.optional ? "?" : ""}: ${typeRefToTypeScript(field.type, this.knownTypes)};
`;
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
          const named = stmt.names.length > 0 ? `{ ${stmt.names.map((item) => item.imported === item.local ? item.imported : `${item.imported} as ${item.local}`).join(", ")} }` : "";
          const bindings = [stmt.defaultImport, named].filter(Boolean).join(", ");
          this.output += bindings ? `import ${bindings} from ${JSON.stringify(stmt.source)};` : `import ${JSON.stringify(stmt.source)};`;
          break;
        }
        case "VarDecl":
          this.output += `let ${stmt.name}${this.writeTypeAnnotation(stmt.typeAnnotation)} = ${this.writeExpr(stmt.value)};`;
          break;
        case "Assign":
          this.output += `${this.writeExpr(stmt.target)} = ${this.writeExpr(stmt.value)};`;
          break;
        case "If": {
          this.output += `if (${this.writeExpr(stmt.condition)}) {
`;
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
          this.output += `for (let __i = 0; __i < ${count}; __i++) {
`;
          this.indentLevel++;
          this.writeBlock(stmt.body);
          this.indentLevel--;
          this.writeIndent();
          this.output += "}";
          break;
        }
        case "FuncDef": {
          const params = stmt.params.map((name, index) => `${name}${this.writeTypeAnnotation(stmt.paramTypes?.[index])}`).join(", ");
          const returnType = this.options.emitTypes && stmt.returnType ? `: ${stmt.async ? `Promise<${typeRefToTypeScript(stmt.returnType, this.knownTypes)}>` : typeRefToTypeScript(stmt.returnType, this.knownTypes)}` : "";
          this.output += `${stmt.async ? "async " : ""}function ${stmt.name}(${params})${returnType} {
`;
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
          this.output += `on(${target}, "${stmt.event}", () => {
`;
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
          this.output += `watch(() => ${source}, (value) => {
`;
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
          this.output += `for (const ${stmt.item} of ${iterable}) {
`;
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
    writeBlock(block) {
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
    writeExpr(expr, parentPrecedence = 0, samePrecedenceNeedsParens = false) {
      switch (expr.kind) {
        case "Literal":
          return this.writeLiteral(expr.value);
        case "Identifier":
          return expr.name;
        case "MemberAccess": {
          const text = `${this.writeExpr(expr.object, 5)}.${expr.member}`;
          return 5 < parentPrecedence ? `(${text})` : text;
        }
        case "IndexAccess": {
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
        case "Call": {
          const callee = this.writeExpr(expr.callee, 5);
          const args = expr.args.map((arg) => this.writeExpr(arg)).join(", ");
          const text = `${callee}(${args})`;
          return 5 < parentPrecedence ? `(${text})` : text;
        }
        case "BinaryOp": {
          const precedence = binaryPrecedence(expr.op);
          const leftNeedsParens = precedence === 1 && expr.left.kind === "BinaryOp" && binaryPrecedence(expr.left.op) === precedence;
          const text = `${this.writeExpr(expr.left, precedence, leftNeedsParens)} ${expr.op} ${this.writeExpr(expr.right, precedence, true)}`;
          return precedence < parentPrecedence || precedence === parentPrecedence && samePrecedenceNeedsParens ? `(${text})` : text;
        }
        case "UnaryOp": {
          const precedence = 4;
          const operandNeedsParens = expr.operand.kind === "UnaryOp";
          const text = `${expr.op}${this.writeExpr(expr.operand, precedence, operandNeedsParens)}`;
          return precedence < parentPrecedence || precedence === parentPrecedence && samePrecedenceNeedsParens ? `(${text})` : text;
        }
      }
    }
    writeLiteral(value) {
      if (value === null) return "null";
      if (typeof value === "string") return JSON.stringify(value);
      return String(value);
    }
    writeTypeAnnotation(type) {
      if (!this.options.emitTypes || !type) return "";
      return `: ${typeRefToTypeScript(type, this.knownTypes)}`;
    }
    writeIndent() {
      this.output += "  ".repeat(this.indentLevel);
    }
  };
  function binaryPrecedence(operator) {
    if (operator === "*" || operator === "/") return 3;
    if (operator === "+" || operator === "-") return 2;
    return 1;
  }
  function generateWithMap(ast, options = {}) {
    const gen = new TypeScriptGenerator(options);
    const code = gen.generate(ast);
    return { code, mappings: gen.getMappings() };
  }
  function typeRefToTypeScript(type, knownTypes = /* @__PURE__ */ new Set()) {
    switch (type.name) {
      case "bool":
        return "boolean";
      case "i32":
      case "f64":
      case "number":
        return "number";
      case "string":
        return "string";
      case "bytes":
        return "Uint8Array";
      case "null":
        return "null";
      case "array":
        return "unknown[]";
      case "map":
        return "Record<string, unknown>";
      case "option":
        return "Option<unknown>";
      case "result":
        return "Result<unknown, unknown>";
      case "unit":
        return "void";
      default:
        return knownTypes.has(type.name) ? type.name : "unknown";
    }
  }

  // src/sourcemap.ts
  var BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function vlqEncode(value) {
    let vlq = value < 0 ? -value << 1 | 1 : value << 1;
    let result = "";
    do {
      let digit = vlq & 31;
      vlq >>>= 5;
      if (vlq > 0) digit |= 32;
      result += BASE64[digit];
    } while (vlq > 0);
    return result;
  }
  function generateSourceMap(opts) {
    const sorted = [...opts.mappings].sort((a, b) => a.generatedLine - b.generatedLine);
    let prevSourceLine = 0;
    const lineSegments = [];
    let lastGeneratedLine = 0;
    for (const m of sorted) {
      while (lastGeneratedLine < m.generatedLine - 1) {
        lineSegments.push("");
        lastGeneratedLine++;
      }
      const genCol = 0;
      const srcIdx = 0;
      const srcLineDelta = m.sourceLine - prevSourceLine;
      const srcCol = 0;
      prevSourceLine = m.sourceLine;
      lineSegments.push(vlqEncode(genCol) + vlqEncode(srcIdx) + vlqEncode(srcLineDelta) + vlqEncode(srcCol));
      lastGeneratedLine = m.generatedLine;
    }
    const map = {
      version: 3,
      file: opts.file,
      sources: [opts.source],
      sourcesContent: [opts.sourceContent],
      names: [],
      mappings: lineSegments.join(";")
    };
    return JSON.stringify(map);
  }

  // src/analysis.ts
  var BUILTINS = /* @__PURE__ */ new Set(["vec3", "color", "some", "none", "ok", "err", "is_ok", "unwrap"]);
  var RUNTIME_NAMES = /* @__PURE__ */ new Set(["time", "value", "delta", "bind", "watch", "onFrame", "on", "animate", "animateTo"]);
  function analyzeProgram(program) {
    const declarations = [];
    const references = [];
    const diagnostics = [];
    const sceneNodes = /* @__PURE__ */ new Set();
    const scopes = [{ name: "module", symbols: /* @__PURE__ */ new Map() }];
    const declare = (name, kind, line) => {
      const scope = scopes[scopes.length - 1];
      if (scope.symbols.has(name)) {
        diagnostics.push({
          code: "BDS-SYMBOL-002",
          severity: "warning",
          message: `\u4F5C\u7528\u57DF\u300C${scope.name}\u300D\u4E2D\u91CD\u590D\u58F0\u660E\u300C${name}\u300D`,
          name,
          line
        });
        return;
      }
      const declaration = { name, kind, scope: scope.name, line };
      scope.symbols.set(name, declaration);
      declarations.push(declaration);
    };
    const lookup = (name) => {
      for (let i = scopes.length - 1; i >= 0; i--) {
        const symbol = scopes[i].symbols.get(name);
        if (symbol) return symbol.kind;
      }
      if (BUILTINS.has(name)) return "builtin";
      if (RUNTIME_NAMES.has(name)) return "runtime";
      return "scene-node";
    };
    const reference = (expr, line) => {
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
          message: `\u672A\u58F0\u660E\u6807\u8BC6\u7B26\u300C${root}\u300D\u6309\u517C\u5BB9\u89C4\u5219\u89C6\u4E3A\u573A\u666F\u8282\u70B9\u5019\u9009`,
          name: root,
          line
        });
      }
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
    const visitExpr = (expr, line) => {
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
    const visitBlock = (block, scopeName, implicit) => {
      scopes.push({ name: scopeName, symbols: /* @__PURE__ */ new Map() });
      if (implicit) declare(implicit, "variable");
      for (const stmt of block.body) visitStmt(stmt);
      scopes.pop();
    };
    const visitStmt = (stmt) => {
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
          scopes.push({ name: `func:${stmt.name}@${stmt.line}`, symbols: /* @__PURE__ */ new Map() });
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
          scopes.push({ name: `for@${stmt.line}`, symbols: /* @__PURE__ */ new Map() });
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
  function rootPath(expr) {
    if (expr.kind === "Identifier") return { root: expr.name, path: [] };
    if (expr.kind === "MemberAccess") {
      const parent = rootPath(expr.object);
      return parent.root ? { root: parent.root, path: [...parent.path, expr.member] } : { root: null, path: [] };
    }
    if (expr.kind === "IndexAccess") return rootPath(expr.object);
    if (expr.kind === "Call") return rootPath(expr.callee);
    return { root: null, path: [] };
  }

  // src/type-checker.ts
  var UNKNOWN = { kind: "unknown" };
  var UNIT = { kind: "unit" };
  function checkProgram(program) {
    const diagnostics = [];
    const expressionTypes = /* @__PURE__ */ new Map();
    const declarationTypes = /* @__PURE__ */ new Map();
    const root = { values: /* @__PURE__ */ new Map() };
    const sharedTypes = /* @__PURE__ */ new Map();
    for (const stmt of program.body) {
      if (stmt.kind === "SharedDecl" || stmt.kind === "TypeDecl") {
        sharedTypes.set(stmt.name, { kind: "record", name: stmt.name, fields: {} });
      }
      if (stmt.kind === "EnumDecl") {
        sharedTypes.set(stmt.name, { kind: "record", name: stmt.name, fields: Object.fromEntries(stmt.values.map((value) => [value, { kind: "string" }])) });
      }
    }
    for (const stmt of program.body) {
      if (stmt.kind === "SharedDecl" || stmt.kind === "TypeDecl") {
        const record = sharedTypes.get(stmt.name);
        for (const field of stmt.fields) record.fields[field.name] = typeFromRef(field.type, field.line);
        root.values.set(stmt.name, record);
      }
      if (stmt.kind === "EnumDecl") root.values.set(stmt.name, sharedTypes.get(stmt.name));
    }
    for (const stmt of program.body) {
      if (stmt.kind === "FuncDef") {
        const params = (stmt.paramTypes ?? []).map((type) => type ? typeFromRef(type, stmt.line) : UNKNOWN);
        root.values.set(stmt.name, { kind: "function", params, result: stmt.returnType ? typeFromRef(stmt.returnType, stmt.line) : UNKNOWN });
      }
    }
    for (const stmt of program.body) checkStmt(stmt, root);
    return { diagnostics, expressionTypes, declarationTypes };
    function checkStmt(stmt, env, fn) {
      switch (stmt.kind) {
        case "ImportDecl":
          return;
        case "VarDecl": {
          const inferred = checkExpr(stmt.value, env);
          const expected = stmt.typeAnnotation ? typeFromRef(stmt.typeAnnotation, stmt.line) : inferred;
          if (stmt.typeAnnotation && !assignable(inferred, expected)) {
            report("BDS-TYPE-001", "error", `\u53D8\u91CF\u300C${stmt.name}\u300D\u7684\u503C\u7C7B\u578B ${typeName(inferred)} \u4E0D\u5339\u914D\u6CE8\u89E3 ${typeName(expected)}`, stmt.line);
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
              report("BDS-TYPE-001", "error", `\u53D8\u91CF\u300C${stmt.target.name}\u300D\u4E0D\u80FD\u4ECE ${typeName(previous)} \u8D4B\u503C\u4E3A ${typeName(value)}`, stmt.line);
            }
          }
          checkExpr(stmt.target, env);
          return;
        }
        case "If":
          requireBoolean(checkExpr(stmt.condition, env), stmt.line, "if \u6761\u4EF6");
          checkBlock(stmt.thenBlock, env, fn, `if@${stmt.line}`);
          if (stmt.elseBlock) checkBlock(stmt.elseBlock, env, fn, `else@${stmt.line}`);
          return;
        case "Repeat":
          requireNumeric(checkExpr(stmt.count, env), stmt.line, "repeat \u6B21\u6570");
          checkBlock(stmt.body, env, fn, `repeat@${stmt.line}`);
          return;
        case "FuncDef": {
          const signature = lookup(env, stmt.name);
          const functionType = signature?.kind === "function" ? signature : { kind: "function", params: [], result: UNKNOWN };
          const child = { parent: env, values: /* @__PURE__ */ new Map() };
          for (let i = 0; i < stmt.params.length; i++) child.values.set(stmt.params[i], functionType.params[i] ?? UNKNOWN);
          const context = { expectedReturn: functionType.result, returns: [] };
          for (const bodyStmt of stmt.body.body) checkStmt(bodyStmt, child, context);
          if (stmt.returnType) {
            for (const returned of context.returns) {
              if (!assignable(returned, context.expectedReturn)) {
                report("BDS-TYPE-001", "error", `\u51FD\u6570\u300C${stmt.name}\u300D\u8FD4\u56DE ${typeName(returned)}\uFF0C\u4F46\u58F0\u660E\u4E3A ${typeName(context.expectedReturn)}`, stmt.line);
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
          const child = { parent: env, values: /* @__PURE__ */ new Map([["value", source]]) };
          for (const bodyStmt of stmt.body.body) checkStmt(bodyStmt, child, fn);
          return;
        }
        case "EveryFrame": {
          const child = { parent: env, values: /* @__PURE__ */ new Map([["time", { kind: "f64" }]]) };
          for (const bodyStmt of stmt.body.body) checkStmt(bodyStmt, child, fn);
          return;
        }
        case "Animate":
          checkExpr(stmt.target, env);
          checkExpr(stmt.value, env);
          requireNumeric(checkExpr(stmt.duration, env), stmt.line, "animate \u65F6\u957F");
          return;
        case "ForIn": {
          const iterable = checkExpr(stmt.iterable, env);
          const item = iterable.kind === "array" ? iterable.element : iterable.kind === "map" ? iterable.value : UNKNOWN;
          const child = { parent: env, values: /* @__PURE__ */ new Map([[stmt.item, item]]) };
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
    function checkBlock(block, env, fn, name) {
      const child = { parent: env, values: /* @__PURE__ */ new Map() };
      for (const stmt of block.body) checkStmt(stmt, child, fn);
      void name;
    }
    function checkExpr(expr, env) {
      let type;
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
          if (object.kind === "array") requireNumeric(indexType, void 0, "\u6570\u7EC4\u7D22\u5F15");
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
            if (!isNumeric(left) || !isNumeric(right)) report("BDS-TYPE-003", "error", `\u8FD0\u7B97\u7B26\u300C${expr.op}\u300D\u9700\u8981\u6570\u503C\u64CD\u4F5C\u6570`);
            type = left.kind === "f64" || right.kind === "f64" ? { kind: "f64" } : { kind: "i32" };
          } else {
            type = { kind: "bool" };
          }
          break;
        }
        case "UnaryOp":
          type = checkExpr(expr.operand, env);
          requireNumeric(type, void 0, "\u4E00\u5143\u6570\u503C\u8FD0\u7B97");
          break;
      }
      expressionTypes.set(expr, type);
      return type;
    }
    function typeFromRef(ref, line) {
      switch (ref.name) {
        case "bool":
          return { kind: "bool" };
        case "i32":
          return { kind: "i32" };
        case "f64":
          return { kind: "f64" };
        case "string":
          return { kind: "string" };
        case "bytes":
          return { kind: "bytes" };
        case "null":
          return { kind: "null" };
        case "array":
          return { kind: "array", element: UNKNOWN };
        case "map":
          return { kind: "map", value: UNKNOWN };
        case "option":
          return { kind: "option", value: UNKNOWN };
        case "result":
          return { kind: "result", value: UNKNOWN, error: UNKNOWN };
        case "record":
          return sharedTypes.get(ref.name) ?? UNKNOWN;
        default:
          if (sharedTypes.has(ref.name)) return sharedTypes.get(ref.name);
          report("BDS-TYPE-002", "warning", `\u7C7B\u578B\u300C${ref.name}\u300D\u5C1A\u672A\u5728 Phase 1 \u6838\u5FC3\u7C7B\u578B\u4E2D\u5B9A\u4E49`, line);
          return UNKNOWN;
      }
    }
    function lookup(env, name) {
      for (let current = env; current; current = current.parent) {
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
      return void 0;
    }
    function assignable(actual, expected) {
      return actual.kind === "unknown" || expected.kind === "unknown" || actual.kind === expected.kind || actual.kind === "i32" && expected.kind === "f64" || actual.kind === "record" && expected.kind === "record" && actual.name === expected.name || actual.kind === "map" && expected.kind === "record";
    }
    function merge(left, right) {
      if (left.kind === "unknown") return right;
      if (right.kind === "unknown" || left.kind === right.kind) return left;
      if (left.kind === "i32" && right.kind === "f64" || left.kind === "f64" && right.kind === "i32") return { kind: "f64" };
      return UNKNOWN;
    }
    function isNumeric(type) {
      return type.kind === "i32" || type.kind === "f64" || type.kind === "unknown";
    }
    function requireNumeric(type, line, context) {
      if (!isNumeric(type)) report("BDS-TYPE-003", "error", `${context}\u9700\u8981\u6570\u503C\u7C7B\u578B`, line);
    }
    function requireBoolean(type, line, context) {
      if (type.kind !== "bool" && type.kind !== "unknown") report("BDS-TYPE-004", "error", `${context}\u9700\u8981 bool`, line);
    }
    function typeName(type) {
      if (type.kind === "array") return `array<${typeName(type.element)}>`;
      if (type.kind === "map") return `map<${typeName(type.value)}>`;
      if (type.kind === "option") return `Option<${typeName(type.value)}>`;
      if (type.kind === "result") return `Result<${typeName(type.value)}, ${typeName(type.error)}>`;
      if (type.kind === "record") return type.name;
      if (type.kind === "node") return type.path.join(".");
      if (type.kind === "function") return "func";
      return type.kind;
    }
    function report(code, severity, message, line) {
      diagnostics.push({ code, severity, message, line });
    }
  }

  // src/capabilities.ts
  var RUNTIME_CAPABILITIES = [
    { id: "runtime.bind", kind: "runtime", target: "web", name: "bind", signature: "(getter, node, prop) -> void", version: "0.1" },
    { id: "runtime.watch", kind: "runtime", target: "web", name: "watch", signature: "(getter, handler) -> void", version: "0.1" },
    { id: "runtime.on-frame", kind: "runtime", target: "web", name: "onFrame", signature: "(handler(time)) -> void", version: "0.1" },
    { id: "runtime.on", kind: "runtime", target: "portable", name: "on", signature: "(node, event, handler) -> void", version: "0.1" },
    { id: "runtime.animate", kind: "runtime", target: "web", name: "animate", signature: "(node, prop, value, duration) -> void", version: "0.1" },
    { id: "runtime.animate-to", kind: "runtime", target: "web", name: "animateTo", signature: "(node, target, duration) -> void", version: "0.1" }
  ];
  var BUILTIN_CAPABILITIES = [
    { id: "builtin.vec3", kind: "builtin", target: "portable", name: "vec3", signature: "(x, y, z) -> Vec3", version: "0.1" },
    { id: "builtin.color", kind: "builtin", target: "portable", name: "color", signature: "(r, g, b) -> Color", version: "0.1" },
    { id: "builtin.some", kind: "builtin", target: "portable", name: "some", signature: "(T) -> Option<T>", version: "0.2" },
    { id: "builtin.none", kind: "builtin", target: "portable", name: "none", signature: "() -> Option<T>", version: "0.2" },
    { id: "builtin.ok", kind: "builtin", target: "portable", name: "ok", signature: "(T) -> Result<T,E>", version: "0.2" },
    { id: "builtin.err", kind: "builtin", target: "portable", name: "err", signature: "(E) -> Result<T,E>", version: "0.2" },
    { id: "builtin.is-ok", kind: "builtin", target: "portable", name: "is_ok", signature: "(Result<T,E>) -> bool", version: "0.2" },
    { id: "builtin.unwrap", kind: "builtin", target: "portable", name: "unwrap", signature: "(Result<T,E>) -> T", version: "0.2" }
  ];
  var ADAPTER_CAPABILITIES = [
    { id: "adapter.go.http", kind: "adapter", target: "server", name: "Go net/http", signature: "JSON request/response handler", version: "0.1" },
    { id: "adapter.go.mqtt", kind: "adapter", target: "server", name: "Go MQTT", signature: "JSON request/response topic handler", version: "0.1" },
    { id: "adapter.godot.shared", kind: "adapter", target: "godot", name: "Godot C# Shared DTO", signature: "System.Text.Json DTO + Validate", version: "0.1" },
    { id: "adapter.babylon.mesh", kind: "adapter", target: "web", name: "Babylon.Mesh", signature: "rotate/set/show/hide", version: "0.1", events: ["click"] },
    { id: "adapter.babylon.light", kind: "adapter", target: "web", name: "Babylon.Light", signature: "on/off/switch/set_intensity", version: "0.1" },
    { id: "adapter.babylon.camera", kind: "adapter", target: "web", name: "Babylon.Camera", signature: "set_position/look_at", version: "0.1" },
    { id: "adapter.maplibre.map", kind: "adapter", target: "web", name: "MapLibre.Map", signature: "set_center/fly_to/set_zoom/zoom_in/zoom_out/set_style", version: "0.1", events: ["load", "click", "move_end"] },
    { id: "adapter.maplibre.marker", kind: "adapter", target: "web", name: "MapLibre.Marker", signature: "show/hide/highlight/unhighlight/set_label", version: "0.1", events: ["click"] },
    { id: "adapter.maplibre.layer", kind: "adapter", target: "web", name: "MapLibre.Layer", signature: "show/hide/set_color/set_radius/set_opacity", version: "0.1" }
  ];
  var BDS_CAPABILITIES = [
    ...RUNTIME_CAPABILITIES,
    ...BUILTIN_CAPABILITIES,
    ...ADAPTER_CAPABILITIES
  ];
  function capabilitiesForTarget(target) {
    return BDS_CAPABILITIES.filter((entry) => entry.target === target || entry.target === "portable");
  }

  // src/strict-compile.ts
  var StrictCompileError = class extends Error {
    diagnostics;
    constructor(diagnostics) {
      super(`\u4E25\u683C\u7F16\u8BD1\u5931\u8D25: ${diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`);
      this.name = "StrictCompileError";
      this.diagnostics = diagnostics;
    }
  };
  function compileStrict(source, options = {}) {
    const sourceName = options.sourceName ?? "source.bds";
    const ast = parse(tokenize(source));
    const symbols = analyzeProgram(ast);
    const types = checkProgram(ast);
    const { code, mappings } = generateWithMap(ast, { emitTypes: options.emitTypes });
    const sourceMap = generateSourceMap({
      file: sourceName.replace(/\.bds$/, ".ts"),
      source: sourceName,
      sourceContent: source,
      mappings
    });
    const capabilities = usedCapabilities(symbols, ast);
    const diagnostics = strictDiagnostics(symbols, types, capabilities, options);
    const result = {
      typescript: code,
      sourceMap,
      ast,
      symbols,
      types,
      nodeNames: symbols.sceneNodes,
      capabilities,
      diagnostics
    };
    if (diagnostics.length > 0) throw new StrictCompileError(diagnostics);
    return result;
  }
  function strictDiagnostics(symbols, types, capabilities, options) {
    const diagnostics = [];
    const manifest = options.nodeNames;
    const requireManifest = options.requireNodeManifest !== false;
    const allowed = /* @__PURE__ */ new Set();
    if (manifest !== void 0) {
      for (const name of manifest) {
        if (typeof name !== "string" || name.length === 0) {
          diagnostics.push({ code: "BDS-STRICT-002", severity: "error", message: "nodeNames \u6E05\u5355\u53EA\u80FD\u5305\u542B\u975E\u7A7A\u5B57\u7B26\u4E32" });
        } else if (allowed.has(name)) {
          diagnostics.push({ code: "BDS-STRICT-002", severity: "error", message: `nodeNames \u6E05\u5355\u4E2D\u91CD\u590D\u8282\u70B9\u300C${name}\u300D`, name });
        } else {
          allowed.add(name);
        }
      }
    }
    for (const name of symbols.sceneNodes) {
      const reference = symbols.references.find((item) => item.root === name);
      if (manifest === void 0 && requireManifest) {
        diagnostics.push({
          code: "BDS-STRICT-001",
          severity: "error",
          message: `\u4E25\u683C\u6A21\u5F0F\u8981\u6C42\u663E\u5F0F nodeNames \u6E05\u5355\uFF0C\u672A\u58F0\u660E\u573A\u666F\u8282\u70B9\u300C${name}\u300D`,
          name,
          line: reference?.line
        });
      } else if (manifest !== void 0 && !allowed.has(name)) {
        diagnostics.push({
          code: "BDS-STRICT-001",
          severity: "error",
          message: `\u573A\u666F\u8282\u70B9\u300C${name}\u300D\u4E0D\u5728 nodeNames \u6E05\u5355\u4E2D`,
          name,
          line: reference?.line
        });
      }
    }
    for (const diagnostic of types.diagnostics) {
      if (diagnostic.severity === "error") {
        diagnostics.push({ code: "BDS-STRICT-003", severity: "error", message: diagnostic.message, line: diagnostic.line });
      }
    }
    if (options.target) {
      const allowedCapabilities = new Set(capabilitiesForTarget(options.target).map((entry) => entry.id));
      for (const capability of capabilities) {
        if (!allowedCapabilities.has(capability.id)) {
          diagnostics.push({
            code: "BDS-STRICT-004",
            severity: "error",
            message: `\u80FD\u529B\u300C${capability.id}\u300D\u4E0D\u5C5E\u4E8E target\u300C${options.target}\u300D`,
            name: capability.name
          });
        }
      }
    }
    return diagnostics.sort((a, b) => {
      const left = `${a.line ?? Number.MAX_SAFE_INTEGER}:${a.code}:${a.name ?? ""}:${a.message}`;
      const right = `${b.line ?? Number.MAX_SAFE_INTEGER}:${b.code}:${b.name ?? ""}:${b.message}`;
      return left.localeCompare(right);
    });
  }
  function usedCapabilities(symbols, program) {
    const used = /* @__PURE__ */ new Map();
    const add = (kind, name) => {
      const capability = BDS_CAPABILITIES.find((entry) => entry.kind === kind && entry.name === name);
      if (capability) used.set(capability.id, capability);
    };
    for (const reference of symbols.references) {
      if (reference.kind !== "runtime" && reference.kind !== "builtin") continue;
      add(reference.kind, reference.root);
    }
    const visitBlock = (block) => {
      for (const stmt of block.body) visitStmt(stmt);
    };
    const visitStmt = (stmt) => {
      switch (stmt.kind) {
        case "BindStmt":
          add("runtime", "bind");
          return;
        case "WatchStmt":
          add("runtime", "watch");
          visitBlock(stmt.body);
          return;
        case "EveryFrame":
          add("runtime", "onFrame");
          visitBlock(stmt.body);
          return;
        case "When":
          add("runtime", "on");
          visitBlock(stmt.body);
          return;
        case "Animate":
          add("runtime", stmt.target.kind === "MemberAccess" ? "animate" : "animateTo");
          return;
        case "If":
          visitBlock(stmt.thenBlock);
          if (stmt.elseBlock) visitBlock(stmt.elseBlock);
          return;
        case "Repeat":
          visitBlock(stmt.body);
          return;
        case "FuncDef":
          visitBlock(stmt.body);
          return;
        case "ForIn":
          visitBlock(stmt.body);
          return;
        default:
          return;
      }
    };
    for (const stmt of program.body) visitStmt(stmt);
    return Array.from(used.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  // src/editor/compiler-browser.ts
  function compile(source, sourceName = "source.bds", options = {}) {
    const tokens = tokenize(source);
    const ast = parse(tokens);
    const { code, mappings } = generateWithMap(ast, options);
    const sourceMap = generateSourceMap({
      file: sourceName.replace(/\.bds$/, ".ts"),
      source: sourceName,
      sourceContent: source,
      mappings
    });
    return { typescript: code, sourceMap };
  }
  return __toCommonJS(compiler_browser_exports);
})();
