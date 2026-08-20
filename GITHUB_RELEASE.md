# Badodo Script (BDS)

> 面向 Badodo 引擎工具的受限场景脚本层：让图块/AI 生成的行为安全、可读、可验证，并自然进入 TypeScript/Web 3D 运行时。
>
> A constrained scene-scripting layer for the Badodo engine toolchain: readable, verifiable behavior for visual blocks and AI-generated logic, compiled naturally into TypeScript and Web 3D runtimes.

## 中文介绍

### 项目是什么

Badodo Script（简称 **BDS**，文件后缀 `.bds`）是一门面向 Web 3D 场景、地图、交互和数据绑定的小型脚本语言。它不是通用编程语言，也不是 TypeScript、Go、C# 或 Godot 的替代品，而是图块/AI 与 Badodo 引擎运行时之间的受限桥接层。

编译主链路：

```text
.bds → AST → TypeScript → JavaScript → Badodo Runtime / Babylon.js / MapLibre GL JS
```

### 主要能力

- 缩进语法、条件、循环、函数和表达式
- `when` 事件、`bind` 数据绑定、`watch` 监测、`every frame` 每帧逻辑
- `animate` 动画、数组、Map、模块导入、`async/await`
- `record`、`enum`、Option/Result 和 `ok/err` 显式错误边界
- TypeScript 转译、类型保真输出和 Source Map
- Babylon.js Web 3D 适配器与 MapLibre GL JS 地图适配器
- AES-GCM 加密打包、Ed25519 签名、keyring 轮换和吊销策略接口
- WASM 纯计算后端
- Monaco 编译器、LSP 诊断/补全/悬停和 VS Code 语言包
- Shared Model 到 TypeScript、JSON Schema、Go、C# 的受限投影
- Go HTTP/MQTT 适配器和 dependency-free C# / Godot runtime bridge

### 目标语言边界

| 目标 | 当前支持范围 |
|---|---|
| TypeScript | BDS 主编译目标，支持完整语言核心和运行时语义 |
| Go | Shared Model、DTO、验证器、HTTP/MQTT 受限投影 |
| C# | Shared Model、DTO、验证器和 Godot bridge 受限投影 |

Go/C# 投影用于数据合同、服务适配和宿主桥接；任意 BDS 场景行为目前仍以 TypeScript/Web 运行时为主。

### 快速开始

```powershell
npm install
npm run build
npx bds compile examples/animate.bds -o examples/animate.ts
```

运行完整本地验证：

```powershell
npm run verify
```

当前发布基线为 **0.1.0 GA-100 技术交付候选**。GA-100 表示 Badodo 引擎工具边界内的技术契约已具备自动化证据，不表示已经完成 GitHub/npm 公开发布。

### 项目状态

- 本地构建、TypeScript 编译、Chromium + Babylon WebGL2、MapLibre WebGL2、Go、.NET、Godot、LSP、WASM 和 npm 隔离安装验证已通过。
- GitHub 远程仓库、远端 CI 和 npm provenance 发布需要在目标账户中配置后执行。
- API、适配器和打包格式仍遵循 `0.1.x` 预览版兼容策略。

### 许可证

Badodo Script 当前采用 **MIT License（MIT 许可证）**。

- SPDX 标识：`MIT`
- 许可证全文：[`LICENSE`](LICENSE)
- npm 元数据：`package.json` 中的 `license` 字段为 `MIT`
- MIT 允许使用、复制、修改、合并、发布、分发、再许可和销售，但必须保留版权声明和许可证文本。

Babylon.js、MapLibre GL JS、TypeScript、Playwright、esbuild、WABT 等第三方依赖各自保留原许可证；发布时请同时遵守对应包的许可证和归属要求。仓库中的 Babylon 许可证说明位于 [`browser-fixtures/BABYLON_LICENSE.md`](browser-fixtures/BABYLON_LICENSE.md)。

## English Introduction

### What is Badodo Script?

Badodo Script (**BDS**, `.bds`) is a small scripting language for Web 3D scenes, maps, interaction, and data binding. It is not a general-purpose programming language and does not replace TypeScript, Go, C#, or Godot. BDS is a constrained bridge between visual blocks/AI-generated behavior and the Badodo engine runtime.

The primary compilation pipeline is:

```text
.bds → AST → TypeScript → JavaScript → Badodo Runtime / Babylon.js / MapLibre GL JS
```

### Key capabilities

- Indentation-based syntax, conditions, loops, functions, and expressions
- `when` events, `bind` data binding, `watch` monitoring, and `every frame` logic
- `animate`, arrays, maps, module imports, and `async/await`
- `record`, `enum`, Option/Result values, and explicit `ok/err` boundaries
- TypeScript transpilation, type-preserving output, and source maps
- Babylon.js Web 3D and MapLibre GL JS adapters
- AES-GCM packaging, Ed25519 signatures, keyring rotation, and revocation interfaces
- A WASM backend for pure computation
- Monaco compiler support, LSP diagnostics/completion/hover, and a VS Code package
- Restricted Shared Model projections to TypeScript, JSON Schema, Go, and C#
- Go HTTP/MQTT adapters and a dependency-free C# / Godot runtime bridge

### Target-language scope

| Target | Current scope |
|---|---|
| TypeScript | Primary BDS compilation target with the full supported language core |
| Go | Restricted Shared Model, DTO, validator, HTTP, and MQTT projections |
| C# | Restricted Shared Model, DTO, validator, and Godot bridge projections |

Go and C# projections target data contracts, service adapters, and host bridges. Arbitrary BDS scene behavior currently runs primarily through the TypeScript/Web runtime.

### Quick start

```bash
npm install
npm run build
npx bds compile examples/animate.bds -o examples/animate.ts
```

Run the complete local verification suite:

```bash
npm run verify
```

The current release baseline is **0.1.0 GA-100 technical delivery candidate**. GA-100 means that the bounded Badodo engine-tool contract has repeatable technical evidence; it does not mean that the package has already been publicly released on GitHub or npm.

### Project status

- Local TypeScript, Chromium + Babylon WebGL2, MapLibre WebGL2, Go, .NET, Godot, LSP, WASM, and isolated npm-install checks are passing.
- A GitHub remote, remote CI run, and npm provenance publication must be configured in the target accounts before public release.
- APIs, adapters, and packaging formats follow the `0.1.x` preview compatibility policy.

### License

Badodo Script is released under the **MIT License**.

- SPDX identifier: `MIT`
- Full text: [`LICENSE`](LICENSE)
- npm metadata: `package.json` declares `"license": "MIT"`
- The MIT License permits use, copying, modification, merging, publication, distribution, sublicensing, and sale, subject to retaining the copyright notice and license text.

Babylon.js, MapLibre GL JS, TypeScript, Playwright, esbuild, WABT, and other third-party dependencies retain their own licenses. Distributed builds must comply with the licenses and attribution requirements of those packages. Babylon attribution is included in [`browser-fixtures/BABYLON_LICENSE.md`](browser-fixtures/BABYLON_LICENSE.md).

## Repository map

- `src/` — compiler, parser, type checker, runtime, adapters, projections, licensing, and LSP
- `examples/` — `.bds` examples and golden TypeScript output
- `docs/ga-contract.md` — bounded GA-100 contract
- `docs/ga-report.md` — current local evidence report
- `editors/vscode/` — VS Code language package
- `browser-fixtures/` — local Babylon fixture and attribution

## Release preparation checklist

- [x] MIT license included
- [x] Package metadata and `CHANGELOG.md` present
- [x] Local GA-100 verification passed
- [x] Local Git commit created
- [ ] Configure `REPOSITORY_URL` and push `main`
- [ ] Confirm GitHub Actions CI is green
- [ ] Configure `NPM_TOKEN`
- [ ] Trigger `release.yml` and publish `v0.1.0` with provenance
