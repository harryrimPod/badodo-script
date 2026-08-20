# Badodo Script (BDS)

一门面向 **Web 3D 场景、地图、交互和数据绑定** 的小型脚本语言。受 GDScript 启发，但更克制、更易读，可直接转译为 TypeScript。

> 当前版本：**0.1.0 技术预览版**。可从 GitHub 克隆运行，也可作为 npm 包独立安装；API、适配器和加密/签名格式仍按预览版演进。

> **不是让程序员觉得厉害的语言，而是让普通人第一次看到就敢写第二行的语言。**

---

## 定位

```text
Visual Blocks → Badodo Script（Basic/Scene/Advanced）→ TypeScript → 运行时
```

Badodo Script 是图块编程与 TypeScript 之间的**自然晋升层**，服务：Scene、Node、UI、Animation、Interaction、Data、Device State、地图/GIS、Web 3D。

- 全名：Badodo Script，简称 **BDS**，文件后缀 `.bds`
- 编译链：`.bds` → AST → TypeScript → JavaScript → Babylon.js / MapLibre GL JS

---

## 特性

- **小** — 语法克制，只保留必要逻辑
- **美** — 代码可直接读懂，节点一等公民：`door.open()` 而不是 `scene.get_node("door").open()`
- **易读** — 缩进语法 + 中文错误信息，接近自然语言和数学题
- **可迁移** — 天然转译为 TypeScript
- **数据绑定** — `bind` / `watch` 原生支持，适合 IoT / 数字孪生 / 工业可视化
- **双引擎** — Babylon.js（3D）+ MapLibre GL JS（地图）
- **加密打包** — AES-256 编译为二进制 `.bds.bin`
- **WASM 后端** — 纯计算函数编译为真二进制 `.wasm`
- **模块与异步** — `import`、`async func`、`await` 可投影为标准 TypeScript 模块
- **核心值模型** — Map、record、enum、Option、Result 与显式 `ok/err` 边界
- **Source Map** — 浏览器调试映射回 `.bds` 源码
- **IDE 语言服务** — Monaco 语法高亮 + 自动补全 + 悬停中文解释

---

## 语法速览

```gdscript
# 变量（无需类型声明）
speed = 10
temperature = 70

# 条件
if temperature > 80:
    alarm.on()
else:
    alarm.off()

# 重复
repeat 3:
    light.blink()

# 函数
func add(a, b):
    return a + b

# 事件
when button.click:
    door.open()

# 数据绑定
bind temperature -> gauge.value

# 数据监测（隐式 value）
watch temperature:
    if value > 80:
        alarm.on()

# 每帧更新（隐式 time）
every frame:
    rotor.rotate_y(speed * time)

# 动画
animate door.y to 2 in 0.5
animate camera to target in 1

# 数组与遍历
items = [1, 2, 3]
for item in items:
    light.blink(item)

# 类型内置函数
pos = vec3(1, 2, 3)
red = color(255, 0, 0)

# Map / Result
state = { "online": true, temperature: 25 }
result = ok(state)
```

转译示例：

```typescript
let speed = 10;
let temperature = 70;

if (temperature > 80) {
  alarm.on();
} else {
  alarm.off();
}

on(button, "click", () => {
  door.open();
});

bind(() => temperature, gauge, "value");

watch(() => temperature, (value) => {
  if (value > 80) {
    alarm.on();
  }
});

onFrame((time) => {
  rotor.rotate_y(speed * time);
});

animate(door, "y", 2, 0.5);
```

完整语法见 [`docs/spec.md`](docs/spec.md)。

GA-100 验收边界与本轮证据见 [`docs/ga-contract.md`](docs/ga-contract.md) 和 [`docs/ga-report.md`](docs/ga-report.md)。

---

## 快速开始

### 下载与使用（无需克隆仓库）

```bash
# 直接运行最新发布版
npx badodo-script --version
npx badodo-script init my-bds-project

# 或安装到当前项目
cd my-bds-project
npm install
npm run compile
```

也可以全局安装 CLI：

```bash
npm install --global badodo-script
bds compile main.bds --strict --nodes button,door,rotor --target web --emit-types
```

### 安装依赖

```bash
npm install
```

### 从 GitHub 克隆并独立验证

仓库可直接作为本地工具使用。Node.js 20 或更高版本是必需依赖；Chromium
仅用于真实浏览器/WebGL2 smoke，Go 1.22 与 .NET 8 仅用于跨语言投影验证：

```bash
git clone <REPOSITORY_URL> dodoscript
cd dodoscript
npm ci
npx playwright install chromium       # 运行浏览器/WebGL2 验证时需要
npm run build
npm run verify
```

只使用编译器、CLI 或 Node API 时，可跳过 Go/.NET 和 Chromium 安装：

```bash
npm run build
node dist/cli.js compile examples/door.bds
```

发布包也可独立安装，不要求调用方克隆源码：

```bash
npm install badodo-script
npx badodo-script --version
```

### 编译 .bds → TypeScript（含 source map）

```bash
npm run build          # 编译编译器
node dist/cli.js examples/door.bds          # 输出 examples/door.ts + .ts.map
node dist/cli.js compile examples/door.bds  # 同上
```

### 编译纯计算函数 → WASM 二进制

```bash
node dist/cli.js wasm examples/wasm-calc.bds   # 输出 .wasm + .wat
```

### 加密打包 → 二进制

```bash
node dist/cli.js pack examples/door.bds -k "a-production-key-at-least-16-chars"   # 输出 .bds.bin
```

### 运行测试

```bash
npm test               # 编译测试（11 项）
npm run test:runtime   # 运行时端到端测试（10 项）
npm run test:wasm      # WASM 后端测试（5 项）
npm run test:types     # Phase 1 类型检查测试
npm run test:conformance # Phase 0 能力/Normalized IR 测试
npm run test:shared    # Shared Model 投影测试
npm run test:shared-rc # Shared Model RC validator/compatibility/Go 测试
npm run test:shared-csharp # Shared Model C# DTO/validator projection
npm run test:shared-csharp-dotnet # 若安装 .NET SDK，则执行真实 dotnet build/run；否则明确跳过
npm run test:ingress   # payload 与 Shared ingress 合同测试
npm run test:server    # 受限 Go service projection 测试
npm run test:server-http # Go net/http adapter projection 测试
npm run test:server-mqtt # Go MQTT adapter projection 测试
npm run test:server-mqtt-go # 若安装 Go，则执行真实 go test；否则明确跳过
npm run test:expressions # 表达式优先级/括号保真测试
npm run test:strict    # Strict Compile 节点清单/capability 测试
npm run test:typed-ts   # 可选的 TypeScript 类型保真投影测试
npm run test:production # Windows/密钥/发布硬化测试
npm run test:licensing  # Ed25519 签名、许可证有效期和 feature entitlement 测试
npm run test:lsp        # LSP diagnostics/completion/hover 单元验证
npm run test:lsp-protocol # LSP JSON-RPC 协议 smoke
npm run test:godot-dotnet # Godot runtime bridge 的真实 .NET 编译/运行
npm run ga:gate         # GA-100 静态发布契约门禁
npm run test:cli-sign    # CLI keygen/pack/sign/verify 与篡改拒绝测试
npm run test:package    # npm pack/隔离安装/API/CLI/脚手架发行验证
npm run test:browser    # Chromium 本地浏览器 smoke（WebGL2/加密执行/适配器）
npm run test:maplibre-browser # MapLibre GL JS 真实本地 style/交互 smoke
npm run bundle:babylon  # 从本地 Babylon 源码生成浏览器 fixture（无需网络）
npm run verify          # 构建并执行完整验证矩阵
```

`test:browser` 和 `test:maplibre-browser` 只访问 `127.0.0.1` 的临时 fixture，不依赖 CDN。前者使用本地 `@babylonjs/core 9.20.0` bundle，验证 Ed25519 signed artifact、公钥验签、AES-GCM 解密执行和 WebGL2；后者使用锁定的 `maplibre-gl 4.7.1` 包和内联本地 style，覆盖真实 WebGL2 场景、AES-GCM 加密脚本、事件/每帧运行时、颜色绑定、marker click 和 `fly_to`。Babylon smoke 在没有 Playwright 时默认跳过，设置 `BDS_REQUIRE_BROWSER=1` 可升级为失败；MapLibre smoke 需要项目已安装 Playwright、MapLibre 包和可用 Chromium。

### 编辑器与 LSP

仓库提供 `bds-lsp` 标准输入/输出语言服务器，支持 initialize、文档诊断、completion、hover、shutdown/exit；`editors/vscode/` 提供 `.bds` 语言包骨架。全局安装后可将任意 LSP 客户端指向：

```bash
npm install --global badodo-script
bds-lsp
```

### Node API

```js
const { compile } = require("badodo-script");
const { typescript, sourceMap } = compile("speed = 1", "inline.bds");
```

ESM/TypeScript 项目可直接 `import { compile } from "badodo-script"`。发布包暴露 `dist/index.js`、类型声明和 `package.json`，不要求调用方安装仓库源码或开发依赖。
Babylon.js 或 MapLibre GL JS 由 Badodo 引擎宿主按需安装和注入；BDS 包提供编译器、runtime bridge、签名验证与 CLI，不把第三方引擎打进 npm 包。

---

## 运行时

### Shared Model

Shared Model 只生成数据契约，不生成运行时代码：

```bds
@shared type DeviceState:
    id: string
    online: bool
    temperature: f64
```

通过 `generateSharedArtifacts(source)` 可得到 TypeScript `interface` 和 JSON Schema。字段名后加 `?` 表示 wire-optional；默认值和泛型留待后续阶段。

生成器可通过第二个参数提供 schema version、字段映射、有限验证约束和 serializer metadata；这些 metadata 只影响目标工件，不改变 BDS canonical 字段名。

Shared Model RC 还提供：

```text
validateSharedValue(...)
generateSharedValidatorTypeScript(...)
checkSharedSchemaCompatibility(...)
generateSharedGo(...)
validateSharedIngress(...)
assertSharedIngress(...)
generateGoServer(...)
```

其中 Go 输出仅包含 record、JSON tags 和 `Validate() error`，不包含 Go Server runtime；required wire presence 以共享 JSON Schema 为准，Go 标量零值保持合法值，`bytes` 的 JSON wire 形式为 base64 字符串。

`generateGoServer(...)` 额外生成 transport-neutral 的 Go service interface 与 request/response-validating handler；HTTP、MQTT、goroutine、channel 和具体框架 adapter 不在本阶段。

表达式转译采用优先级感知打印：`a * (b + c)`、`a / (b / c)` 和 `-(a + b)` 会保留原始计算分组，同时省略普通左结合链中的冗余括号。

AI/CI 可使用 `compileStrict(source, { nodeNames, target })`。它保持 `compile()` 的兼容模式不变，但会拒绝清单外场景节点、重复节点清单、类型错误和目标平台不支持的 runtime/builtin capability。需要保留安全的基础类型注解时，显式传入 `emitTypes: true`，或在 CLI 使用 `--emit-types`；默认输出仍擦除注解以保持既有 TypeScript 字符串契约。

加密 payload 在 `decryptPayload`、`unpackScript` 和 `BadodoRuntime.runCompiled` 执行前统一校验版本、节点名、代码字段，并拒绝未知字段。Shared record 需要由 adapter 显式调用 ingress 校验，不会改变 `run(source)` 的脚本执行语义。

生成的代码依赖 5 个运行时能力，由 `BadodoRuntime` 提供：

| 运行时 | 说明 |
|--------|------|
| `on(node, event, handler)` | 事件注册 |
| `bind(getter, node, prop)` | 数据绑定（每帧轮询） |
| `watch(getter, handler)` | 数据监测（每帧轮询） |
| `onFrame(handler)` | 每帧更新 |
| `animate` / `animateTo` | 补间动画 |

```typescript
const rt = new BadodoRuntime();
rt.registerNode("door", doorMesh);
rt.run(source);   // 编译 + 执行
```

### 框架适配器

运行时核心框架无关，通过适配器连接引擎：

**Babylon.js（3D）**

```typescript
rt.registerNode("cube", Badodo.createMeshNode(mesh));
rt.registerNode("light", Badodo.createLightNode(light));
Badodo.bridgeMeshClick(scene, mesh, cubeNode, rt);
```

**MapLibre GL JS（地图）**

```typescript
rt.registerNode("map", Badodo.createMapNode(map));
rt.registerNode("sensor", Badodo.createMarkerNode(marker));
rt.registerNode("layer", Badodo.createCircleLayerNode(map, "layer-id"));
Badodo.bridgeMapEvents(map, mapNode, rt);
Badodo.bridgeMarkerClick(marker, sensorNode, rt);
```

---

## 加密打包

```bash
bds pack script.bds -k "a-production-key-at-least-16-chars"
```

`pack` 必须显式提供至少 16 个字符的密钥，不再使用内置默认密钥。密钥应通过部署密钥管理系统注入，不要写入仓库或前端源码。

Go HTTP adapter 可通过 `generateGoHTTP(...)` 生成 `records.go`、`server.go` 和 `http.go`。它只支持静态 JSON 单请求/单响应路由，内置 body limit、unknown-field 拒绝、Shared `Validate()`、400/422/500/404 状态映射；认证、流式传输、MQTT 和动态路径留给宿主应用。

Go MQTT adapter 可通过 `generateGoMQTT(...)` 生成 `records.go`、`server.go` 和 `mqtt.go`。它只支持静态 topic、JSON 单请求/单响应、QoS 0/1，并将响应发布到 `<request-topic>/response`；broker client、认证/TLS、通配符、动态 topic、QoS 2、streaming 和离线队列留给宿主应用。

Shared Model 可通过 `generateSharedCSharp(...)` 生成带 `System.Text.Json` wire name、nullable 类型、presence tracking 和 `Validate()` 的 C# DTO；`generateGodotRuntime()` 生成可由 Godot C# 宿主包装的节点/事件/每帧 runtime bridge。

二进制格式：`[magic "BDS1"][IV][auth tag][ciphertext AES-256-GCM]`

浏览器侧：

```typescript
await Badodo.runEncrypted(rt, "./script.bds.bin", "a-production-key-at-least-16-chars");
```

引擎工具加载签名包时使用公钥验签后再解密执行：

```typescript
await Badodo.runSignedEncrypted(
  rt,
  "./script.bds.signed.json",
  "a-production-key-at-least-16-chars",
  issuerPublicKeyPem,
  new Date(),
  "web3d",
);
```

> 安全边界：混淆级保护。密钥在客户端，无法做到绝对不可逆向，只能提高门槛。更强保护需走 WASM 后端。

### Gate D：签名与许可证边界

AES-GCM 只负责加密和共享密钥下的完整性。发行端可用 `generateSigningKeyPair()` 生成 Ed25519 密钥，使用 `issueLicense()` 签发带 `subject`、`issuedAt`、`expiresAt` 和 `features` 的许可证，再用 `signArtifact()` 对 `.bds.bin` 或其它编译产物签名：

```typescript
import {
  generateSigningKeyPair,
  issueLicense,
  signArtifact,
  serializeSignedArtifact,
  verifySignedArtifact,
} from "badodo-script";

const issuer = generateSigningKeyPair(); // privateKeyPem 仅保留在发行端
const license = issueLicense({
  subject: "customer-id",
  issuedAt: "2026-01-01T00:00:00Z",
  expiresAt: "2027-01-01T00:00:00Z",
  features: ["web3d", "maplibre"],
}, issuer.privateKeyPem);
const signed = serializeSignedArtifact(signArtifact(packedBlob, license, issuer.privateKeyPem));
const verified = verifySignedArtifact(signed, issuer.publicKeyPem, new Date(), "web3d");
```

集成宿主只配置发行方公钥；私钥不进入 npm 包、浏览器 bundle 或 signed artifact。Node SDK、浏览器 runtime 和 CLI 都已支持签名验证。签名验证不替代服务端授权、吊销列表、密钥轮换和审计系统，Badodo 引擎工具可在宿主层实现这些生命周期能力。

CLI 也提供受控的发行流程：

```bash
bds keygen keys
bds pack scene.bds scene.bds.bin -k "a-production-key-at-least-16-chars"
bds sign scene.bds.bin --private-key keys/bds-signing-private.pem --license claims.json scene.bds.signed.json
bds verify scene.bds.signed.json --public-key keys/bds-signing-public.pem --feature web3d
```

发行端可使用 `verifySignedArtifactWithKeyring()` 进行密钥轮换，并传入
`createRevocationList()` 生成的 key/subject/artifact 吊销列表；浏览器只接收
当前允许的发行方公钥，不接收私钥。

### Godot / C# 运行时桥接

`generateGodotRuntime()` 生成不依赖 Godot SDK 的 C# runtime bridge，提供节点注册、事件、每帧 tick 和时间单调性校验；Godot C# 宿主可将 `Node`/`Variant` 包装后注入该桥接层。Shared DTO 继续由 `generateSharedCSharp()` 生成，并在 .NET 8 CI 中真实编译运行。

---

## Demo

三个可运行 Demo：

```bash
npm run demo           # Babylon.js demo → demo/
npm run demo:maplibre  # MapLibre demo → demo-maplibre/
npm run demo:editor    # Monaco 编辑器 demo → demo-editor/

cd demo && python -m http.server 8080
cd demo-maplibre && python -m http.server 8081
cd demo-editor && python -m http.server 8082
```

---

## 项目结构

```
src/
  token.ts / lexer.ts / ast.ts / parser.ts / generator.ts   # 编译核心
  sourcemap.ts        # v3 source map 生成
  index.ts / cli.ts                                          # 公共 API / CLI
  runtime/
    runtime.ts        # BadodoRuntime（节点注入 + 每帧驱动 + 补间 + 内置函数）
    collect-nodes.ts  # 从 AST 收集场景节点引用
    browser.ts        # 浏览器 Web Crypto 解密 + runEncrypted
  adapters/
    babylon.ts        # Babylon.js 适配器
    maplibre.ts       # MapLibre GL JS 适配器
  wasm/
    wat-generator.ts  # AST → WAT
    compile.ts        # WAT → .wasm（wabt）+ 加载器
  editor/
    compiler-browser.ts  # 浏览器版编译器（Monaco demo 用）
  server-go.ts        # transport-neutral Go service projection
  server-go-http.ts   # 受限 Go net/http JSON adapter projection
  server-go-mqtt.ts   # 受限 Go MQTT JSON adapter projection
  shared-csharp.ts    # Shared C# DTO/validator projection
  pack/
    encrypt.ts        # AES-256-GCM 加解密
    pack.ts           # 打包（节点名 + 代码）成二进制 blob
docs/
  spec.md             # 语言规范
demo/                 # Babylon.js demo
demo-maplibre/        # MapLibre GL JS demo
demo-editor/          # Monaco 编辑器 demo
examples/             # 场景示例
browser-fixtures/     # 本地 Babylon 浏览器 bundle 与第三方许可证
vendor/MAPLIBRE_PROVENANCE.md # MapLibre GL JS v4.7.1 provenance record
```

完整的 MapLibre GitHub 源码 checkout 只用于本地审计，已被 `.gitignore` 排除；
构建和 smoke test 使用锁定的 npm 依赖，不要求把第三方源码提交到本仓库。

---

## 文档

- [语言规范](docs/spec.md)
- [架构与语义冻结](docs/architecture.md)
- [项目概览](overview.md)

---

## 许可证

MIT，见 [`LICENSE`](LICENSE)。
