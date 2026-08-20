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
    bridgeMapEvents: () => bridgeMapEvents,
    bridgeMarkerClick: () => bridgeMarkerClick,
    bridgeMeshClick: () => bridgeMeshClick,
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
      if (!required.includes(key)) {
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
  function generateTypeScript(ast, options = {}) {
    return new TypeScriptGenerator(options).generate(ast);
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

  // src/runtime/runtime.ts
  function vec3(x, y, z) {
    return { x, y, z };
  }
  function color(r, g, b) {
    return { r, g, b };
  }
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
  var COMPILED_EXECUTOR_CACHE = /* @__PURE__ */ new Map();
  var MAX_COMPILED_EXECUTORS = 128;
  var BadodoRuntime = class {
    nodes = /* @__PURE__ */ new Map();
    bindings = [];
    watchers = [];
    frameHandlers = [];
    events = /* @__PURE__ */ new Map();
    tweens = [];
    time = 0;
    registerNode(name, node) {
      this.nodes.set(name, node);
    }
    registerNodes(map) {
      for (const [name, node] of Object.entries(map)) {
        this.nodes.set(name, node);
      }
    }
    resolveNode(name) {
      const node = this.nodes.get(name);
      if (node === void 0) {
        throw new Error(`\u8282\u70B9\u300C${name}\u300D\u672A\u627E\u5230\u3002\u8BF7\u5148\u7528 registerNode("${name}", ...) \u6CE8\u518C\u5B83\u3002`);
      }
      return node;
    }
    bind = (getter, node, prop) => {
      this.bindings.push({ getter, node, prop, prev: void 0, initialized: false });
    };
    watch = (getter, handler) => {
      this.watchers.push({ getter, handler, prev: void 0, initialized: false });
    };
    onFrame = (handler) => {
      this.frameHandlers.push(handler);
    };
    /** Animate node[prop] from its current value to `value` over `duration` seconds. */
    animate = (node, prop, value, duration) => {
      const from = node[prop];
      const isVector = isVectorLike(from);
      const to = isVector ? normalizeVector(value) : value;
      this.tweens.push({ node, prop, from: isVector ? normalizeVector(from) : from, to, duration, elapsed: 0, isVector });
    };
    /** Animate a node's position to another node's position over `duration` seconds. */
    animateTo = (node, target, duration) => {
      const from = node.position ?? node;
      const to = target.position ?? target;
      this.tweens.push({ node, prop: "position", from: normalizeVector(from), to: normalizeVector(to), duration, elapsed: 0, isVector: true });
    };
    on = (node, event, handler) => {
      if (node == null) {
        throw new Error(`\u65E0\u6CD5\u7ED9\u7A7A\u8282\u70B9\u6CE8\u518C\u4E8B\u4EF6\u300C${event}\u300D`);
      }
      if (typeof node.addEventListener === "function") {
        node.addEventListener(event, handler);
        return;
      }
      let eventMap = this.events.get(node);
      if (!eventMap) {
        eventMap = /* @__PURE__ */ new Map();
        this.events.set(node, eventMap);
      }
      let handlers = eventMap.get(event);
      if (!handlers) {
        handlers = [];
        eventMap.set(event, handlers);
      }
      handlers.push(handler);
    };
    /** Dispatch an event to all handlers registered via `on`. */
    emit(node, event, value) {
      const eventMap = this.events.get(node);
      if (!eventMap) return;
      const handlers = eventMap.get(event);
      if (!handlers) return;
      for (let i = 0; i < handlers.length; i += 1) handlers[i](value);
    }
    /** Run a Badodo Script source string against the registered nodes. */
    run(source) {
      const { ast, typescript } = compileWithAst(source);
      if (ast.body.some((stmt) => stmt.kind === "ImportDecl")) {
        throw new Error("\u5305\u542B import \u7684 BDS \u5FC5\u987B\u5148\u4EA4\u7ED9 Node/\u6D4F\u89C8\u5668 bundler \u89E3\u6790\uFF0C\u518D\u8C03\u7528 runCompiled \u6267\u884C");
      }
      const nodeNames = collectNodes(ast);
      this.runCompiled(typescript, nodeNames);
    }
    /** Execute already-compiled JavaScript with the given node names injected. */
    runCompiled(code, nodeNames) {
      assertBdsPayload({ version: BDS_PAYLOAD_VERSION, nodeNames, code });
      const args = [
        ...nodeNames.map((n) => this.resolveNode(n)),
        this.bind,
        this.watch,
        this.onFrame,
        this.on,
        this.animate,
        this.animateTo,
        vec3,
        color,
        some,
        none,
        ok,
        err,
        is_ok,
        unwrap
      ];
      const cacheKey = `${nodeNames.join("\0")}\0${code}`;
      let fn = COMPILED_EXECUTOR_CACHE.get(cacheKey);
      if (!fn) {
        fn = new Function(...nodeNames, "bind", "watch", "onFrame", "on", "animate", "animateTo", "vec3", "color", "some", "none", "ok", "err", "is_ok", "unwrap", code);
        if (COMPILED_EXECUTOR_CACHE.size >= MAX_COMPILED_EXECUTORS) {
          const oldest = COMPILED_EXECUTOR_CACHE.keys().next().value;
          if (oldest !== void 0) COMPILED_EXECUTOR_CACHE.delete(oldest);
        }
        COMPILED_EXECUTOR_CACHE.set(cacheKey, fn);
      }
      fn(...args);
    }
    /** Advance one frame. Call this from Babylon's render loop or requestAnimationFrame. */
    tick(deltaTime) {
      this.time += deltaTime;
      for (const handler of this.frameHandlers) {
        handler(this.time);
      }
      for (const w of this.watchers) {
        const value = w.getter();
        if (!w.initialized || !Object.is(value, w.prev)) {
          w.initialized = true;
          w.prev = value;
          w.handler(value);
        }
      }
      for (const b of this.bindings) {
        const value = b.getter();
        if (!b.initialized || !Object.is(value, b.prev)) {
          b.initialized = true;
          b.prev = value;
          b.node[b.prop] = value;
        }
      }
      let activeTweens = 0;
      for (let i = 0; i < this.tweens.length; i += 1) {
        const tween = this.tweens[i];
        tween.elapsed += deltaTime;
        const t = Math.min(tween.elapsed / tween.duration, 1);
        if (tween.isVector) {
          writeVectorLerp(tween.node, tween.prop, tween.from, tween.to, t);
        } else {
          tween.node[tween.prop] = tween.from + (tween.to - tween.from) * t;
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
  };
  function compileWithAst(source) {
    const tokens = tokenize(source);
    const ast = parse(tokens);
    const typescript = generateTypeScript(ast);
    return { ast, typescript };
  }
  function isVectorLike(value) {
    return value != null && typeof value === "object" && typeof value.x === "number" && typeof value.y === "number";
  }
  function normalizeVector(value) {
    return {
      x: value?.x ?? 0,
      y: value?.y ?? 0,
      z: value?.z ?? 0
    };
  }
  function writeVectorLerp(node, prop, from, to, t) {
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const z = from.z + (to.z - from.z) * t;
    if (prop === "position" && node.position && typeof node.position === "object") {
      node.position.x = x;
      node.position.y = y;
      node.position.z = z;
      return;
    }
    if (node[prop] && typeof node[prop] === "object") {
      node[prop].x = x;
      node[prop].y = y;
      node[prop].z = z;
      return;
    }
    node[prop] = { x, y, z };
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
    runtime.runCompiled(payload.code, payload.nodeNames);
  }
  async function runEncrypted(runtime, url, passphrase) {
    const payload = await loadEncrypted(url, passphrase);
    runtime.runCompiled(payload.code, payload.nodeNames);
  }
  return __toCommonJS(browser_exports);
})();
