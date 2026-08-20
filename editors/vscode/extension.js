const vscode = require("vscode");

const KEYWORDS = ["if", "else", "repeat", "func", "async", "await", "return", "when", "bind", "watch", "every", "animate", "for", "in", "import", "from", "type", "enum"];
const BUILTINS = {
  vec3: "vec3(x, y, z) — 创建三维向量。",
  color: "color(r, g, b) — 创建 RGB 颜色。",
  some: "some(value) — 创建 Option<T>。",
  none: "none() — 创建空 Option。",
  ok: "ok(value) — 创建 Result<T, E>。",
  err: "err(error) — 创建失败 Result<T, E>。",
  is_ok: "is_ok(result) — 检查 Result 是否成功。",
  unwrap: "unwrap(result) — 读取 Result 成功值。",
};

function activate(context) {
  const selector = { language: "bds", scheme: "file" };
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, {
    provideCompletionItems() {
      return [...KEYWORDS, ...Object.keys(BUILTINS)].map((label) => {
        const item = new vscode.CompletionItem(label, BUILTINS[label] ? vscode.CompletionItemKind.Function : vscode.CompletionItemKind.Keyword);
        item.detail = BUILTINS[label] || "Badodo Script keyword";
        return item;
      });
    },
  }));
  context.subscriptions.push(vscode.languages.registerHoverProvider(selector, {
    provideHover(document, position) {
      const word = document.getText(document.getWordRangeAtPosition(position));
      return BUILTINS[word] ? new vscode.Hover(new vscode.MarkdownString(BUILTINS[word])) : undefined;
    },
  }));
}

function deactivate() {}

module.exports = { activate, deactivate };
