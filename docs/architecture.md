# BDS 收缩版方案 B：架构与语义冻结（Phase 0）

状态：设计契约，版本 `0.1`；Shared Model RC、加密 payload ingress contract、transport-neutral Go service projection、受限 Go HTTP adapter、表达式保真打印、Strict Compile 与生产硬化已加入。

## 1. 产品定义

BDS 是面向 Badodo 场景、数据绑定、交互和共享模型的受限应用语义层。BDS 是 canonical source of truth；TypeScript 是第一主后端，Go/C# 只在明确能力域内生成目标代码。

反向提升只接受 BDS 生成且带 provenance 元数据的兼容子集，不承诺任意 TypeScript、Go 或 C# 源码的转换。

## 2. 分层

```text
BDS Source
   │
   ▼
Syntax AST
   │
   ▼
Name / Type / Capability Analysis
   │
   ▼
Target-neutral Semantic IR
   │
   ├── @shared  → TS / Go / C# records, schema, validation
   ├── @web     → TypeScript → Babylon / MapLibre
   ├── @server  → restricted Go projection
   └── @godot   → restricted C# projection
```

Phase 0 的 `NormalizedProgram` 只用于去除 source location、稳定 conformance fixture；它不是完整 Typed Semantic IR。后续必须增加符号、类型、可变性、效果和 capability 信息。

## 3. Core 与 Domain 边界

### Core

```text
bool, i32, f64, string, bytes
Array<T>, Map<String,T>
record, enum, Option<T>, Result<T,E>
纯函数、条件、循环、返回
```

Core 不包含 Node、Babylon、MapLibre、Godot、MQTT、HTTP、文件系统、反射或宿主对象模型。

### Domain packages

```text
badodo.scene    NodeRef / property / event / animation
badodo.binding  bind / watch
badodo.geo      GeoPoint / GeoEntity / GeoRoute
badodo.device   DeviceState / Telemetry / Command
```

Babylon、MapLibre、Go Server 和 Godot 均属于 adapter/runtime 层。

## 4. 能力模型

编译结果必须携带 capability manifest。当前机器可读清单位于 `src/capabilities.ts`，首批能力包括：

```text
runtime.bind
runtime.watch
runtime.on-frame
runtime.on
runtime.animate
runtime.animate-to
builtin.vec3
builtin.color
adapter.babylon.*
adapter.maplibre.*
adapter.go.http
adapter.go.mqtt
adapter.godot.shared
```

未知标识符在当前兼容模式下仍可作为场景节点候选，但分析器会明确标记 `scene-node`，而不是把它混同为普通局部变量或内置能力。

## 5. 类型与运行时语义冻结

- 不使用模糊的 `number`；共享数值优先 `i32` / `f64`。
- 业务缺失值使用 `Option<T>`，不把 `null` 作为核心业务语义。
- record 默认值语义；共享字段默认不可变；Scene Node 是引用型 domain handle。
- 错误模型优先 `Result<T,E>`；异常只允许在 target boundary 内部使用。
- 第一阶段不开放用户 class、继承、复杂泛型、反射、宏、goroutine、channel 或任意 closure 捕获可变状态。

Phase 1 当前支持可选的基础类型注解：

```text
x: i32 = 1
func f(a: string) -> i32:
    return 1
```

注解进入 AST 和类型诊断，但默认 generator 仍输出兼容的无类型 TypeScript。需要类型保真时，可显式设置 `emitTypes: true`：`bool/i32/f64/string/bytes/array/map/option/result` 分别投影为安全的 TypeScript 类型；顶层 `type`/`enum` 也会输出对应声明。Option/Result 的运行时值由标准库 helper 提供，错误在 target boundary 显式处理。

Shared Model 的最小切片使用：

```bds
@shared type DeviceState:
    id: string
    online: bool
    temperature: f64
```

它通过 `generateSharedArtifacts()` 投影为 TypeScript `interface` 和 JSON Schema。字段可使用 `?` 标记为 wire-optional；生成器 options 现在支持 schema version/id、TS/JSON 字段映射、有限验证约束和 serializer metadata。

metadata 使用 canonical 字段键：

```text
DeviceState.temperature
```

AST 仍保存 BDS 原始字段名；rename 只作用于投影层。支持的验证约束为 `minLength`、`maxLength`、`minimum`、`maximum`、`pattern`、`minItems` 和 `maxItems`。

## 6. Shared Model RC

RC API：

```text
validateSharedValue(value, typeName, artifacts)
generateSharedValidatorTypeScript(declarations, options)
checkSharedSchemaCompatibility(previous, next)
generateSharedGo(declarations, options)
validateSharedIngress(value, typeName, artifacts)
assertSharedIngress(value, typeName, artifacts)
generateGoServer(declarations, services, options)
```

Go projection 只生成 record、JSON tags 和无 runtime 依赖的 `Validate() error`，不是 Go Server backend；必填字段的 wire presence 仍由共享 JSON Schema 判定，Go 标量零值不被误判为空缺。`bytes` 的 JSON wire 形式为 base64 字符串。Schema compatibility checker 将删除字段、required 化、类型变化、JSON rename、serializer/format 变化和约束收紧视为 breaking；新增 optional 字段视为 compatible warning。

Shared record 不自动注入 `run(source)`；adapter 或应用 ingress 必须显式调用 `validateSharedIngress` / `assertSharedIngress`，验证失败后才可继续传递给宿主系统。

`generateGoServer()` 只生成同包的 Shared records、Go service interface 和 request/response-validating handler。它使用 `context.Context` 与标准 `error` 作为 transport-neutral 边界，不生成 HTTP/MQTT 路由、goroutine、channel 或框架 runtime。

## 7. Strict Compile

`compile()` 与 `analyze()` 保持兼容模式；AI 或 CI 可显式调用 `compileStrict(source, options)`。Strict Compile 要求外部 `nodeNames` 清单（可用 `requireNodeManifest: false` 明确关闭），拒绝清单外的隐式场景节点，并可用 `target` 检查 runtime/builtin capability 是否属于目标平台。成功结果携带排序后的 `nodeNames`、已使用 `capabilities`、source map 和空诊断；失败抛出 `StrictCompileError`。

类型保真投影是独立 opt-in，不改变默认字符串和 source-map 合同：`compile(source, sourceName, { emitTypes: true })`、`compileStrict(source, { emitTypes: true, ... })` 以及浏览器 compiler 的同名选项均开启安全的 TypeScript 注解输出。

## 8. Payload Ingress Contract

加密 `.bds.bin` 解密后必须先通过 `src/payload.ts` 的严格合同：`version` 为整数且等于当前版本 `1`，`nodeNames` 为无空名、无重复字符串数组，`code` 为字符串，且拒绝额外字段。`decryptPayload`、`unpackScript` 和 `BadodoRuntime.runCompiled` 均在执行代码前执行该校验。

生产打包必须显式提供至少 16 个字符的 passphrase；实现不再回退到内置默认密钥。Windows CRLF 输入在 lexer 层与 LF 等价处理。

## 8.1 Go HTTP Adapter

`generateGoHTTP(...)` 在现有 transport-neutral service boundary 之上生成标准库 `net/http` adapter。每条 route 必须显式声明 `HTTP method + static path + request/response shared type`；生成的 `http.go` 只处理 JSON 单请求/单响应，并固定执行 body limit、`DisallowUnknownFields`、request `Validate()`、service call、response `Validate()` 和 400/422/500/404 状态映射。动态路径、query 模板、认证、streaming、WebSocket 与 MQTT 不在本阶段。

## 8.2 Go MQTT Adapter

`generateGoMQTT(...)` 在同一 service boundary 之上生成 broker-neutral 的 `mqtt.go`。每条 route 必须显式声明静态 topic、service/method 和 QoS；只支持 QoS 0/1、JSON 单请求/单响应，响应 topic 固定为 `<request-topic>/response`。生成器提供最小 `MQTTTransport` 接口，由宿主实现 broker client；接收侧执行空 payload/body limit、unknown-field、request/response `Validate()` 和精确 topic 校验。通配符、动态 topic、QoS 2、认证/TLS、重连、离线队列、共享订阅和 streaming 后置。

## 8.3 Shared C# Projection

`generateSharedCSharp(...)` 生成面向 Godot/.NET 宿主的 Shared DTO：`System.Text.Json` 的 JSON wire name、C# PascalCase 属性、nullable/bytes/array 类型、required wire presence tracking、嵌套 Shared validation 和有限约束校验。`generateGodotRuntime()` 生成 dependency-free 节点注册、事件和每帧 bridge；具体 Godot scene Node/Variant 包装仍由宿主注入。

## 9. Round Trip 边界

### Lossless

只针对 BDS 生成的 canonical target code、Shared Model、纯函数和标准 runtime pattern，并要求稳定 provenance。

### Semantic

允许语法糖展开，例如 Go error tuple → `Result`、TypeScript optional chaining → 显式判断，但必须比较 normalized semantic IR。

### Unsupported

prototype、Proxy、reflection、unsafe、dynamic、复杂泛型、goroutine/channel、CLR expression tree 等保留为 opaque external region，并报告冲突，不静默提升。

## 10. 开发顺序

1. 冻结类型、值语义、作用域、能力和 IR 合同。
2. 完善 BDS → TypeScript 的 Typed AST、表达式保真、标准库和 conformance tests。
3. 增加 Strict Compile：节点清单、capability manifest 和 CI/AI 阻断入口。
4. 实现 `@shared` → TypeScript/JSON Schema/Validation。
5. 完成 Shared Model RC：compatibility report、serializer metadata、受限 Go records/validator。
6. 冻结 payload ingress contract，并把校验接入 pack/browser/runtime 边界。
7. 完成 transport-neutral Go service projection。
8. 完成受限 Go HTTP adapter。
9. 完成受限 Go MQTT adapter；broker-specific client 继续后置。
10. 在真实需求驱动下增加更具体的 Go transport 能力。
11. 完成 Shared C# DTO projection；Godot scene script/runtime 继续后置。
12. 再增加受限 C# / Godot scene projection。
13. 最后实现 metadata-assisted TypeScript lift；Go/C# lift 和 BDS Sync 后置。
14. 类型保真 TypeScript projection 保持 opt-in；后续再由实际需求驱动更多命名类型/共享接口联动。

## 11. 当前交付物

- `src/analysis.ts`：非破坏性的符号/场景节点分析。
- `src/capabilities.ts`：运行时、内置函数和现有适配器的机器可读能力清单。
- `src/semantic-ir.ts`：去除 source location 的 normalized fixture 表示。
- `src/conformance-test.ts`：能力清单、节点分类和 normalized representation 的基线测试。
- `src/type-checker.ts`：非破坏性的基础类型推断和诊断。
- `src/type-test.ts`：类型注解、函数签名和场景节点兼容性测试。
- `src/shared.ts`：`@shared type` → TypeScript interface / JSON Schema 投影。
- `src/shared-test.ts`：Shared Model 字段、required 顺序和运行时代码隔离测试。
- `src/shared.ts` 的 `SharedGenerationOptions`：schema version/id、字段映射、验证约束和 serializer metadata。
- `src/shared-rc.ts`：runtime validator、TypeScript validator source、schema compatibility report 和 Go projection。
- `src/shared-rc-test.ts`：RC validator、兼容性、Go struct/validator 和数组 Schema 回归。
- `src/payload.ts`：加密 payload 的版本、字段和额外属性合同，以及执行前校验。
- `src/runtime/shared-ingress.ts`：Shared record 的显式 ingress 校验包装器。
- `src/ingress-test.ts`：pack/server/browser/runtime/shared ingress 回归测试。
- `src/server-go.ts`：受限、transport-neutral 的 Go service interface/handler projection。
- `src/server-go-test.ts`：Go service projection、request validation 和 transport 边界测试。
- `src/server-go-http.ts`：受限标准库 Go HTTP JSON adapter projection。
- `src/server-go-http-test.ts`：HTTP route、body limit、JSON ingress 和错误状态回归。
- `src/server-go-mqtt.ts`：broker-neutral 的受限 Go MQTT JSON adapter projection。
- `src/server-go-mqtt-test.ts`：MQTT topic、QoS、payload ingress 和 response publish 回归。
- `src/shared-csharp.ts`：Shared C# DTO、System.Text.Json metadata 和 `Validate()` projection。
- `src/shared-csharp-test.ts`：C# 类型、命名、presence、约束和冲突回归。
- `src/expression-test.ts`：括号、优先级、一元表达式和结合性的 TypeScript golden tests。
- `src/strict-compile.ts`：带 node manifest、target capability 和 type-error 阻断的严格编译入口。
- `src/strict-compile-test.ts`：Strict Compile 节点、能力和诊断回归测试。
- `src/typed-ts-test.ts`：默认擦除与 opt-in 类型保真 TypeScript 投影回归。
- `src/production-test.ts`：Windows CRLF、显式密钥和错误密钥回归。

## 12. 分发与使用标准

BDS 的交付单位是标准 npm package，而不是要求用户克隆源码的工作区。npm 注册表发布尚未进行，目前从 GitHub 仓库安装（安装时由 `prepare` 构建 `dist/`）：

```text
npx github:harryrimPod/badodo-script                       → 一次性 CLI
npm install --save-dev github:harryrimPod/badodo-script    → 项目级 API + CLI
```

全局安装 git 依赖在 npm 10 下构建失败，暂不支持。

`package.json` 暴露 CommonJS/TypeScript API、双 CLI bin、Node.js 版本约束和显式运行时依赖；`bds init` 生成最小可编译项目，`bds doctor` 检查安装；`npm run test:package` 在隔离目录中验证打包、安装、API、CLI、脚手架和实际编译。npm 发布 workflow（手动触发，npm provenance）已存在，但尚未执行。

## 13. GA-100 状态

原 Phase 0/1/2 顺序是历史设计记录；当前可交付边界以 [`docs/ga-contract.md`](ga-contract.md) 为准。语言核心、真实 Babylon/MapLibre 浏览器证据、Go/.NET/Godot bridge、LSP、签名 keyring/吊销和 npm/CI 门禁均已纳入 `npm run verify` 与 `npm run ga:gate`。宿主 SDK 连接、联网授权服务、计费和客户审计属于 Badodo 引擎产品层，不伪装成编译器内置能力。
