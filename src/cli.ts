#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { compile, CompileOptions } from "./index";
import { parse } from "./parser";
import { tokenize } from "./lexer";
import { compileStrict, StrictCompileOptions } from "./strict-compile";
import { CapabilityTarget } from "./capabilities";
import { packScript } from "./pack/pack";
import { compileToWasm } from "./wasm/compile";
import { BadodoRuntime } from "./runtime/runtime";
import { collectNodes } from "./runtime/collect-nodes";
import { BDS_VERSION } from "./version";
import {
  generateSigningKeyPair,
  issueLicense,
  parseSignedArtifact,
  serializeSignedArtifact,
  signArtifact,
  verifySignedArtifact,
} from "./licensing";

const USAGE = `
Badodo Script (BDS) - compile .bds to TypeScript, WASM, or encrypted binary.

Usage:
  bds --version                         print the installed version
  bds init [directory]                  create a starter BDS project
  bds doctor                            check the local installation
  bds keygen [directory]                generate an Ed25519 issuer key pair
  bds <input.bds> [output.ts]           compile to TypeScript (default)
  bds compile <input.bds> [output.ts]   compile to TypeScript
  bds compile <input.bds> --strict --nodes door,light --target web
  bds run <input.bds>                   compile and run with the Node runtime
  bds wasm <input.bds> [output.wasm]    compile pure functions to WebAssembly
  bds pack <input.bds> [output.bin]     encrypt compiled script into binary blob (requires -k)
  bds pack <input.bds> -k <key>         pack with a custom AES key
  bds sign <input.bin> --private-key issuer.pem --license claims.json [output.json]
  bds verify <input.json> --public-key issuer-public.pem [--feature web3d]

Options:
  -k, --key <key>   AES encryption key (pack only, minimum 16 characters; required for pack).
  --strict          require an explicit scene-node manifest and pass strict checks.
  --nodes <names>   comma-separated scene-node manifest for --strict.
  --target <name>   strict target: portable, web, server, or godot.
  --emit-types      preserve safe BDS type annotations in generated TypeScript.
  --config <path>   read compile defaults from badodo.config.json (or a custom path).
  --private-key <path>  Ed25519 issuer private key for sign.
  --public-key <path>   Ed25519 issuer public key for verify.
  --license <path>      license claims JSON for sign.
  --feature <name>      required feature for verify.
  --force            allow init to replace starter files.
`;

function resolveOut(inputPath: string, ext: string): string {
  return inputPath.replace(/\.bds$/, ext);
}

function ensureOutputParent(outputPath: string): void {
  const parent = path.dirname(path.resolve(outputPath));
  fs.mkdirSync(parent, { recursive: true });
}

async function wasmFile(inputPath: string, outputPath?: string): Promise<void> {
  if (!fs.existsSync(inputPath)) {
    console.error(`文件不存在: ${inputPath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(inputPath, "utf-8");
  const { binary, wat, exported } = await compileToWasm(source);
  const out = outputPath ?? resolveOut(inputPath, ".wasm");
  ensureOutputParent(out);
  fs.writeFileSync(out, Buffer.from(binary));
  fs.writeFileSync(out + ".wat", wat, "utf-8");
  console.log(`WASM 编译成功: ${inputPath} -> ${out} (+ .wat)`);
  console.log(`  导出函数: ${exported.length ? exported.join(", ") : "(无纯计算函数)"}`);
}

function compileFile(inputPath: string, outputPath?: string, strictOptions?: StrictCompileOptions, compileOptions: CompileOptions = {}): void {
  if (!fs.existsSync(inputPath)) {
    console.error(`文件不存在: ${inputPath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(inputPath, "utf-8");
  const result = strictOptions
    ? compileStrict(source, { ...strictOptions, ...compileOptions, sourceName: path.basename(inputPath) })
    : compile(source, path.basename(inputPath), compileOptions);
  const out = outputPath ?? resolveOut(inputPath, ".ts");
  const mapOut = out + ".map";
  ensureOutputParent(out);
  const codeWithMap = result.sourceMap
    ? `${result.typescript}\n//# sourceMappingURL=${path.basename(mapOut)}\n`
    : result.typescript;
  fs.writeFileSync(out, codeWithMap, "utf-8");
  if (result.sourceMap) {
    fs.writeFileSync(mapOut, result.sourceMap, "utf-8");
    console.log(`编译成功: ${inputPath} -> ${out} (+ ${path.basename(mapOut)})`);
  } else {
    console.log(`编译成功: ${inputPath} -> ${out}`);
  }
}

/**
 * Create a deterministic local fixture node for `bds run`.
 *
 * The CLI has no host scene, so unknown members become no-op methods while
 * assignments remain observable on the plain object. `addEventListener` is
 * intentionally absent so BadodoRuntime keeps its in-memory event registry.
 */
function createRunNode(name: string): Record<string, unknown> {
  const target: Record<string, unknown> = { name };
  return new Proxy(target, {
    get(object, property, receiver) {
      if (property === "addEventListener") return undefined;
      if (property in object) return Reflect.get(object, property, receiver);
      if (typeof property === "symbol") return undefined;
      const method = (..._args: unknown[]): void => undefined;
      object[property] = method;
      return method;
    },
  });
}

/**
 * Scene names are valid BDS identifiers but may be JavaScript reserved words
 * (for example, the common node name `switch`). Keep compile output unchanged
 * and alias only the temporary executable used by `bds run`.
 */
function aliasRunNodes(code: string, nodeNames: readonly string[]): { code: string; names: string[]; aliases: Map<string, string> } {
  const javascriptReserved = new Set([
    "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else",
    "enum", "export", "extends", "false", "finally", "for", "function", "if", "implements", "import", "in", "instanceof",
    "interface", "let", "new", "null", "package", "private", "protected", "public", "return", "static", "super", "switch",
    "this", "throw", "true", "try", "typeof", "undefined", "var", "void", "while", "with", "yield", "arguments", "eval",
  ]);
  const safeBinding = (name: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !javascriptReserved.has(name);
  const aliases = new Map<string, string>();
  for (const name of nodeNames) {
    if (!safeBinding(name)) aliases.set(name, `__bds_node_${name}`);
  }
  const token = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|\b[A-Za-z_$][A-Za-z0-9_$]*\b/g;
  const executable = code.replace(token, (full, protectedText: string | undefined) => {
    if (protectedText !== undefined) return full;
    return aliases.get(full) ?? full;
  });
  return { code: executable, names: nodeNames.map((name) => aliases.get(name) ?? name), aliases };
}

function runFile(
  inputPath: string,
  strictOptions: StrictCompileOptions | undefined,
  compileOptions: CompileOptions,
  explicitNodes: readonly string[] | undefined,
): void {
  if (!fs.existsSync(inputPath)) throw new Error(`文件不存在: ${inputPath}`);

  const source = fs.readFileSync(inputPath, "utf-8");
  const sourceName = path.basename(inputPath);
  const result = strictOptions
    ? compileStrict(source, { ...strictOptions, emitTypes: compileOptions.emitTypes, sourceName })
    : compile(source, sourceName, compileOptions);
  const ast = parse(tokenize(source));
  if (ast.body.some((statement) => statement.kind === "ImportDecl")) {
    throw new Error("bds run 不支持直接执行包含 import 的文件；请先使用 bundler 解析模块");
  }

  // `--emit-types` is honored by the compile pass, while execution uses the
  // same source projected without annotations because Node does not parse TS.
  const executable = compileOptions.emitTypes
    ? (strictOptions
      ? compileStrict(source, { ...strictOptions, emitTypes: false, sourceName }).typescript
      : compile(source, sourceName, { emitTypes: false }).typescript)
    : result.typescript;
  const detectedNodes = collectNodes(ast);
  const nodeNames = Array.from(new Set([...detectedNodes, ...(explicitNodes ?? [])])).sort();
  const aliased = aliasRunNodes(executable, nodeNames);
  const runtime = new BadodoRuntime();
  for (const name of nodeNames) {
    const node = createRunNode(name);
    runtime.registerNode(name, node);
    const alias = aliased.aliases.get(name);
    if (alias) runtime.registerNode(alias, node);
  }
  runtime.runCompiled(aliased.code, aliased.names);
  console.log(`运行成功: ${inputPath}`);
}

function packFile(inputPath: string, outputPath: string | undefined, key: string): void {
  if (!fs.existsSync(inputPath)) {
    console.error(`文件不存在: ${inputPath}`);
    process.exit(1);
  }

  const source = fs.readFileSync(inputPath, "utf-8");
  const packed = packScript(source, key);
  const out = outputPath ?? resolveOut(inputPath, ".bds.bin");
  ensureOutputParent(out);
  fs.writeFileSync(out, packed);
  console.log(`打包成功: ${inputPath} -> ${out} (${packed.length} bytes, AES-256 加密)`);
}

function keygen(directory: string | undefined, force: boolean): void {
  const root = path.resolve(directory ?? ".");
  fs.mkdirSync(root, { recursive: true });
  const pair = generateSigningKeyPair();
  const privatePath = path.join(root, "bds-signing-private.pem");
  const publicPath = path.join(root, "bds-signing-public.pem");
  if (!force && (fs.existsSync(privatePath) || fs.existsSync(publicPath))) throw new Error("签名密钥文件已存在；使用 --force 覆盖");
  fs.writeFileSync(privatePath, pair.privateKeyPem, { encoding: "utf8", mode: 0o600 });
  fs.writeFileSync(publicPath, pair.publicKeyPem, "utf8");
  console.log(`签名密钥已生成: ${privatePath}`);
  console.log(`验证公钥: ${publicPath}`);
  console.log(`keyId: ${pair.keyId}`);
}

function signFile(inputPath: string, outputPath: string | undefined, privateKeyPath: string | undefined, licensePath: string | undefined): void {
  if (!privateKeyPath || !licensePath) throw new Error("sign 必须提供 --private-key 和 --license");
  if (!fs.existsSync(inputPath)) throw new Error(`文件不存在: ${inputPath}`);
  if (!fs.existsSync(privateKeyPath)) throw new Error(`私钥文件不存在: ${privateKeyPath}`);
  if (!fs.existsSync(licensePath)) throw new Error(`license 文件不存在: ${licensePath}`);
  const privateKey = fs.readFileSync(privateKeyPath, "utf8");
  const claims = JSON.parse(fs.readFileSync(licensePath, "utf8"));
  const license = issueLicense(claims, privateKey);
  const artifact = signArtifact(fs.readFileSync(inputPath), license, privateKey);
  const out = outputPath ?? `${inputPath}.signed.json`;
  ensureOutputParent(out);
  fs.writeFileSync(out, serializeSignedArtifact(artifact));
  console.log(`签名成功: ${inputPath} -> ${out} (Ed25519, ${license.claims.keyId})`);
}

function verifyFile(inputPath: string, publicKeyPath: string | undefined, feature: string | undefined): void {
  if (!publicKeyPath) throw new Error("verify 必须提供 --public-key");
  if (!fs.existsSync(inputPath)) throw new Error(`文件不存在: ${inputPath}`);
  if (!fs.existsSync(publicKeyPath)) throw new Error(`公钥文件不存在: ${publicKeyPath}`);
  const artifact = parseSignedArtifact(fs.readFileSync(inputPath));
  const result = verifySignedArtifact(artifact, fs.readFileSync(publicKeyPath, "utf8"), new Date(), feature);
  console.log(`验证成功: ${inputPath}`);
  console.log(`  subject: ${result.license.subject}`);
  console.log(`  keyId: ${result.license.keyId}`);
  console.log(`  expiresAt: ${result.license.expiresAt}`);
  console.log(`  payload: ${result.payload.length} bytes`);
}

function writeStarterFile(filePath: string, contents: string, force: boolean): "created" | "skipped" | "updated" {
  if (fs.existsSync(filePath) && !force) return "skipped";
  const existed = fs.existsSync(filePath);
  fs.writeFileSync(filePath, contents, "utf-8");
  return existed ? "updated" : "created";
}

function initProject(directory: string | undefined, force: boolean): void {
  const root = path.resolve(directory ?? ".");
  fs.mkdirSync(root, { recursive: true });
  const files: Record<string, string> = {
    "main.bds": `# Badodo Script starter scene\nspeed = 1\n\nwhen button.click:\n    door.open()\n\nevery frame:\n    rotor.rotate_y(speed * time)\n`,
    "badodo.config.json": `${JSON.stringify({
      source: "main.bds",
      output: "dist/main.ts",
      strict: true,
      target: "web",
      nodes: ["button", "door", "rotor"],
      emitTypes: true,
    }, null, 2)}\n`,
    "package.json": `${JSON.stringify({
      name: path.basename(root).toLowerCase().replace(/[^a-z0-9._-]+/g, "-") || "badodo-project",
      private: true,
      scripts: { compile: "bds compile main.bds dist/main.ts --strict --nodes button,door,rotor --target web --emit-types" },
      devDependencies: { "badodo-script": "^0.1.0" },
    }, null, 2)}\n`,
    "README.md": [
      "# Badodo Script project",
      "",
      "Install dependencies and compile the starter scene:",
      "",
      "    npm install",
      "    npm run compile",
      "",
      "Edit main.bds and run npm run compile again.",
      "",
    ].join("\n"),
  };
  const status: string[] = [];
  for (const [relative, contents] of Object.entries(files)) {
    const result = writeStarterFile(path.join(root, relative), contents, force);
    status.push(`${result} ${relative}`);
  }
  console.log(`BDS 项目已初始化: ${root}`);
  for (const item of status) console.log(`  ${item}`);
  if (!force && status.some((item) => item.startsWith("skipped"))) {
    console.log("已有文件保持不变；使用 --force 可更新脚手架文件。");
  }
}

function doctor(): void {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  const standalone = ["bds.exe", "bds"].includes(path.basename(process.execPath).toLowerCase());
  const checks = [
    [major >= 20, `Node.js ${process.versions.node} (需要 >= 20)`],
    [standalone || fs.existsSync(path.resolve(__dirname, "index.js")), standalone ? "编译器 API（standalone 内嵌）" : "编译器 API dist/index.js"],
    [standalone || fs.existsSync(path.resolve(__dirname, "cli.js")), standalone ? "CLI（standalone 内嵌）" : "CLI dist/cli.js"],
    [standalone || fs.existsSync(path.resolve(__dirname, "godot.js")), standalone ? "Godot bridge（standalone 内嵌）" : "Godot bridge dist/godot.js"],
  ] as const;
  console.log(`Badodo Script ${BDS_VERSION}`);
  for (const [ok, label] of checks) console.log(`  ${ok ? "OK" : "FAIL"}  ${label}`);
  if (standalone) console.log("  INFO  LSP CLI 作为独立 Node 包能力提供；standalone bds.exe 不内嵌 LSP 入口");
  else console.log(`  ${fs.existsSync(path.resolve(__dirname, "lsp-cli.js")) ? "OK" : "FAIL"}  LSP dist/lsp-cli.js`);
  if (checks.some(([ok]) => !ok)) process.exitCode = 1;
}

interface BdsConfig {
  source?: string;
  output?: string;
  strict?: boolean;
  target?: CapabilityTarget;
  nodes?: string[];
  emitTypes?: boolean;
}

function readConfig(configPath: string): BdsConfig {
  const raw: unknown = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`配置文件必须是 JSON 对象: ${configPath}`);
  const value = raw as Record<string, unknown>;
  const config: BdsConfig = {};
  if (value.source !== undefined) {
    if (typeof value.source !== "string" || !value.source) throw new Error("配置 source 必须是非空字符串");
    config.source = value.source;
  }
  if (value.output !== undefined) {
    if (typeof value.output !== "string" || !value.output) throw new Error("配置 output 必须是非空字符串");
    config.output = value.output;
  }
  if (value.strict !== undefined) {
    if (typeof value.strict !== "boolean") throw new Error("配置 strict 必须是布尔值");
    config.strict = value.strict;
  }
  if (value.emitTypes !== undefined) {
    if (typeof value.emitTypes !== "boolean") throw new Error("配置 emitTypes 必须是布尔值");
    config.emitTypes = value.emitTypes;
  }
  if (value.target !== undefined) config.target = parseTarget(String(value.target));
  if (value.nodes !== undefined) {
    if (!Array.isArray(value.nodes) || value.nodes.some((node) => typeof node !== "string")) throw new Error("配置 nodes 必须是字符串数组");
    config.nodes = value.nodes.map((node) => node.trim()).filter(Boolean);
  }
  return config;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(USAGE);
    process.exit(0);
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return;
  }
  if (args.includes("--version") || args.includes("-v")) {
    console.log(BDS_VERSION);
    return;
  }

  let cmd: string;
  let rest: string[];

  if (args[0] === "compile" || args[0] === "run" || args[0] === "pack" || args[0] === "wasm" || args[0] === "init" || args[0] === "doctor" || args[0] === "keygen" || args[0] === "sign" || args[0] === "verify") {
    cmd = args[0];
    rest = args.slice(1);
  } else {
    cmd = "compile";
    rest = args;
  }

  // Extract -k/--key option
  let key: string | undefined;
  let strict = false;
  let nodeNames: string[] | undefined;
  let target: CapabilityTarget | undefined;
  let emitTypes = false;
  let force = false;
  let configPath: string | undefined;
  let privateKeyPath: string | undefined;
  let publicKeyPath: string | undefined;
  let licensePath: string | undefined;
  let feature: string | undefined;
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "-k" || rest[i] === "--key") {
      key = rest[++i];
    } else if (rest[i].startsWith("--key=")) {
      key = rest[i].slice("--key=".length);
    } else if (rest[i].startsWith("-k=")) {
      key = rest[i].slice("-k=".length);
    } else if (rest[i] === "--strict") {
      strict = true;
    } else if (rest[i] === "--nodes") {
      nodeNames = (rest[++i] ?? "").split(",").map((name) => name.trim()).filter(Boolean);
    } else if (rest[i].startsWith("--nodes=")) {
      nodeNames = rest[i].slice("--nodes=".length).split(",").map((name) => name.trim()).filter(Boolean);
    } else if (rest[i] === "--target") {
      target = parseTarget(rest[++i]);
    } else if (rest[i].startsWith("--target=")) {
      target = parseTarget(rest[i].slice("--target=".length));
    } else if (rest[i] === "--emit-types") {
      emitTypes = true;
    } else if (rest[i] === "--config") {
      configPath = rest[++i];
    } else if (rest[i].startsWith("--config=")) {
      configPath = rest[i].slice("--config=".length);
    } else if (rest[i] === "--private-key") {
      privateKeyPath = rest[++i];
    } else if (rest[i].startsWith("--private-key=")) {
      privateKeyPath = rest[i].slice("--private-key=".length);
    } else if (rest[i] === "--public-key") {
      publicKeyPath = rest[++i];
    } else if (rest[i].startsWith("--public-key=")) {
      publicKeyPath = rest[i].slice("--public-key=".length);
    } else if (rest[i] === "--license") {
      licensePath = rest[++i];
    } else if (rest[i].startsWith("--license=")) {
      licensePath = rest[i].slice("--license=".length);
    } else if (rest[i] === "--feature") {
      feature = rest[++i];
    } else if (rest[i].startsWith("--feature=")) {
      feature = rest[i].slice("--feature=".length);
    } else if (rest[i] === "--force") {
      force = true;
    } else {
      positional.push(rest[i]);
    }
  }

  if (cmd === "doctor") {
    doctor();
    return;
  }
  if (cmd === "init") {
    try {
      initProject(positional[0], force);
    } catch (err) {
      console.error("初始化失败:");
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
    return;
  }
  if (cmd === "keygen") {
    try {
      keygen(positional[0], force);
    } catch (err) {
      console.error("密钥生成失败:");
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
    return;
  }

  let configuredOutput: string | undefined;
  let inputPath: string | undefined = positional[0];
  if (cmd === "compile") {
    const autoConfig = configPath ?? (!inputPath && fs.existsSync(path.resolve("badodo.config.json")) ? path.resolve("badodo.config.json") : undefined);
    if (autoConfig) {
      const config = readConfig(autoConfig);
      const configDirectory = path.dirname(path.resolve(autoConfig));
      if (!inputPath && config.source) inputPath = path.resolve(configDirectory, config.source);
      configuredOutput = config.output
        ? (path.isAbsolute(config.output) ? config.output : path.resolve(configDirectory, config.output))
        : undefined;
      if (!strict && config.strict !== undefined) strict = config.strict;
      if (!nodeNames && config.nodes) nodeNames = config.nodes;
      if (!target && config.target) target = config.target;
      if (!emitTypes && config.emitTypes !== undefined) emitTypes = config.emitTypes;
    }
  }
  if (!inputPath) {
    console.error("请提供输入文件，例如: bds examples/door.bds");
    process.exit(1);
  }

  try {
    if (strict && cmd !== "compile" && cmd !== "run") {
      throw new Error("--strict 只能用于 compile 或 run 命令");
    }
    if (emitTypes && cmd !== "compile" && cmd !== "run") {
      throw new Error("--emit-types 只能用于 compile 或 run 命令");
    }
    if (cmd === "pack") {
      if (!key) throw new Error("pack 必须显式提供 -k/--key，且密钥至少 16 个字符");
      packFile(inputPath, positional[1], key);
    } else if (cmd === "run") {
      const runStrictOptions = (strict || nodeNames !== undefined || target !== undefined)
        ? { nodeNames, target, requireNodeManifest: strict || nodeNames !== undefined }
        : undefined;
      runFile(inputPath, runStrictOptions, { emitTypes }, nodeNames);
    } else if (cmd === "sign") {
      signFile(inputPath, positional[1], privateKeyPath, licensePath);
    } else if (cmd === "verify") {
      verifyFile(inputPath, publicKeyPath, feature);
    } else if (cmd === "wasm") {
      wasmFile(inputPath, positional[1]);
    } else {
      compileFile(inputPath, positional[1] ?? configuredOutput, strict ? { nodeNames, target } : undefined, { emitTypes });
    }
  } catch (err) {
    console.error("处理失败:");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function parseTarget(value: string | undefined): CapabilityTarget {
  if (value === "portable" || value === "web" || value === "server" || value === "godot") return value;
  throw new Error(`未知 strict target「${value ?? ""}」，可用值：portable、web、server、godot`);
}

main();
