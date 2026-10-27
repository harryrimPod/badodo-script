"use strict";
var Badodo = (() => {
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

  // src/runtime/browser.ts
  var browser_exports = {};
  __export(browser_exports, {
    BadodoRuntime: () => BadodoRuntime,
    RUNTIME_PROGRAM_VERSION: () => RUNTIME_PROGRAM_VERSION,
    RuntimeExecutionError: () => RuntimeExecutionError,
    assertRuntimeProgram: () => assertRuntimeProgram,
    bridgeMapEvents: () => bridgeMapEvents,
    bridgeMarkerClick: () => bridgeMarkerClick,
    bridgeMeshClick: () => bridgeMeshClick,
    compileRuntime: () => compileRuntime,
    createCameraNode: () => createCameraNode,
    createCircleLayerNode: () => createCircleLayerNode,
    createLayerNode: () => createLayerNode,
    createLightNode: () => createLightNode,
    createMapNode: () => createMapNode,
    createMarkerNode: () => createMarkerNode,
    createMeshNode: () => createMeshNode,
    decryptPayload: () => decryptPayload,
    err: () => err,
    is_ok: () => is_ok,
    loadEncrypted: () => loadEncrypted,
    loadSignedEncrypted: () => loadSignedEncrypted,
    none: () => none,
    ok: () => ok,
    runEncrypted: () => runEncrypted,
    runSignedEncrypted: () => runSignedEncrypted,
    some: () => some,
    unwrap: () => unwrap,
    verifySignedArtifactBrowser: () => verifySignedArtifactBrowser,
    verifySignedArtifactBrowserWithKeyring: () => verifySignedArtifactBrowserWithKeyring
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
    return Object.prototype.hasOwnProperty.call(KEYWORDS, name) ? KEYWORDS[name] : "IDENT" /* IDENT */;
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
      const endLine = this.line;
      const endCol = this.col;
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
        return { ...this.makeToken("INDENT" /* INDENT */, ""), indent: { expected: currentIndent, actual: indent } };
      }
      if (indent < currentIndent) {
        const dedents = [];
        const validLevels = [...this.indentStack];
        while (indent < this.indentStack[this.indentStack.length - 1]) {
          this.indentStack.pop();
          dedents.push(this.makeToken("DEDENT" /* DEDENT */, ""));
        }
        if (indent !== this.indentStack[this.indentStack.length - 1]) {
          throw new LexerError(
            `\u7F29\u8FDB\u4E0D\u4E00\u81F4\uFF1A\u8FD9\u4E00\u884C\u5E94\u4E3A ${formatIndentLevels(validLevels)} \u4E2A\u7A7A\u683C\uFF0C\u5B9E\u9645 ${indent} \u4E2A\u7A7A\u683C\u3002\u8BF7\u8BA9\u5B83\u548C\u4E0A\u9762\u67D0\u4E00\u5C42\u4EE3\u7801\u5BF9\u9F50`,
            this.line,
            this.col
          );
        }
        if (dedents.length > 0) {
          this.pendingTokens.push(...dedents.slice(1));
          return dedents[0];
        }
      }
      return this.makeToken("NEWLINE" /* NEWLINE */, "", endLine, endCol);
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
  function formatIndentLevels(levels) {
    const unique = [...new Set(levels)].sort((a, b) => a - b);
    if (unique.length <= 1) return String(unique[0] ?? 0);
    return `${unique.slice(0, -1).join("\u3001")} \u6216 ${unique[unique.length - 1]}`;
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
        this.consume("DEDENT" /* DEDENT */, "\u4EE3\u7801\u5757\u9700\u8981\u5728\u8FD9\u91CC\u7ED3\u675F\uFF1A\u8BF7\u628A\u4E0B\u4E00\u884C\u7684\u7F29\u8FDB\u9000\u56DE\u5230\u4E0A\u4E00\u5C42");
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
          throw new ParseError(describeUnexpectedToken(token), token);
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
  function describeUnexpectedToken(token) {
    switch (token.type) {
      case "INDENT" /* INDENT */: {
        const widths = token.indent ? `\u5E94\u4E3A ${token.indent.expected} \u4E2A\u7A7A\u683C\uFF0C\u5B9E\u9645 ${token.indent.actual} \u4E2A\u7A7A\u683C\u3002` : "";
        return `\u8FD9\u4E00\u884C\u7684\u7F29\u8FDB\u6BD4\u4E0A\u4E00\u884C\u591A\uFF1A${widths}\u53EA\u6709\u4EE5\u5192\u53F7 : \u7ED3\u5C3E\u7684\u884C\uFF08\u4F8B\u5982 if\u3001when\u3001func\uFF09\u540E\u9762\u624D\u80FD\u589E\u52A0\u7F29\u8FDB`;
      }
      case "DEDENT" /* DEDENT */:
        return "\u4EE3\u7801\u5757\u5728\u8FD9\u91CC\u7ED3\u675F\u4E86\uFF0C\u4F46\u4E0A\u4E00\u884C\u8FD8\u6CA1\u6709\u5199\u5B8C\u3002\u8BF7\u68C0\u67E5\u4E0A\u4E00\u884C\u662F\u5426\u7F3A\u5C11\u5185\u5BB9";
      case "NEWLINE" /* NEWLINE */:
        return "\u8FD9\u4E00\u884C\u5728\u8FD9\u91CC\u63D0\u524D\u7ED3\u675F\u4E86\uFF08\u884C\u5C3E\uFF09\uFF0C\u540E\u9762\u8FD8\u9700\u8981\u4E00\u4E2A\u503C\u3002\u53EF\u4EE5\u5199\u6570\u5B57\u3001\u6587\u672C\u3001true/false\uFF0C\u6216\u8005\u4E00\u4E2A\u540D\u5B57";
      case "EOF" /* EOF */:
        return "\u4EE3\u7801\u5728\u8FD9\u91CC\u7ED3\u675F\u4E86\uFF08\u6587\u4EF6\u7ED3\u5C3E\uFF09\uFF0C\u540E\u9762\u8FD8\u9700\u8981\u4E00\u4E2A\u503C\u3002\u53EF\u4EE5\u5199\u6570\u5B57\u3001\u6587\u672C\u3001true/false\uFF0C\u6216\u8005\u4E00\u4E2A\u540D\u5B57";
      default:
        return token.value ? `\u8FD9\u91CC\u65E0\u6CD5\u7406\u89E3\u300C${token.value}\u300D\u3002\u53EF\u4EE5\u5199\u6570\u5B57\u3001\u6587\u672C\u3001true/false\uFF0C\u6216\u8005\u4E00\u4E2A\u540D\u5B57` : "\u8FD9\u91CC\u65E0\u6CD5\u7406\u89E3\u3002\u53EF\u4EE5\u5199\u6570\u5B57\u3001\u6587\u672C\u3001true/false\uFF0C\u6216\u8005\u4E00\u4E2A\u540D\u5B57";
    }
  }

  // src/runtime/collect-nodes.ts
  var RESERVED = /* @__PURE__ */ new Set(["time", "value", "delta", "vec3", "color", "some", "none", "ok", "err", "is_ok", "unwrap"]);
  function collectNodes(program) {
    const locals = /* @__PURE__ */ new Set();
    const nodes = /* @__PURE__ */ new Set();
    for (const stmt of program.body) {
      collectLocals(stmt, locals);
    }
    for (const stmt of program.body) {
      collectRefs(stmt, locals, nodes);
    }
    return Array.from(nodes).sort();
  }
  function collectLocals(stmt, locals) {
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
  function collectExprLocals(expr, locals) {
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
  function collectRefs(stmt, locals, nodes) {
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
  function collectExprRefs(expr, locals, nodes) {
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

  // src/runtime/errors.ts
  var RuntimeExecutionError = class extends Error {
    code;
    line;
    constructor(code, message, line, cause) {
      super(message, cause === void 0 ? void 0 : { cause });
      this.name = "RuntimeExecutionError";
      this.code = code;
      this.line = line;
    }
  };
  function asRuntimeHostFailure(error, operation, line) {
    if (error instanceof RuntimeExecutionError) return error;
    const message = error instanceof Error ? error.message : String(error);
    return new RuntimeExecutionError("RUNTIME_HOST_FAILURE", `${operation} \u5931\u8D25: ${message}`, line, error);
  }

  // src/runtime/program.ts
  var RUNTIME_PROGRAM_VERSION = 1;
  var UNSAFE_NAMES = /* @__PURE__ */ new Set([
    "__proto__",
    "prototype",
    "constructor",
    "globalThis",
    "process",
    "require",
    "module",
    "Function",
    "eval",
    "window",
    "document"
  ]);
  var AST_KINDS = /* @__PURE__ */ new Set([
    "Program",
    "Block",
    "VarDecl",
    "Assign",
    "If",
    "Repeat",
    "FuncDef",
    "Return",
    "When",
    "BindStmt",
    "WatchStmt",
    "EveryFrame",
    "Animate",
    "ForIn",
    "SharedDecl",
    "TypeDecl",
    "EnumDecl",
    "ImportDecl",
    "ExpressionStmt",
    "TypeRef",
    "Call",
    "MemberAccess",
    "IndexAccess",
    "ArrayLiteral",
    "MapLiteral",
    "AwaitExpr",
    "Identifier",
    "BinaryOp",
    "UnaryOp",
    "Literal"
  ]);
  function compileRuntime(source, sourceName = "source.bds") {
    const ast = parse(tokenize(source));
    const program = {
      kind: "RuntimeProgram",
      version: RUNTIME_PROGRAM_VERSION,
      sourceName,
      nodeNames: collectNodes(ast),
      ast
    };
    const validation = validateRuntimeProgram(program);
    if (!validation.valid) {
      const code = validation.errors.some((error) => error.includes("\u4E0D\u5B89\u5168\u540D\u79F0") || error.includes("nodeNames")) ? "RUNTIME_UNSUPPORTED_OPERATION" : "RUNTIME_PROGRAM_INVALID";
      throw new RuntimeExecutionError(code, validation.errors.join("; "));
    }
    return deepFreeze(program);
  }
  function validateRuntimeProgram(value) {
    const errors = [];
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { valid: false, errors: ["RuntimeProgram \u5FC5\u987B\u662F object"] };
    }
    const object = value;
    if (object.kind !== "RuntimeProgram") errors.push("kind \u5FC5\u987B\u662F RuntimeProgram");
    if (object.version !== RUNTIME_PROGRAM_VERSION) errors.push(`\u4E0D\u652F\u6301\u7684 RuntimeProgram version: ${String(object.version)}`);
    if (typeof object.sourceName !== "string" || object.sourceName.length === 0) errors.push("sourceName \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32");
    if (!Array.isArray(object.nodeNames) || object.nodeNames.some((name) => typeof name !== "string" || name.length === 0 || UNSAFE_NAMES.has(name))) {
      errors.push("nodeNames \u5FC5\u987B\u662F\u5B89\u5168\u7684\u975E\u7A7A\u5B57\u7B26\u4E32\u6570\u7EC4");
    } else if (new Set(object.nodeNames).size !== object.nodeNames.length) {
      errors.push("nodeNames \u4E0D\u80FD\u91CD\u590D");
    }
    if (!isRecord(object.ast) || object.ast.kind !== "Program" || !Array.isArray(object.ast.body)) {
      errors.push("ast \u5FC5\u987B\u662F canonical Program");
    } else {
      walkAst(object.ast, "$.ast", errors);
    }
    return { valid: errors.length === 0, errors };
  }
  function assertRuntimeProgram(value) {
    const result = validateRuntimeProgram(value);
    if (!result.valid) throw new RuntimeExecutionError("RUNTIME_PROGRAM_INVALID", result.errors.join("; "));
    return value;
  }
  function isUnsafeRuntimeName(name) {
    return UNSAFE_NAMES.has(name);
  }
  function walkAst(value, path, errors) {
    if (typeof value === "function") {
      errors.push(`${path} \u4E0D\u80FD\u5305\u542B\u51FD\u6570`);
      return;
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) walkAst(value[i], `${path}[${i}]`, errors);
      return;
    }
    if (!isRecord(value)) return;
    if (typeof value.kind === "string" && !AST_KINDS.has(value.kind)) {
      errors.push(`${path}.kind \u4F7F\u7528\u4E86\u4E0D\u652F\u6301\u7684 AST \u8282\u70B9\u7C7B\u578B\u300C${value.kind}\u300D`);
    }
    for (const [key, child] of Object.entries(value)) {
      if ((key === "name" || key === "member" || key === "key") && typeof child === "string" && isUnsafeRuntimeName(child)) {
        errors.push(`${path}.${key} \u4F7F\u7528\u4E86\u4E0D\u5B89\u5168\u540D\u79F0\u300C${child}\u300D`);
      }
      walkAst(child, `${path}.${key}`, errors);
    }
  }
  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function deepFreeze(value) {
    if (value === null || typeof value !== "object") return value;
    if (Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
    return value;
  }

  // src/payload.ts
  var BDS_PAYLOAD_VERSION = 1;
  var PayloadValidationErrorException = class extends Error {
    errors;
    constructor(errors) {
      super(`BDS payload \u6821\u9A8C\u5931\u8D25: ${errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
      this.name = "PayloadValidationErrorException";
      this.errors = errors;
    }
  };
  function validateBdsPayload(value, expectedVersion = BDS_PAYLOAD_VERSION) {
    const errors = [];
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { valid: false, errors: [{ path: "$", keyword: "type", message: "payload \u5FC5\u987B\u662F object" }] };
    }
    const object = value;
    const required = ["version", "nodeNames", "code"];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(object, key)) {
        errors.push({ path: `$.${key}`, keyword: "required", message: "\u5B57\u6BB5\u7F3A\u5931" });
      }
    }
    for (const key of Object.keys(object).sort()) {
      if (!required.includes(key) && key !== "runtimeProgram") {
        errors.push({ path: `$.${key}`, keyword: "additionalProperties", message: "\u4E0D\u5141\u8BB8\u989D\u5916\u5B57\u6BB5" });
      }
    }
    if (Object.prototype.hasOwnProperty.call(object, "version")) {
      if (typeof object.version !== "number" || !Number.isInteger(object.version)) {
        errors.push({ path: "$.version", keyword: "type", message: "version \u5FC5\u987B\u662F\u6574\u6570" });
      } else if (object.version !== expectedVersion) {
        errors.push({ path: "$.version", keyword: "version", message: `\u4E0D\u652F\u6301\u7684 payload version: ${object.version}` });
      }
    }
    if (Object.prototype.hasOwnProperty.call(object, "nodeNames")) {
      if (!Array.isArray(object.nodeNames)) {
        errors.push({ path: "$.nodeNames", keyword: "type", message: "nodeNames \u5FC5\u987B\u662F\u6570\u7EC4" });
      } else {
        const seen = /* @__PURE__ */ new Set();
        for (let index = 0; index < object.nodeNames.length; index++) {
          const name = object.nodeNames[index];
          const path = `$.nodeNames[${index}]`;
          if (typeof name !== "string") {
            errors.push({ path, keyword: "string", message: "\u8282\u70B9\u540D\u5FC5\u987B\u662F\u5B57\u7B26\u4E32" });
            continue;
          }
          if (name.length === 0) errors.push({ path, keyword: "string", message: "\u8282\u70B9\u540D\u4E0D\u80FD\u4E3A\u7A7A" });
          if (seen.has(name)) errors.push({ path, keyword: "duplicate", message: `\u8282\u70B9\u540D\u91CD\u590D: ${name}` });
          seen.add(name);
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(object, "code") && typeof object.code !== "string") {
      errors.push({ path: "$.code", keyword: "type", message: "code \u5FC5\u987B\u662F\u5B57\u7B26\u4E32" });
    }
    if (Object.prototype.hasOwnProperty.call(object, "runtimeProgram")) {
      const runtimeValidation = validateRuntimeProgram(object.runtimeProgram);
      if (!runtimeValidation.valid) {
        for (const message of runtimeValidation.errors) {
          errors.push({ path: "$.runtimeProgram", keyword: "type", message });
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }
  function assertBdsPayload(value, expectedVersion = BDS_PAYLOAD_VERSION) {
    const result = validateBdsPayload(value, expectedVersion);
    if (!result.valid) throw new PayloadValidationErrorException(result.errors);
    return value;
  }

  // src/runtime/signed.ts
  var LICENSE_FORMAT = "BDS-LICENSE-1";
  var ARTIFACT_FORMAT = "BDS-SIGNED-1";
  var ALGORITHM = "Ed25519";
  var VERSION = 1;
  async function verifySignedArtifactBrowser(input, publicKeyPem, now = /* @__PURE__ */ new Date(), requiredFeature) {
    const artifact = assertArtifact(input);
    const publicKeyDer = pemToDer(publicKeyPem, "PUBLIC KEY");
    const publicKey = await crypto.subtle.importKey("spki", asArrayBuffer(publicKeyDer), { name: ALGORITHM }, false, ["verify"]);
    const keyId = await publicKeyId(publicKeyDer);
    if (artifact.keyId !== keyId || artifact.license.claims.keyId !== keyId) throw new Error("artifact keyId \u4E0E\u9A8C\u8BC1\u516C\u94A5\u4E0D\u5339\u914D");
    const claims = normalizeClaims(artifact.license.claims);
    const licenseSignatureValid = await crypto.subtle.verify(
      { name: ALGORITHM },
      publicKey,
      asArrayBuffer(decodeBase64Url(artifact.license.signature)),
      asArrayBuffer(textBytes(`BDS-LICENSE-SIGNATURE
${canonicalJson(claims)}`))
    );
    if (!licenseSignatureValid) throw new Error("license \u7B7E\u540D\u6821\u9A8C\u5931\u8D25");
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) throw new Error("\u9A8C\u8BC1\u65F6\u95F4\u65E0\u6548");
    if (nowMs < Date.parse(claims.issuedAt)) throw new Error("license \u5C1A\u672A\u751F\u6548");
    if (nowMs > Date.parse(claims.expiresAt)) throw new Error("license \u5DF2\u8FC7\u671F");
    if (requiredFeature !== void 0 && !claims.features.includes(requiredFeature)) throw new Error(`license \u7F3A\u5C11 feature: ${requiredFeature}`);
    const payload = decodeBase64(artifact.payload);
    if (await sha256(payload) !== artifact.payloadSha256) throw new Error("artifact payload hash \u6821\u9A8C\u5931\u8D25");
    const unsigned = { ...artifact };
    delete unsigned.signature;
    const artifactSignatureValid = await crypto.subtle.verify(
      { name: ALGORITHM },
      publicKey,
      asArrayBuffer(decodeBase64Url(artifact.signature)),
      asArrayBuffer(textBytes(`BDS-ARTIFACT-SIGNATURE
${canonicalJson(unsigned)}`))
    );
    if (!artifactSignatureValid) throw new Error("artifact \u7B7E\u540D\u6821\u9A8C\u5931\u8D25");
    return { payload: asArrayBuffer(payload), license: claims };
  }
  async function verifySignedArtifactBrowserWithKeyring(input, publicKeys, revocations, now = /* @__PURE__ */ new Date(), requiredFeature) {
    const artifact = assertArtifact(input);
    const publicKeyPem = publicKeys[artifact.keyId];
    if (!publicKeyPem) throw new Error(`\u672A\u77E5\u6216\u5DF2\u8F6E\u6362\u7684 license keyId: ${artifact.keyId}`);
    const result = await verifySignedArtifactBrowser(artifact, publicKeyPem, now, requiredFeature);
    if (revocations) {
      if (revocations.version !== 1) throw new Error("revocation list \u683C\u5F0F\u65E0\u6548");
      if (revocations.revokedKeyIds.includes(artifact.keyId)) throw new Error("artifact \u7B7E\u53D1\u5BC6\u94A5\u5DF2\u540A\u9500");
      if (revocations.revokedSubjects.includes(result.license.subject)) throw new Error("artifact license subject \u5DF2\u540A\u9500");
      if (revocations.revokedArtifacts.includes(artifact.payloadSha256)) throw new Error("artifact \u5DF2\u540A\u9500");
    }
    return { ...result, keyId: artifact.keyId };
  }
  function assertArtifact(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("signed artifact \u5FC5\u987B\u662F object");
    const object = value;
    exactKeys(object, ["algorithm", "format", "keyId", "license", "payload", "payloadSha256", "signature"]);
    if (object.format !== ARTIFACT_FORMAT || object.algorithm !== ALGORITHM) throw new Error("\u4E0D\u652F\u6301\u7684 artifact format/algorithm");
    if (typeof object.keyId !== "string" || typeof object.payload !== "string" || typeof object.payloadSha256 !== "string" || typeof object.signature !== "string") throw new Error("signed artifact \u5B57\u6BB5\u65E0\u6548");
    if (!/^[0-9a-f]{64}$/.test(object.payloadSha256)) throw new Error("payloadSha256 \u65E0\u6548");
    assertLicense(object.license);
    decodeBase64(object.payload);
    decodeBase64Url(object.signature);
    return object;
  }
  function assertLicense(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("license envelope \u5FC5\u987B\u662F object");
    const object = value;
    exactKeys(object, ["algorithm", "claims", "format", "signature"]);
    if (object.format !== LICENSE_FORMAT || object.algorithm !== ALGORITHM || typeof object.signature !== "string") throw new Error("license envelope \u65E0\u6548");
  }
  function normalizeClaims(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("license claims \u5FC5\u987B\u662F object");
    const object = value;
    exactKeys(object, ["expiresAt", "features", "issuedAt", "keyId", "subject", "version"]);
    if (object.version !== VERSION || typeof object.keyId !== "string" || !object.keyId || typeof object.subject !== "string" || !object.subject.trim()) throw new Error("license claims \u65E0\u6548");
    const issuedAt = normalizeDate(object.issuedAt);
    const expiresAt = normalizeDate(object.expiresAt);
    if (Date.parse(expiresAt) <= Date.parse(issuedAt)) throw new Error("license expiresAt \u5FC5\u987B\u665A\u4E8E issuedAt");
    if (!Array.isArray(object.features) || object.features.some((feature) => typeof feature !== "string" || !feature.trim())) throw new Error("license features \u65E0\u6548");
    const features = [...new Set(object.features.map((feature) => feature.trim()))].sort();
    return { version: VERSION, keyId: object.keyId, subject: object.subject.trim(), issuedAt, expiresAt, features };
  }
  function normalizeDate(value) {
    const date = typeof value === "string" ? new Date(value) : /* @__PURE__ */ new Date(NaN);
    if (!Number.isFinite(date.getTime())) throw new Error("license \u65E5\u671F\u65E0\u6548");
    return date.toISOString();
  }
  function exactKeys(object, expected) {
    const actual = Object.keys(object).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error("signed artifact \u5305\u542B\u672A\u77E5\u6216\u7F3A\u5931\u5B57\u6BB5");
  }
  function pemToDer(pem, label) {
    if (typeof pem !== "string") throw new Error("\u516C\u94A5 PEM \u65E0\u6548");
    const body = pem.replace(`-----BEGIN ${label}-----`, "").replace(`-----END ${label}-----`, "").replace(/\s+/g, "");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) throw new Error("\u516C\u94A5 PEM \u65E0\u6548");
    return decodeBase64(body);
  }
  function decodeBase64(value) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("base64 payload \u65E0\u6548");
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  function decodeBase64Url(value) {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("base64url \u7B7E\u540D\u65E0\u6548");
    return decodeBase64(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  }
  async function publicKeyId(der) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", asArrayBuffer(der)));
    return `ed25519-${[...digest].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  async function sha256(value) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", asArrayBuffer(value)));
    return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function textBytes(value) {
    return new TextEncoder().encode(value);
  }
  function asArrayBuffer(value) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return copy.buffer;
  }
  function canonicalJson(value) {
    if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("canonical JSON \u4E0D\u652F\u6301\u975E\u6709\u9650\u6570\u5B57");
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (typeof value === "object") {
      const object = value;
      return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
    }
    throw new Error("canonical JSON \u4E0D\u652F\u6301\u8BE5\u503C");
  }

  // src/scope.ts
  var REASSIGNABLE = /* @__PURE__ */ new Set(["variable", "parameter", "loop-item", "implicit"]);
  function resolveScopes(program) {
    const reassignments = /* @__PURE__ */ new WeakSet();
    const reassignedLoops = /* @__PURE__ */ new WeakSet();
    const loopOwners = /* @__PURE__ */ new WeakMap();
    const lookupAssignable = (scope, name) => {
      let current = scope;
      while (current) {
        const kind = current.bindings.get(name);
        if (kind !== void 0) return REASSIGNABLE.has(kind) ? current : void 0;
        if (current.kind === "function" || current.kind === "program") return void 0;
        current = current.parent;
      }
      return void 0;
    };
    const block = (parent, statements, implicit) => {
      const scope = { kind: "block", bindings: /* @__PURE__ */ new Map(), parent };
      if (implicit) scope.bindings.set(implicit, "implicit");
      visitAll(statements, scope);
    };
    const visitAll = (statements, scope) => {
      for (const statement of statements) {
        if (statement.kind === "FuncDef") scope.bindings.set(statement.name, "function");
      }
      for (const statement of statements) visit(statement, scope);
    };
    const visit = (statement, scope) => {
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
          const fn = { kind: "function", bindings: /* @__PURE__ */ new Map(), parent: scope };
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
          const loopScope = { kind: "block", bindings: /* @__PURE__ */ new Map([[statement.item, "loop-item"]]), parent: scope };
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
    visitAll(program.body, { kind: "program", bindings: /* @__PURE__ */ new Map() });
    return {
      isReassignment: (statement) => reassignments.has(statement),
      isLoopItemReassigned: (statement) => reassignedLoops.has(statement)
    };
  }

  // src/runtime/executor.ts
  var DEFAULT_RUNTIME_LIMITS = Object.freeze({
    maxSteps: 1e4,
    maxLoopIterations: 1e3,
    maxCallDepth: 64
  });
  var Environment = class {
    constructor(parent) {
      this.parent = parent;
    }
    parent;
    values = /* @__PURE__ */ new Map();
    define(name, value) {
      this.values.set(name, value);
    }
    hasLocal(name) {
      return this.values.has(name);
    }
    lookup(name) {
      if (this.values.has(name)) return this.values.get(name);
      return this.parent?.lookup(name);
    }
    has(name) {
      return this.values.has(name) || Boolean(this.parent?.has(name));
    }
    assign(name, value) {
      if (this.values.has(name)) {
        this.values.set(name, value);
        return;
      }
      if (this.parent?.has(name)) {
        this.parent.assign(name, value);
        return;
      }
      throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `\u53D8\u91CF\u300C${name}\u300D\u5C1A\u672A\u58F0\u660E`);
    }
  };
  var ReturnSignal = class {
    constructor(value) {
      this.value = value;
    }
    value;
  };
  var RuntimeExecutor = class {
    limits;
    /**
     * `VarDecl` nodes that assign an existing binding (docs/spec.md 5.1.1),
     * collected per executed program. Keyed by node identity, so programs run
     * by the same executor never affect each other.
     */
    reassignments = /* @__PURE__ */ new WeakSet();
    resolvedPrograms = /* @__PURE__ */ new WeakSet();
    constructor(limits = {}) {
      this.limits = normalizeLimits(limits);
    }
    execute(programInput, host) {
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
    resolveProgramScopes(ast) {
      if (this.resolvedPrograms.has(ast)) return;
      const resolution = resolveScopes(ast);
      const collect = (statements) => {
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
    newState() {
      return { limits: this.limits, steps: 0, loopIterations: 0, callDepth: 0 };
    }
    assertExecutableProgram(program, state) {
      void state;
      if (program.ast.body.some((statement) => statement.kind === "ImportDecl")) {
        throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", "\u8FD0\u884C\u65F6\u4E0D\u80FD\u76F4\u63A5\u6267\u884C\u5305\u542B import \u7684 BDS\uFF1B\u8BF7\u5148\u7531 bundler \u5904\u7406\u6A21\u5757");
      }
      for (const name of program.nodeNames) {
        if (isUnsafeRuntimeName(name)) {
          throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `\u8282\u70B9\u540D\u79F0\u300C${name}\u300D\u88AB\u8FD0\u884C\u65F6\u5B89\u5168\u7B56\u7565\u62D2\u7EDD`);
        }
      }
    }
    installBuiltins(environment) {
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
        return isRecord2(value) && value.ok === true;
      }));
      environment.define("unwrap", callable("unwrap", (args) => {
        requireArity("unwrap", args, 1);
        const value = args[0];
        if (!isRecord2(value) || value.ok !== true) {
          throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `Result unwrap \u5931\u8D25: ${String(isRecord2(value) ? value.error : value)}`);
        }
        return value.value;
      }));
      environment.define("time", 0);
      environment.define("delta", 0);
      environment.define("value", void 0);
    }
    predeclareFunctions(statements, environment, state) {
      for (const statement of statements) {
        if (statement.kind !== "FuncDef" || environment.hasLocal(statement.name)) continue;
        environment.define(statement.name, this.makeFunction(statement, environment, state));
      }
    }
    makeFunction(definition, closure, _definitionState) {
      return callable(definition.name, (args, state, host) => {
        if (definition.async) {
          throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `\u8FD0\u884C\u65F6\u6682\u4E0D\u652F\u6301 async func\u300C${definition.name}\u300D\u7684\u5F02\u6B65\u6267\u884C`, definition.line);
        }
        if (state.callDepth >= state.limits.maxCallDepth) {
          throw new RuntimeExecutionError("RUNTIME_CALL_DEPTH_LIMIT", `\u51FD\u6570\u8C03\u7528\u6DF1\u5EA6\u8D85\u8FC7 ${state.limits.maxCallDepth}`, definition.line);
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
          return void 0;
        } finally {
          state.callDepth -= 1;
        }
      });
    }
    executeStatements(statements, environment, state, host) {
      for (const statement of statements) {
        this.step(state, statement.line);
        this.executeStatement(statement, environment, state, host);
      }
    }
    executeStatement(statement, environment, state, host) {
      switch (statement.kind) {
        case "SharedDecl":
        case "TypeDecl":
        case "FuncDef":
          return;
        case "EnumDecl": {
          const values = /* @__PURE__ */ Object.create(null);
          for (const value of statement.values) values[value] = value;
          environment.define(statement.name, Object.freeze(values));
          return;
        }
        case "ImportDecl":
          throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", "\u8FD0\u884C\u65F6\u4E0D\u80FD\u6267\u884C import", statement.line);
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
          throw new ReturnSignal(statement.value ? this.evaluate(statement.value, environment, state, host, statement.line) : void 0);
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
            throw asRuntimeHostFailure(error, "\u6CE8\u518C\u4E8B\u4EF6", statement.line);
          }
          return;
        }
        case "BindStmt": {
          const target = this.requireNode(this.evaluate(statement.target.object, environment, state, host, statement.line), statement.line);
          const getter = () => this.evaluateCallback(statement.source, environment, host, "bind");
          try {
            host.registerBinding(getter, target, statement.target.member);
          } catch (error) {
            throw asRuntimeHostFailure(error, "\u6CE8\u518C\u7ED1\u5B9A", statement.line);
          }
          return;
        }
        case "WatchStmt": {
          const getter = () => this.evaluateCallback(statement.source, environment, host, "watch");
          const handler = (value) => {
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
            throw asRuntimeHostFailure(error, "\u6CE8\u518C\u76D1\u542C", statement.line);
          }
          return;
        }
        case "EveryFrame": {
          const handler = (time, delta) => {
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
            throw asRuntimeHostFailure(error, "\u6CE8\u518C\u5E27\u5904\u7406\u5668", statement.line);
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
            throw asRuntimeHostFailure(error, "\u6CE8\u518C\u52A8\u753B", statement.line);
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
    executeBlock(block, parent, state, host) {
      const environment = new Environment(parent);
      this.predeclareFunctions(block.body, environment, state);
      this.executeStatements(block.body, environment, state, host);
    }
    assign(target, value, environment, state, host, line) {
      if (target.kind === "Identifier") {
        if (isUnsafeRuntimeName(target.name)) throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `\u540D\u79F0\u300C${target.name}\u300D\u88AB\u8FD0\u884C\u65F6\u5B89\u5168\u7B56\u7565\u62D2\u7EDD`, line);
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
      throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", "\u8BE5\u8868\u8FBE\u5F0F\u4E0D\u80FD\u4F5C\u4E3A\u8D4B\u503C\u76EE\u6807", line);
    }
    evaluateCallback(expression, environment, host, operation) {
      const state = this.newState();
      try {
        return this.evaluate(expression, environment, state, host, void 0);
      } catch (error) {
        throw this.normalizeRuntimeError(error, `${operation} getter \u6267\u884C\u5931\u8D25`);
      }
    }
    evaluate(expression, environment, state, host, line) {
      this.step(state, line);
      switch (expression.kind) {
        case "Literal":
          return expression.value;
        case "Identifier":
          return this.resolveIdentifier(expression.name, environment, host, line);
        case "ArrayLiteral":
          return expression.elements.map((element) => this.evaluate(element, environment, state, host, line));
        case "MapLiteral": {
          const value = /* @__PURE__ */ Object.create(null);
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
          throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", "bounded runtime \u4E0D\u6267\u884C\u5F02\u6B65 await", line);
        case "UnaryOp": {
          const operand = requireNumber(this.evaluate(expression.operand, environment, state, host, line), "\u4E00\u5143\u8FD0\u7B97\u6570");
          if (expression.op === "+") return operand;
          if (expression.op === "-") return -operand;
          throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `\u4E0D\u652F\u6301\u7684\u4E00\u5143\u8FD0\u7B97\u7B26\u300C${expression.op}\u300D`, line);
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
    resolveIdentifier(name, environment, host, line) {
      if (isUnsafeRuntimeName(name)) throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `\u540D\u79F0\u300C${name}\u300D\u88AB\u8FD0\u884C\u65F6\u5B89\u5168\u7B56\u7565\u62D2\u7EDD`, line);
      if (environment.has(name)) return environment.lookup(name);
      try {
        return host.resolveNode(name);
      } catch (error) {
        if (error instanceof RuntimeExecutionError) throw error;
        throw asRuntimeHostFailure(error, `\u89E3\u6790\u8282\u70B9\u300C${name}\u300D`, line);
      }
    }
    call(expression, environment, state, host, line) {
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
    invokeNode(node, method, args, host, line) {
      assertSafeProperty(method, line);
      try {
        return host.invokeNodeMethod(node, method, args);
      } catch (error) {
        throw asRuntimeHostFailure(error, `\u8C03\u7528\u8282\u70B9\u300C${node.name}.${method}\u300D`, line);
      }
    }
    invokeCallable(value, args, state, host, line) {
      if (!isCallable(value)) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "\u8C03\u7528\u76EE\u6807\u4E0D\u662F\u53D7\u652F\u6301\u7684 runtime function", line);
      this.step(state, line);
      try {
        return value.invoke(args, state, host);
      } catch (error) {
        throw this.normalizeRuntimeError(error);
      }
    }
    readMember(value, property, host, line) {
      assertSafeProperty(property, line);
      if (isNode(value)) {
        try {
          return host.readNodeProperty(value, property);
        } catch (error) {
          throw asRuntimeHostFailure(error, `\u8BFB\u53D6\u8282\u70B9\u5C5E\u6027\u300C${value.name}.${property}\u300D`, line);
        }
      }
      if (Array.isArray(value)) {
        if (property === "length") return value.length;
        const index = arrayIndex(property);
        if (index === void 0) throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `\u6570\u7EC4\u5C5E\u6027\u300C${property}\u300D\u4E0D\u662F\u6570\u636E\u5C5E\u6027`, line);
        return value[index];
      }
      if (typeof value === "string") {
        if (property === "length") return value.length;
        const index = arrayIndex(property);
        return index === void 0 ? void 0 : value[index];
      }
      if (isRecord2(value)) {
        if (!Object.prototype.hasOwnProperty.call(value, property)) return void 0;
        const descriptor = Object.getOwnPropertyDescriptor(value, property);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
          throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `\u5C5E\u6027\u300C${property}\u300D\u4E0D\u662F\u53D7\u652F\u6301\u7684\u6570\u636E\u5C5E\u6027`, line);
        }
        if (typeof descriptor.value === "function") throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `\u7981\u6B62\u8BFB\u53D6\u539F\u751F\u51FD\u6570\u5C5E\u6027\u300C${property}\u300D`, line);
        return descriptor.value;
      }
      throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `\u503C\u4E0D\u652F\u6301\u5C5E\u6027\u8BBF\u95EE\u300C${property}\u300D`, line);
    }
    writeMember(value, property, next, host, line) {
      assertSafeProperty(property, line);
      if (isNode(value)) {
        try {
          host.writeNodeProperty(value, property, next);
        } catch (error) {
          throw asRuntimeHostFailure(error, `\u5199\u5165\u8282\u70B9\u5C5E\u6027\u300C${value.name}.${property}\u300D`, line);
        }
        return;
      }
      if (Array.isArray(value)) {
        const index = arrayIndex(property);
        if (index === void 0) throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `\u4E0D\u80FD\u5199\u5165\u6570\u7EC4\u5C5E\u6027\u300C${property}\u300D`, line);
        value[index] = next;
        return;
      }
      if (isRecord2(value)) {
        value[property] = next;
        return;
      }
      throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `\u503C\u4E0D\u652F\u6301\u5C5E\u6027\u5199\u5165\u300C${property}\u300D`, line);
    }
    binary(operator, left, right, line) {
      switch (operator) {
        case "+":
          if (typeof left === "string" || typeof right === "string") return String(left) + String(right);
          return requireNumber(left, "\u52A0\u6CD5\u5DE6\u503C", line) + requireNumber(right, "\u52A0\u6CD5\u53F3\u503C", line);
        case "-":
          return requireNumber(left, "\u51CF\u6CD5\u5DE6\u503C", line) - requireNumber(right, "\u51CF\u6CD5\u53F3\u503C", line);
        case "*":
          return requireNumber(left, "\u4E58\u6CD5\u5DE6\u503C", line) * requireNumber(right, "\u4E58\u6CD5\u53F3\u503C", line);
        case "/":
          return requireNumber(left, "\u9664\u6CD5\u5DE6\u503C", line) / requireNumber(right, "\u9664\u6CD5\u53F3\u503C", line);
        case "==":
          return left === right;
        case "!=":
          return left !== right;
        case ">":
          return comparable(left, right, line, (a, b) => a > b);
        case "<":
          return comparable(left, right, line, (a, b) => a < b);
        case ">=":
          return comparable(left, right, line, (a, b) => a >= b);
        case "<=":
          return comparable(left, right, line, (a, b) => a <= b);
        default:
          throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `\u4E0D\u652F\u6301\u7684\u4E8C\u5143\u8FD0\u7B97\u7B26\u300C${operator}\u300D`, line);
      }
    }
    requireNode(value, line) {
      if (!isNode(value)) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "\u8BE5\u64CD\u4F5C\u9700\u8981\u4E00\u4E2A\u573A\u666F\u8282\u70B9", line);
      return value;
    }
    isTruthy(value) {
      return Boolean(value);
    }
    step(state, line) {
      state.steps += 1;
      if (state.steps > state.limits.maxSteps) {
        throw new RuntimeExecutionError("RUNTIME_STEP_LIMIT", `\u6267\u884C\u6B65\u6570\u8D85\u8FC7 ${state.limits.maxSteps}`, line);
      }
    }
    loopStep(state, line) {
      state.loopIterations += 1;
      if (state.loopIterations > state.limits.maxLoopIterations) {
        throw new RuntimeExecutionError("RUNTIME_LOOP_LIMIT", `\u5FAA\u73AF\u8FED\u4EE3\u6B21\u6570\u8D85\u8FC7 ${state.limits.maxLoopIterations}`, line);
      }
    }
    normalizeRuntimeError(error, context) {
      if (error instanceof RuntimeExecutionError) {
        if (!context) return error;
        return new RuntimeExecutionError(error.code, `${context}: ${error.message}`, error.line, error);
      }
      const message = error instanceof Error ? error.message : String(error);
      return new RuntimeExecutionError("RUNTIME_HOST_FAILURE", context ? `${context}: ${message}` : message, void 0, error);
    }
  };
  function callable(name, invoke) {
    return { kind: "RuntimeCallable", name, invoke };
  }
  function record(values) {
    return { ...values };
  }
  function normalizeLimits(limits) {
    const result = {
      maxSteps: limits.maxSteps ?? DEFAULT_RUNTIME_LIMITS.maxSteps,
      maxLoopIterations: limits.maxLoopIterations ?? DEFAULT_RUNTIME_LIMITS.maxLoopIterations,
      maxCallDepth: limits.maxCallDepth ?? DEFAULT_RUNTIME_LIMITS.maxCallDepth
    };
    for (const [name, value] of Object.entries(result)) {
      if (!Number.isSafeInteger(value) || value <= 0) throw new RuntimeExecutionError("RUNTIME_PROGRAM_INVALID", `${name} \u5FC5\u987B\u662F\u6B63\u6574\u6570`);
    }
    return Object.freeze(result);
  }
  function requireArity(name, args, count) {
    if (args.length !== count) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `${name} \u9700\u8981 ${count} \u4E2A\u53C2\u6570\uFF0C\u6536\u5230 ${args.length} \u4E2A`);
  }
  function requireNumber(value, label, line) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `${label} \u5FC5\u987B\u662F\u6709\u9650\u6570\u5B57`, line);
    return value;
  }
  function comparable(left, right, line, operation) {
    if (isNode(left) || isNode(right)) return false;
    if (typeof left === "number" && typeof right === "number") return operation(left, right);
    if (typeof left === "string" && typeof right === "string") return operation(left, right);
    throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "\u6BD4\u8F83\u8FD0\u7B97\u9700\u8981\u540C\u7C7B\u578B\u6570\u5B57\u6216\u5B57\u7B26\u4E32", line);
  }
  function iterableValues(value, line) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return Array.from(value);
    throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "for-in \u53EA\u652F\u6301\u6570\u7EC4\u6216\u5B57\u7B26\u4E32", line);
  }
  function propertyKey(value, line) {
    if (typeof value === "string") {
      assertSafeProperty(value, line);
      return value;
    }
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
    throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "\u5C5E\u6027\u7D22\u5F15\u5FC5\u987B\u662F\u5B89\u5168\u7684\u5B57\u7B26\u4E32\u6216\u975E\u8D1F\u6574\u6570", line);
  }
  function arrayIndex(property) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(property)) return void 0;
    const value = Number(property);
    return Number.isSafeInteger(value) && value >= 0 ? value : void 0;
  }
  function assertSafeProperty(property, line) {
    if (isUnsafeRuntimeName(property)) throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `\u5C5E\u6027\u300C${property}\u300D\u88AB\u8FD0\u884C\u65F6\u5B89\u5168\u7B56\u7565\u62D2\u7EDD`, line);
  }
  function isRecord2(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) && !isNode(value) && !isCallable(value);
  }
  function isNode(value) {
    return value !== null && typeof value === "object" && value.kind === "RuntimeNode";
  }
  function isCallable(value) {
    return value !== null && typeof value === "object" && value.kind === "RuntimeCallable";
  }

  // src/runtime/runtime.ts
  function some(value) {
    return { kind: "some", value };
  }
  function none() {
    return { kind: "none" };
  }
  function ok(value) {
    return { ok: true, value };
  }
  function err(error) {
    return { ok: false, error };
  }
  function is_ok(value) {
    return Boolean(value && typeof value === "object" && value.ok === true);
  }
  function unwrap(value) {
    if (!value.ok) throw new Error(`Result unwrap \u5931\u8D25: ${String(value.error)}`);
    return value.value;
  }
  var BadodoRuntime = class {
    nodes = /* @__PURE__ */ new Map();
    nodeRefs = /* @__PURE__ */ new Map();
    nodeValues = /* @__PURE__ */ new WeakMap();
    bindings = [];
    watchers = [];
    frameHandlers = [];
    events = /* @__PURE__ */ new Map();
    tweens = [];
    time = 0;
    executor;
    constructor(limits = {}) {
      this.executor = new RuntimeExecutor(limits);
    }
    registerNode(name, node) {
      assertSafeName(name);
      this.nodes.set(name, node);
      this.nodeRefs.delete(name);
    }
    registerNodes(map) {
      for (const [name, node] of Object.entries(map)) this.registerNode(name, node);
    }
    resolveNode(name) {
      assertSafeName(name);
      const node = this.nodes.get(name);
      if (node === void 0) {
        throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `\u8282\u70B9\u300C${name}\u300D\u672A\u627E\u5230\u3002\u8BF7\u5148\u7528 registerNode("${name}", ...) \u6CE8\u518C\u5B83\u3002`);
      }
      const existing = this.nodeRefs.get(name);
      if (existing) return existing;
      const ref = Object.freeze({ kind: "RuntimeNode", name });
      this.nodeRefs.set(name, ref);
      this.nodeValues.set(ref, node);
      return ref;
    }
    readNodeProperty(node, property) {
      assertSafeProperty2(property);
      const target = this.rawNode(node);
      if (target === null || typeof target !== "object" && typeof target !== "function") {
        throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `\u8282\u70B9\u300C${node.name}\u300D\u4E0D\u652F\u6301\u5C5E\u6027\u8BFB\u53D6`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(target, property);
      if (!descriptor) return void 0;
      const value = "value" in descriptor ? descriptor.value : Reflect.get(target, property);
      if (typeof value === "function") {
        throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `\u7981\u6B62\u5C06\u8282\u70B9\u65B9\u6CD5\u300C${node.name}.${property}\u300D\u4F5C\u4E3A\u6570\u636E\u8BFB\u53D6`);
      }
      return value;
    }
    writeNodeProperty(node, property, value) {
      assertSafeProperty2(property);
      const target = this.rawNode(node);
      if (target === null || typeof target !== "object" && typeof target !== "function") {
        throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `\u8282\u70B9\u300C${node.name}\u300D\u4E0D\u652F\u6301\u5C5E\u6027\u5199\u5165`);
      }
      const next = this.toHostValue(value);
      const descriptor = Object.getOwnPropertyDescriptor(target, property);
      if (descriptor && !descriptor.writable && !descriptor.set) {
        throw new RuntimeExecutionError("RUNTIME_HOST_FAILURE", `\u8282\u70B9\u300C${node.name}.${property}\u300D\u5199\u5165\u88AB\u62D2\u7EDD`);
      }
      if (descriptor?.set) {
        descriptor.set.call(target, next);
        return;
      }
      Object.defineProperty(target, property, {
        configurable: descriptor?.configurable ?? true,
        enumerable: descriptor?.enumerable ?? true,
        writable: true,
        value: next
      });
    }
    invokeNodeMethod(node, method, args) {
      assertSafeProperty2(method);
      const target = this.rawNode(node);
      if (target === null || typeof target !== "object" && typeof target !== "function") {
        throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `\u8282\u70B9\u300C${node.name}\u300D\u4E0D\u652F\u6301\u65B9\u6CD5\u8C03\u7528`);
      }
      const callable2 = Reflect.get(target, method);
      if (!Object.prototype.hasOwnProperty.call(target, method) || typeof callable2 !== "function") {
        throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `\u8282\u70B9\u300C${node.name}.${method}\u300D\u4E0D\u662F\u53EF\u8C03\u7528\u65B9\u6CD5`);
      }
      return callable2.apply(target, args.map((arg) => this.toHostValue(arg)));
    }
    registerBinding(getter, node, property) {
      assertSafeProperty2(property);
      this.bindings.push({ getter, node, prop: property, prev: void 0, initialized: false });
    }
    registerWatch(getter, handler) {
      this.watchers.push({ getter, handler, prev: void 0, initialized: false });
    }
    registerFrame(handler) {
      this.frameHandlers.push(handler);
    }
    registerEvent(node, event, handler) {
      assertSafeProperty2(event);
      const target = this.rawNode(node);
      if (target === null || typeof target !== "object" && typeof target !== "function") {
        throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `\u8282\u70B9\u300C${node.name}\u300D\u4E0D\u652F\u6301\u4E8B\u4EF6`);
      }
      const nativeAddEventListener = Reflect.get(target, "addEventListener");
      if (typeof nativeAddEventListener === "function") {
        nativeAddEventListener.call(target, event, handler);
        return;
      }
      let eventMap = this.events.get(target);
      if (!eventMap) {
        eventMap = /* @__PURE__ */ new Map();
        this.events.set(target, eventMap);
      }
      let handlers = eventMap.get(event);
      if (!handlers) {
        handlers = [];
        eventMap.set(event, handlers);
      }
      handlers.push(handler);
    }
    animate(node, property, value, duration) {
      assertSafeProperty2(property);
      const from = this.readNodeProperty(node, property);
      const isVector = isVectorLike(from);
      this.tweens.push({
        node,
        prop: property,
        from: isVector ? normalizeVector(from) : from,
        to: isVector ? normalizeVector(value) : value,
        duration: Math.max(0, duration),
        elapsed: 0,
        isVector
      });
    }
    animateTo(node, target, duration) {
      const from = this.readNodeProperty(node, "position") ?? this.rawNode(node);
      const to = this.readNodeProperty(target, "position") ?? this.rawNode(target);
      this.tweens.push({
        node,
        prop: "position",
        from: normalizeVector(from),
        to: normalizeVector(to),
        duration: Math.max(0, duration),
        elapsed: 0,
        isVector: true
      });
    }
    /** Compatibility helper for hosts that still call the legacy callback name. */
    bind = (getter, node, prop) => {
      this.registerBinding(getter, this.asNodeHandle(node), prop);
    };
    watch = (getter, handler) => {
      this.registerWatch(getter, handler);
    };
    onFrame = (handler) => {
      this.registerFrame((time) => handler(time));
    };
    on = (node, event, handler) => {
      this.registerEvent(this.asNodeHandle(node), event, handler);
    };
    /** Dispatch an event to handlers registered through the explicit host boundary. */
    emit(node, event, value) {
      assertSafeProperty2(event);
      const target = isNodeHandle(node) ? this.rawNode(node) : node;
      const handlers = this.events.get(target)?.get(event);
      if (!handlers) return;
      for (const handler of [...handlers]) handler(value);
    }
    /** Parse canonical source and execute its structured runtime representation. */
    run(source, sourceName = "source.bds") {
      this.runProgram(compileRuntime(source, sourceName));
    }
    runProgram(program) {
      this.executor.execute(program, this);
    }
    runCompiled(programOrCode) {
      if (typeof programOrCode === "string") {
        throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", "runCompiled \u4E0D\u518D\u6267\u884C\u751F\u6210 JavaScript\uFF1B\u8BF7\u4F7F\u7528 run() \u6216 runProgram() \u4F20\u5165 RuntimeProgram");
      }
      this.runProgram(programOrCode);
    }
    /** Advance one frame from a Babylon render loop or requestAnimationFrame. */
    tick(deltaTime) {
      try {
        this.tickInternal(deltaTime);
      } catch (error) {
        if (error instanceof RuntimeExecutionError) throw error;
        throw new RuntimeExecutionError("RUNTIME_HOST_FAILURE", `\u5E27\u8FD0\u884C\u5931\u8D25: ${error instanceof Error ? error.message : String(error)}`, void 0, error);
      }
    }
    tickInternal(deltaTime) {
      if (!Number.isFinite(deltaTime) || deltaTime < 0) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "deltaTime \u5FC5\u987B\u662F\u975E\u8D1F\u6709\u9650\u6570\u5B57");
      this.time += deltaTime;
      for (const handler of [...this.frameHandlers]) handler(this.time, deltaTime);
      for (const watcher of [...this.watchers]) {
        const value = watcher.getter();
        if (!watcher.initialized || !Object.is(value, watcher.prev)) {
          watcher.handler(value);
          watcher.initialized = true;
          watcher.prev = value;
        }
      }
      for (const binding of [...this.bindings]) {
        const value = binding.getter();
        if (!binding.initialized || !Object.is(value, binding.prev)) {
          this.writeNodeProperty(binding.node, binding.prop, value);
          binding.initialized = true;
          binding.prev = value;
        }
      }
      let activeTweens = 0;
      for (const tween of this.tweens) {
        tween.elapsed += deltaTime;
        const t = tween.duration === 0 ? 1 : Math.min(tween.elapsed / tween.duration, 1);
        if (tween.isVector) {
          writeVectorLerp(this, tween.node, tween.prop, normalizeVector(tween.from), normalizeVector(tween.to), t);
        } else {
          const from = requireFiniteNumber(tween.from, "\u52A8\u753B\u8D77\u59CB\u503C");
          const to = requireFiniteNumber(tween.to, "\u52A8\u753B\u76EE\u6807\u503C");
          this.writeNodeProperty(tween.node, tween.prop, from + (to - from) * t);
        }
        if (t < 1) {
          this.tweens[activeTweens] = tween;
          activeTweens += 1;
        }
      }
      this.tweens.length = activeTweens;
    }
    /** Convenience: run an auto requestAnimationFrame loop (browser only). */
    startAutoLoop() {
      let last = performance.now();
      const loop = (now) => {
        const delta = (now - last) / 1e3;
        last = now;
        this.tick(delta);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    rawNode(node) {
      if (!isNodeHandle(node)) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", "\u65E0\u6548\u7684 runtime \u8282\u70B9\u53E5\u67C4");
      const value = this.nodeValues.get(node);
      if (value === void 0) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `\u8282\u70B9\u300C${node.name}\u300D\u53E5\u67C4\u5DF2\u5931\u6548`);
      return value;
    }
    asNodeHandle(node) {
      if (isNodeHandle(node)) return node;
      for (const ref2 of this.nodeRefs.values()) if (this.nodeValues.get(ref2) === node) return ref2;
      const ref = Object.freeze({ kind: "RuntimeNode", name: "<legacy>" });
      this.nodeValues.set(ref, node);
      return ref;
    }
    toHostValue(value) {
      if (isNodeHandle(value)) return this.rawNode(value);
      if (Array.isArray(value)) return value.map((item) => this.toHostValue(item));
      if (value !== null && typeof value === "object" && !isCallableLike(value)) {
        const result = {};
        for (const [key, item] of Object.entries(value)) result[key] = this.toHostValue(item);
        return result;
      }
      return value;
    }
  };
  function assertSafeName(name) {
    if (typeof name !== "string" || name.length === 0 || isUnsafeRuntimeName(name)) {
      throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `\u540D\u79F0\u300C${name}\u300D\u88AB\u8FD0\u884C\u65F6\u5B89\u5168\u7B56\u7565\u62D2\u7EDD`);
    }
  }
  function assertSafeProperty2(property) {
    if (typeof property !== "string" || property.length === 0 || isUnsafeRuntimeName(property)) {
      throw new RuntimeExecutionError("RUNTIME_UNSUPPORTED_OPERATION", `\u5C5E\u6027\u300C${property}\u300D\u88AB\u8FD0\u884C\u65F6\u5B89\u5168\u7B56\u7565\u62D2\u7EDD`);
    }
  }
  function isNodeHandle(value) {
    return value !== null && typeof value === "object" && value.kind === "RuntimeNode";
  }
  function isCallableLike(value) {
    return value !== null && typeof value === "object" && value.kind === "RuntimeCallable";
  }
  function isVectorLike(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) && typeof value.x === "number" && typeof value.y === "number";
  }
  function normalizeVector(value) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const object = value;
      return {
        x: typeof object.x === "number" ? object.x : 0,
        y: typeof object.y === "number" ? object.y : 0,
        z: typeof object.z === "number" ? object.z : 0
      };
    }
    return { x: 0, y: 0, z: 0 };
  }
  function writeVectorLerp(runtime, node, property, from, to, t) {
    const current = runtime.readNodeProperty(node, property);
    if (current !== null && typeof current === "object" && !Array.isArray(current)) {
      const target = current;
      target.x = from.x + (to.x - from.x) * t;
      target.y = from.y + (to.y - from.y) * t;
      target.z = from.z + (to.z - from.z) * t;
      return;
    }
    runtime.writeNodeProperty(node, property, {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      z: from.z + (to.z - from.z) * t
    });
  }
  function requireFiniteNumber(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new RuntimeExecutionError("RUNTIME_INVALID_VALUE", `${label} \u5FC5\u987B\u662F\u6709\u9650\u6570\u5B57`);
    return value;
  }

  // src/adapters/babylon.ts
  function createMeshNode(mesh) {
    return {
      rotate_x(angle) {
        mesh.rotation.x += angle;
      },
      rotate_y(angle) {
        mesh.rotation.y += angle;
      },
      rotate_z(angle) {
        mesh.rotation.z += angle;
      },
      set_position(v) {
        mesh.position.x = v.x;
        mesh.position.y = v.y;
        mesh.position.z = v.z;
      },
      set_scale(v) {
        mesh.scaling.x = v.x;
        mesh.scaling.y = v.y;
        mesh.scaling.z = v.z;
      },
      set_color(c) {
        if (mesh.material && mesh.material.diffuseColor) {
          mesh.material.diffuseColor.r = c.r / 255;
          mesh.material.diffuseColor.g = c.g / 255;
          mesh.material.diffuseColor.b = c.b / 255;
        }
      },
      show() {
        mesh.setEnabled(true);
      },
      hide() {
        mesh.setEnabled(false);
      }
    };
  }
  function createLightNode(light) {
    return {
      on() {
        light.intensity = 1;
      },
      off() {
        light.intensity = 0;
      },
      switch() {
        light.intensity = light.intensity > 0 ? 0 : 1;
      },
      set_intensity(value) {
        light.intensity = value;
      }
    };
  }
  function createCameraNode(camera) {
    return {
      set_position(v) {
        camera.position.x = v.x;
        camera.position.y = v.y;
        camera.position.z = v.z;
      },
      look_at(v) {
        camera.setTarget(newTarget(camera, v));
      }
    };
  }
  function newTarget(camera, v) {
    const pos = camera.position;
    if (pos && pos.constructor) {
      return new pos.constructor(v.x, v.y, v.z);
    }
    return { x: v.x, y: v.y, z: v.z };
  }
  function bridgeMeshClick(scene, mesh, node, rt) {
    scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === 2 && pointerInfo.pickedMesh === mesh) {
        rt.emit(node, "click");
      }
    });
  }

  // src/adapters/maplibre.ts
  function createMapNode(map) {
    return {
      set_center(center, zoom) {
        map.setCenter(center);
        if (zoom != null) map.setZoom(zoom);
      },
      fly_to(center, zoom) {
        map.flyTo({ center, zoom: zoom ?? map.getZoom() });
      },
      set_zoom(zoom) {
        map.setZoom(zoom);
      },
      zoom_in() {
        map.zoomIn();
      },
      zoom_out() {
        map.zoomOut();
      },
      set_style(url) {
        map.setStyle(url);
      }
    };
  }
  function createMarkerNode(marker) {
    return {
      show() {
        marker.getElement().style.display = "";
      },
      hide() {
        marker.getElement().style.display = "none";
      },
      highlight() {
        const el = marker.getElement();
        el.style.cursor = "pointer";
        el.style.filter = "drop-shadow(0 0 6px #ffd500)";
      },
      unhighlight() {
        marker.getElement().style.filter = "";
      },
      set_label(text) {
        const el = marker.getElement();
        el.textContent = text;
      }
    };
  }
  function createLayerNode(map, layerId) {
    return {
      show() {
        map.setLayoutProperty(layerId, "visibility", "visible");
      },
      hide() {
        map.setLayoutProperty(layerId, "visibility", "none");
      }
    };
  }
  function createCircleLayerNode(map, layerId) {
    return {
      set_color(c) {
        map.setPaintProperty(layerId, "circle-color", `rgb(${c.r},${c.g},${c.b})`);
      },
      set_radius(r) {
        map.setPaintProperty(layerId, "circle-radius", r);
      },
      set_opacity(o) {
        map.setPaintProperty(layerId, "circle-opacity", o);
      },
      show() {
        map.setLayoutProperty(layerId, "visibility", "visible");
      },
      hide() {
        map.setLayoutProperty(layerId, "visibility", "none");
      }
    };
  }
  function bridgeMapEvents(map, mapNode, rt) {
    map.on("load", () => rt.emit(mapNode, "load"));
    map.on("click", (e) => rt.emit(mapNode, "click", e));
    map.on("moveend", () => rt.emit(mapNode, "move_end"));
  }
  function bridgeMarkerClick(marker, markerNode, rt) {
    marker.getElement().addEventListener("click", () => rt.emit(markerNode, "click"));
  }

  // src/runtime/browser.ts
  var MAGIC = "BDS1";
  var IV_LENGTH = 12;
  var TAG_LENGTH = 16;
  async function deriveKey(passphrase) {
    const data = new TextEncoder().encode(passphrase);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["decrypt"]);
  }
  async function decryptPayload(blob, passphrase) {
    const bytes = new Uint8Array(blob);
    if (bytes.byteLength < 4 + IV_LENGTH + TAG_LENGTH) {
      throw new Error("\u52A0\u5BC6\u6587\u4EF6\u957F\u5EA6\u65E0\u6548");
    }
    const magic = new TextDecoder().decode(bytes.subarray(0, 4));
    if (magic !== MAGIC) {
      throw new Error("\u4E0D\u662F\u6709\u6548\u7684 Badodo Script \u52A0\u5BC6\u6587\u4EF6\uFF08magic \u6821\u9A8C\u5931\u8D25\uFF09");
    }
    const iv = bytes.subarray(4, 4 + IV_LENGTH);
    const tag = bytes.subarray(4 + IV_LENGTH, 4 + IV_LENGTH + TAG_LENGTH);
    const ciphertext = bytes.subarray(4 + IV_LENGTH + TAG_LENGTH);
    const key = await deriveKey(passphrase);
    const data = new Uint8Array(ciphertext.length + TAG_LENGTH);
    data.set(ciphertext, 0);
    data.set(tag, ciphertext.length);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: TAG_LENGTH * 8 },
      key,
      data
    );
    const json = new TextDecoder().decode(plaintext);
    return assertBdsPayload(JSON.parse(json));
  }
  async function loadEncrypted(url, passphrase) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`\u52A0\u5BC6\u811A\u672C\u52A0\u8F7D\u5931\u8D25: HTTP ${response.status}`);
    const blob = await response.arrayBuffer();
    return decryptPayload(blob, passphrase);
  }
  async function loadSignedEncrypted(url, passphrase, publicKeyPem, now = /* @__PURE__ */ new Date(), requiredFeature) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`\u7B7E\u540D\u811A\u672C\u52A0\u8F7D\u5931\u8D25: HTTP ${response.status}`);
    const artifact = await response.json();
    const verified = await verifySignedArtifactBrowser(artifact, publicKeyPem, now, requiredFeature);
    return decryptPayload(verified.payload, passphrase);
  }
  async function runSignedEncrypted(runtime, url, passphrase, publicKeyPem, now = /* @__PURE__ */ new Date(), requiredFeature) {
    const payload = await loadSignedEncrypted(url, passphrase, publicKeyPem, now, requiredFeature);
    if (!payload.runtimeProgram) throw new Error("\u52A0\u5BC6 payload \u7F3A\u5C11 bounded RuntimeProgram\uFF1B\u8BF7\u91CD\u65B0\u6253\u5305 BDS \u6587\u4EF6");
    runtime.runProgram(payload.runtimeProgram);
  }
  async function runEncrypted(runtime, url, passphrase) {
    const payload = await loadEncrypted(url, passphrase);
    if (!payload.runtimeProgram) throw new Error("\u52A0\u5BC6 payload \u7F3A\u5C11 bounded RuntimeProgram\uFF1B\u8BF7\u91CD\u65B0\u6253\u5305 BDS \u6587\u4EF6");
    runtime.runProgram(payload.runtimeProgram);
  }
  return __toCommonJS(browser_exports);
})();
