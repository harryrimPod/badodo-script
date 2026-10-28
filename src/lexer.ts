import { Token, TokenType, keywordOrIdent } from "./token";

export class LexerError extends Error {
  constructor(message: string, public line: number, public col: number) {
    super(`第 ${line} 行第 ${col} 列：${message}`);
    this.name = "LexerError";
  }
}

export class Lexer {
  private pos = 0;
  private line = 1;
  private col = 1;
  private indentStack: number[] = [0];
  private pendingTokens: Token[] = [];

  constructor(private source: string) {}

  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (this.pos < this.source.length) {
      const token = this.nextToken();
      if (token) tokens.push(token);
    }

    // Flush remaining dedents
    while (this.indentStack.length > 1) {
      this.indentStack.pop();
      tokens.push(this.makeToken(TokenType.DEDENT, ""));
    }

    tokens.push(this.makeToken(TokenType.EOF, ""));
    return tokens;
  }

  private nextToken(): Token | null {
    if (this.pendingTokens.length > 0) {
      return this.pendingTokens.shift()!;
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
    if (this.isDigit(ch) || (ch === "." && this.isDigit(this.peek(1)))) {
      return this.readNumber();
    }
    if (this.isIdentStart(ch)) return this.readIdentOrKeyword();

    return this.readOperatorOrPunct();
  }

  private handleNewline(): Token | null {
    // A NEWLINE token belongs to the end of the line it terminates, so a
    // diagnostic on it ("line ended here") points at that line.
    const endLine = this.line;
    const endCol = this.col;
    this.advance(); // consume \n
    this.line++;
    this.col = 1;

    const nextNonSpace = this.findNextNonSpacePos();
    if (nextNonSpace === -1) {
      // Blank line or trailing whitespace to EOF, ignore
      return null;
    }

    const indent = this.countIndent();
    const currentIndent = this.indentStack[this.indentStack.length - 1];

    if (indent > currentIndent) {
      this.indentStack.push(indent);
      return { ...this.makeToken(TokenType.INDENT, ""), indent: { expected: currentIndent, actual: indent } };
    }

    if (indent < currentIndent) {
      const dedents: Token[] = [];
      const validLevels = [...this.indentStack];
      while (indent < this.indentStack[this.indentStack.length - 1]) {
        this.indentStack.pop();
        dedents.push(this.makeToken(TokenType.DEDENT, ""));
      }
      if (indent !== this.indentStack[this.indentStack.length - 1]) {
        throw new LexerError(
          `缩进不一致：这一行应为 ${formatIndentLevels(validLevels)} 个空格，实际 ${indent} 个空格。请让它和上面某一层代码对齐`,
          this.line,
          this.col,
        );
      }
      // Return first dedent, queue the rest
      if (dedents.length > 0) {
        this.pendingTokens.push(...dedents.slice(1));
        return dedents[0];
      }
    }

    // Same indent level - emit newline
    return this.makeToken(TokenType.NEWLINE, "", endLine, endCol);
  }

  private findNextNonSpacePos(): number {
    let i = this.pos;
    while (i < this.source.length && (this.source[i] === " " || this.source[i] === "\t" || this.source[i] === "\r")) {
      i++;
    }
    if (i >= this.source.length || this.source[i] === "\n" || this.source[i] === "#") {
      return -1;
    }
    return i;
  }

  private countIndent(): number {
    let count = 0;
    while (this.pos < this.source.length && (this.source[this.pos] === " " || this.source[this.pos] === "\t")) {
      if (this.source[this.pos] === "\t") count += 4;
      else count++;
      this.advance();
    }
    return count;
  }

  private skipSpaces(): void {
    while (this.pos < this.source.length && (this.peek() === " " || this.peek() === "\t" || this.peek() === "\r")) {
      this.advance();
    }
  }

  private skipComment(): void {
    while (this.pos < this.source.length && this.peek() !== "\n") {
      this.advance();
    }
  }

  private readString(): Token {
    const startLine = this.line;
    const startCol = this.col;
    this.advance(); // opening quote
    let value = "";

    while (this.pos < this.source.length && this.peek() !== '"') {
      if (this.peek() === "\\") {
        this.advance();
        const escaped = this.peek();
        switch (escaped) {
          case '"': value += '"'; break;
          case "n": value += "\n"; break;
          case "t": value += "\t"; break;
          case "\\": value += "\\"; break;
          default: value += escaped; break;
        }
      } else {
        value += this.peek();
      }
      this.advance();
    }

    if (this.pos >= this.source.length) {
      throw new LexerError('字符串没有闭合的引号，请在结尾加上 "', startLine, startCol);
    }

    this.advance(); // closing quote
    return this.makeToken(TokenType.STRING, value, startLine, startCol);
  }

  private readNumber(): Token {
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

    return this.makeToken(TokenType.NUMBER, value, startLine, startCol);
  }

  private readIdentOrKeyword(): Token {
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

  private readOperatorOrPunct(): Token {
    const startLine = this.line;
    const startCol = this.col;
    const ch = this.peek();

    const twoChar = this.source.slice(this.pos, this.pos + 2);
    const twoCharMap: Record<string, TokenType> = {
      "==": TokenType.EQ,
      "!=": TokenType.NEQ,
      ">=": TokenType.GTE,
      "<=": TokenType.LTE,
      "->": TokenType.ARROW,
    };

    if (twoCharMap[twoChar]) {
      this.advance();
      this.advance();
      return this.makeToken(twoCharMap[twoChar], twoChar, startLine, startCol);
    }

  const oneCharMap: Record<string, TokenType> = {
    "=": TokenType.ASSIGN,
    "+": TokenType.PLUS,
    "-": TokenType.MINUS,
    "*": TokenType.STAR,
    "/": TokenType.SLASH,
    ">": TokenType.GT,
    "<": TokenType.LT,
    "(": TokenType.LPAREN,
    ")": TokenType.RPAREN,
    "[": TokenType.LBRACKET,
    "]": TokenType.RBRACKET,
    "{": TokenType.LBRACE,
    "}": TokenType.RBRACE,
    ":": TokenType.COLON,
    ".": TokenType.DOT,
    ",": TokenType.COMMA,
    "@": TokenType.AT,
    "?": TokenType.QUESTION,
  };

    if (oneCharMap[ch]) {
      this.advance();
      return this.makeToken(oneCharMap[ch], ch, startLine, startCol);
    }

    throw new LexerError(`无法理解的字符「${ch}」`, this.line, this.col);
  }

  private peek(offset = 0): string {
    return this.source[this.pos + offset] ?? "\0";
  }

  private advance(): void {
    if (this.pos < this.source.length) {
      this.pos++;
      this.col++;
    }
  }

  private isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
  }

  private isIdentStart(ch: string): boolean {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
  }

  private isIdentPart(ch: string): boolean {
    return this.isIdentStart(ch) || this.isDigit(ch);
  }

  private makeToken(type: TokenType, value: string, line?: number, col?: number): Token {
    return { type, value, line: line ?? this.line, col: col ?? this.col };
  }
}

export function tokenize(source: string): Token[] {
  return new Lexer(source).tokenize();
}

function formatIndentLevels(levels: readonly number[]): string {
  const unique = [...new Set(levels)].sort((a, b) => a - b);
  if (unique.length <= 1) return String(unique[0] ?? 0);
  return `${unique.slice(0, -1).join("、")} 或 ${unique[unique.length - 1]}`;
}
