export enum TokenType {
  NUMBER = "NUMBER",
  STRING = "STRING",
  BOOL = "BOOL",
  NULL = "NULL",
  IDENT = "IDENT",

  // Keywords
  IF = "IF",
  ELSE = "ELSE",
  REPEAT = "REPEAT",
  FUNC = "FUNC",
  RETURN = "RETURN",
  WHEN = "WHEN",
  BIND = "BIND",
  WATCH = "WATCH",
  EVERY = "EVERY",
  ANIMATE = "ANIMATE",
  TO = "TO",
  IN = "IN",
  FOR = "FOR",
  IMPORT = "IMPORT",
  FROM = "FROM",
  AS = "AS",
  ASYNC = "ASYNC",
  AWAIT = "AWAIT",
  TYPE = "TYPE",
  ENUM = "ENUM",

  // Operators
  ASSIGN = "ASSIGN",
  PLUS = "PLUS",
  MINUS = "MINUS",
  STAR = "STAR",
  SLASH = "SLASH",
  EQ = "EQ",
  NEQ = "NEQ",
  GT = "GT",
  LT = "LT",
  GTE = "GTE",
  LTE = "LTE",
  ARROW = "ARROW",

  // Punctuation
  LPAREN = "LPAREN",
  RPAREN = "RPAREN",
  LBRACKET = "LBRACKET",
  RBRACKET = "RBRACKET",
  LBRACE = "LBRACE",
  RBRACE = "RBRACE",
  COLON = "COLON",
  DOT = "DOT",
  COMMA = "COMMA",
  AT = "AT",
  QUESTION = "QUESTION",

  // Layout
  NEWLINE = "NEWLINE",
  INDENT = "INDENT",
  DEDENT = "DEDENT",
  EOF = "EOF",
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

const KEYWORDS: Record<string, TokenType> = {
  if: TokenType.IF,
  else: TokenType.ELSE,
  repeat: TokenType.REPEAT,
  func: TokenType.FUNC,
  return: TokenType.RETURN,
  when: TokenType.WHEN,
  bind: TokenType.BIND,
  watch: TokenType.WATCH,
  every: TokenType.EVERY,
  animate: TokenType.ANIMATE,
  to: TokenType.TO,
  in: TokenType.IN,
  for: TokenType.FOR,
  import: TokenType.IMPORT,
  from: TokenType.FROM,
  as: TokenType.AS,
  async: TokenType.ASYNC,
  await: TokenType.AWAIT,
  type: TokenType.TYPE,
  enum: TokenType.ENUM,
  true: TokenType.BOOL,
  false: TokenType.BOOL,
  null: TokenType.NULL,
};

export function keywordOrIdent(name: string): TokenType {
  return Object.prototype.hasOwnProperty.call(KEYWORDS, name) ? KEYWORDS[name] : TokenType.IDENT;
}
