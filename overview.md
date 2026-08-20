# Badodo Script

一门面向 Web 3D 场景、交互和数据绑定的小型脚本语言，可直接转译为 TypeScript。

- 全名：Badodo Script（简称 BDS，文件后缀 `.bds`）
- 编译链：`.bds` → TypeScript → JavaScript → Babylon.js / MapLibre GL JS
- 支持加密打包：`.bds` → AES-256 二进制 blob（`.bds.bin`）

## 已完成

- Lexer / Parser / AST / TypeScript Generator / CLI
- 中文友好错误信息
- 运行时：`BadodoRuntime`（节点解析 + 作用域注入 + 每帧驱动 + 补间 + 内置函数）
- 数据绑定：`bind` / `watch` / `every frame` / `when`
- 动画：`animate` / `animateTo`（标量 + 位置补间）
- 遍历与数组：`for ... in` + 数组字面量 + 索引访问
- Map 字面量与字符串索引
- 模块导入：默认导入、命名导入、side-effect import
- `async func` / `await` TypeScript 投影
- 顶层 `type` / `enum`、Option/Result 标准值模型
- 类型内置函数：`vec3` / `color`
- 框架适配器：Babylon.js（3D）+ MapLibre GL JS（地图 + 数据图层绑定）
- 加密打包：AES-256-GCM 二进制格式 + 浏览器 Web Crypto 解密
- Source Map：浏览器调试映射回 .bds 源码
- WASM 后端：纯计算函数编译为 .wasm 真二进制
- IDE 语言服务：Monaco 语法高亮 + 自动补全 + 悬停中文解释
- LSP：诊断、补全、悬停和 JSON-RPC 协议 smoke；VS Code 语言包骨架
- Godot C# runtime bridge：节点注册、事件、每帧 tick、.NET 8 真实编译
- 三个可运行 Demo（Babylon.js + MapLibre GL JS + Monaco 编辑器）
- 完整文档：`README.md` + `docs/spec.md`（v0.4）
- 现有编译/运行时/跨语言/浏览器/签名/发行矩阵通过，GA-100 契约见 [`docs/ga-contract.md`](docs/ga-contract.md)

## 支持的语法

```gdscript
speed = 10
max_temperature = 80

if temperature > max_temperature:
    motor.stop()
    alarm.on()
else:
    alarm.off()

func blink_light(count):
    repeat count:
        light.on()
        light.off()

when button.click:
    door.open()

bind temperature -> gauge.value

watch temperature:
    if value > 80:
        alarm.on()

every frame:
    rotor.rotate_y(speed * time)

animate door.y to 2 in 0.5
animate camera to target in 1

items = [1, 2, 3]
for item in items:
    light.blink(item)
```

转译示例：

```typescript
let speed = 10;
let max_temperature = 80;

if (temperature > max_temperature) {
  motor.stop();
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
animateTo(camera, target, 1);
```

## 运行时（连接 Babylon.js）

生成的代码依赖 5 个运行时能力：

| 运行时 | 说明 |
|--------|------|
| `on(node, event, handler)` | 事件注册（替代 `.on()`，避免与"开灯"语义冲突） |
| `bind(getter, node, prop)` | 数据绑定，每帧轮询 getter 变化后写入 node.prop |
| `watch(getter, handler)` | 数据监测，值变化时回调 |
| `onFrame(handler)` | 每帧更新，回调收到累计时间 `time` |
| 节点解析 | 场景节点按名注入脚本作用域 |

```typescript
const rt = new BadodoRuntime();
rt.registerNode("door", doorMesh);
rt.run(source);                 // 编译 + 执行
scene.onBeforeRenderObservable.add(() => rt.tick(delta));
```

## 加密打包

```bash
# 编译为 TypeScript
bds examples/door.bds

# 加密打包为二进制 blob
bds pack examples/door.bds -k "a-production-key-at-least-16-chars"

# 浏览器侧解密 + 执行
await Badodo.runEncrypted(rt, "./demo.bds.bin", "a-production-key-at-least-16-chars");
```

解密后会先校验 payload version、nodeNames、code 和额外字段，再进入 `runCompiled`；Shared record 则由 adapter 显式调用 `assertSharedIngress`。

二进制格式：

```
[magic "BDS1" (4)] [IV (12)] [auth tag (16)] [ciphertext AES-256-GCM]
```

**安全边界**：这是混淆级保护。JS 引擎里不存在真正的"原生二进制"，密钥必须在客户端，所以无法做到绝对不可逆向，只能提高门槛。

## 运行方式

### 发布包使用

像 Python 的 `pip install` 一样，BDS 以 npm 包形式分发：

```bash
npx badodo-script init my-bds-project
cd my-bds-project
npm install
npm run compile
```

全局 CLI 使用 `npm install --global badodo-script`，Node API 使用 `require("badodo-script")` 或 `import { compile } from "badodo-script"`。`npm run test:package` 在隔离临时目录中验证 tarball、API、CLI、脚手架和实际编译链。

```bash
cd E:\AI_WORK\dodoscript
npm run build            # 编译
npm test                 # 编译测试（11 项）
npm run test:runtime     # 运行时端到端测试（10 项）
npm run test:shared-rc   # Shared validator/兼容性/Go projection
npm run test:shared-csharp # Shared Model C# DTO/validator projection
npm run test:shared-csharp-dotnet # 若安装 .NET SDK，则执行真实 dotnet build/run；否则明确跳过
npm run test:ingress     # payload 与 Shared ingress 合同
npm run test:server      # 受限 Go service projection
npm run test:server-http # Go net/http adapter projection
npm run test:server-http-go # 若安装 Go，则执行真实 go test；否则明确跳过
npm run test:server-mqtt # Go MQTT adapter projection
npm run test:server-mqtt-go # 若安装 Go，则执行真实 go test；否则明确跳过
npm run test:expressions # 表达式优先级/括号保真
npm run test:strict      # Strict Compile 节点清单/capability
npm run test:typed-ts    # 可选的 TypeScript 类型保真投影
npm run test:production  # Windows/密钥/发布硬化测试
npm run verify            # 构建并执行完整验证矩阵
npm run demo             # Babylon.js demo（构建 + 打包）
npm run demo:maplibre    # MapLibre GL JS demo（构建 + 打包）
```

Demo 需要本地静态服务器（因需 fetch 二进制文件）：

```bash
cd demo && python -m http.server 8080            # Babylon demo
cd demo-maplibre && python -m http.server 8081   # MapLibre demo
```

## 项目结构

```
src/
  token.ts / lexer.ts / ast.ts / parser.ts / generator.ts   # 编译核心
  index.ts / cli.ts                                          # 公共 API / CLI
  runtime/
    runtime.ts        # BadodoRuntime（节点注入 + 每帧驱动 + 补间）
    collect-nodes.ts  # 从 AST 收集场景节点引用
    browser.ts        # 浏览器 Web Crypto 解密 + runEncrypted
    shared-ingress.ts # Shared record 显式 ingress 校验
  server-go.ts          # transport-neutral Go service projection
  server-go-http.ts     # 受限 Go net/http JSON adapter projection
  server-go-mqtt.ts     # 受限 Go MQTT JSON adapter projection
  shared-csharp.ts      # Shared C# DTO/validator projection
  strict-compile.ts     # AI/CI 严格编译入口
  typed-ts-test.ts      # 类型保真 TypeScript 投影回归
  payload.ts          # 加密 payload 版本/字段合同
  adapters/
    maplibre.ts       # MapLibre GL JS 适配器（map/marker/layer）
  pack/
    encrypt.ts        # AES-256-GCM 加解密
    pack.ts           # 打包（节点名 + 代码）成二进制 blob
  test.ts / runtime-test.ts / browser-decrypt-test.ts
docs/
  spec.md             # 语言规范
demo/                 # Babylon.js demo
demo-maplibre/        # MapLibre GL JS demo
examples/             # 场景示例
```

## 已知限制

- 不支持任意动态模块执行；`import` 负责生成标准 TypeScript 模块，浏览器/Node runtime 由宿主 bundler 解析依赖
- TypeScript 类型投影为显式 opt-in：`compile(..., { emitTypes: true })`、`compileStrict(..., { emitTypes: true })` 或 CLI `--emit-types`；未知/自定义 BDS 类型映射为 `unknown`，避免生成未声明的 TS 标识符
- 函数参数只支持位置参数
- `bind`/`watch` 为每帧轮询式响应（非深度响应式），适合场景级数据量
- 加密为混淆级保护，非绝对安全；pack 必须显式使用至少 16 字符密钥；payload 校验只保证结构与执行前边界，不替代代码签名
- Godot 场景树的具体 Node/Variant 包装仍由宿主提供；BDS 已提供可编译的 C# runtime bridge、Shared DTO/validator projection，以及 Go transport-neutral service、HTTP 和 MQTT adapter
- `compile()` 默认仍是兼容模式；AI/CI 需要显式使用 `compileStrict()` 才启用节点清单和 target capability 阻断

## 架构状态

收缩版方案 B 的语义边界、能力模型和 GA-100 交付物见 [`docs/architecture.md`](docs/architecture.md) 与 [`docs/ga-contract.md`](docs/ga-contract.md)。当前仍以 TypeScript/Web 为主后端；Go HTTP/MQTT、Shared C# DTO 和 dependency-free Godot runtime bridge 均有受限投影，具体 Godot Node/Variant 包装由引擎宿主注入。
