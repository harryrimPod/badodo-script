import { tokenize } from "./lexer";
import { parse, ParseError } from "./parser";
import { analyzeProgram } from "./analysis";

export interface LspDiagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity: 1 | 2 | 3;
  source: "badodo-script";
  message: string;
}

export interface LspCompletionItem {
  label: string;
  kind: 14 | 3 | 6;
  detail?: string;
}

const KEYWORDS: LspCompletionItem[] = [
  "if", "else", "repeat", "func", "async", "await", "return", "when", "bind", "watch", "every", "animate", "for", "in", "import", "from", "type", "enum",
].map((label) => ({ label, kind: 14 as const, detail: "Badodo Script keyword" }));

const BUILTIN_HOVERS: Record<string, string> = {
  vec3: "`vec3(x, y, z)` — 创建三维向量。",
  color: "`color(r, g, b)` — 创建 0-255 RGB 颜色。",
  some: "`some(value)` — 创建 Option<T> 的 Some 值。",
  none: "`none()` — 创建空 Option。",
  ok: "`ok(value)` — 创建成功 Result<T, E>。",
  err: "`err(error)` — 创建失败 Result<T, E>。",
  is_ok: "`is_ok(result)` — 检查 Result 是否成功。",
  unwrap: "`unwrap(result)` — 读取成功值；失败时抛出边界错误。",
  bind: "`bind source -> node.property` — 将数据源绑定到场景节点属性。",
  watch: "`watch source:` — 在值变化时执行代码块。",
};

function zeroRange(line: number, character = 0): LspDiagnostic["range"] {
  return { start: { line: Math.max(0, line - 1), character }, end: { line: Math.max(0, line - 1), character: character + 1 } };
}

export function diagnosticsForDocument(source: string): LspDiagnostic[] {
  try {
    const ast = parse(tokenize(source));
    return analyzeProgram(ast).diagnostics.map((diagnostic) => ({
        range: zeroRange(diagnostic.line ?? 1),
        severity: diagnostic.severity === "warning" ? 2 : 3,
        source: "badodo-script",
        message: diagnostic.message,
      }));
  } catch (error) {
    const line = error instanceof ParseError ? error.token.line : 1;
    return [{
      range: zeroRange(line),
      severity: 1,
      source: "badodo-script",
      message: error instanceof Error ? error.message : String(error),
    }];
  }
}

export function completionItems(source: string): LspCompletionItem[] {
  const names = new Set<string>(KEYWORDS.map((item) => item.label));
  try {
    const analysis = analyzeProgram(parse(tokenize(source)));
    for (const declaration of analysis.declarations) names.add(declaration.name);
    for (const node of analysis.sceneNodes) names.add(node);
  } catch {
    // Incomplete editor buffers still receive keyword completions.
  }
  for (const name of Object.keys(BUILTIN_HOVERS)) names.add(name);
  return Array.from(names).sort().map((label) => ({
    label,
    kind: BUILTIN_HOVERS[label] ? 3 : KEYWORDS.some((item) => item.label === label) ? 14 : 6,
    detail: BUILTIN_HOVERS[label] ?? "BDS symbol",
  }));
}

export function hoverForWord(word: string): { contents: { kind: "markdown"; value: string } } | null {
  const value = BUILTIN_HOVERS[word];
  return value ? { contents: { kind: "markdown", value } } : null;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: JsonRpcParams;
}

interface JsonRpcParams {
  textDocument?: { uri?: unknown; text?: unknown };
  contentChanges?: Array<{ text?: unknown }>;
  context?: { word?: unknown };
  word?: unknown;
}

interface JsonRpcConnection {
  send(message: unknown): void;
}

export function startLspServer(input = process.stdin, output = process.stdout): void {
  const documents = new Map<string, string>();
  let buffer = Buffer.alloc(0);
  const connection: JsonRpcConnection = {
    send(message) {
      const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", ...(message as Record<string, unknown>) }));
      output.write(`Content-Length: ${body.byteLength}\r\n\r\n`);
      output.write(body);
    },
  };

  const publish = (uri: string): void => {
    connection.send({ method: "textDocument/publishDiagnostics", params: { uri, diagnostics: diagnosticsForDocument(documents.get(uri) ?? "") } });
  };

  const handle = (request: JsonRpcRequest): void => {
    const id = request.id;
    const respond = (result: unknown): void => { if (id !== undefined) connection.send({ id, result }); };
    switch (request.method) {
      case "initialize":
        respond({ capabilities: { textDocumentSync: 1, completionProvider: { triggerCharacters: [".", " "] }, hoverProvider: true } });
        return;
      case "initialized":
      case "$/cancelRequest":
        return;
      case "shutdown":
        respond(null);
        return;
      case "exit":
        input.pause();
        return;
      case "textDocument/didOpen": {
        const document = request.params?.textDocument;
        if (typeof document?.uri === "string") {
          documents.set(document.uri, String(document.text ?? ""));
          publish(document.uri);
        }
        return;
      }
      case "textDocument/didChange": {
        const uri = request.params?.textDocument?.uri;
        const text = request.params?.contentChanges?.[0]?.text;
        if (typeof uri === "string" && typeof text === "string") {
          documents.set(uri, text);
          publish(uri);
        }
        return;
      }
      case "textDocument/completion":
        {
          const uri = request.params?.textDocument?.uri;
          respond({ isIncomplete: false, items: completionItems(typeof uri === "string" ? documents.get(uri) ?? "" : "") });
        }
        return;
      case "textDocument/hover": {
        const word = String(request.params?.context?.word ?? request.params?.word ?? "");
        respond(hoverForWord(word));
        return;
      }
      default:
        if (id !== undefined) connection.send({ id, error: { code: -32601, message: `Method not found: ${request.method}` } });
    }
  };

  input.on("data", (chunk: Buffer | string) => {
    buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
    while (true) {
      const separator = buffer.indexOf("\r\n\r\n");
      if (separator < 0) return;
      const header = buffer.subarray(0, separator).toString("ascii");
      const length = Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1] ?? NaN);
      if (!Number.isFinite(length) || buffer.length < separator + 4 + length) return;
      const bodyStart = separator + 4;
      const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
      buffer = buffer.subarray(bodyStart + length);
      try { handle(JSON.parse(body) as JsonRpcRequest); } catch (error) {
        connection.send({ error: { code: -32700, message: error instanceof Error ? error.message : String(error) } });
      }
    }
  });
}
