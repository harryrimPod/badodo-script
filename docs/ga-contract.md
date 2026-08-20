# Badodo Script GA Contract

`GA` 在本项目中指 **Badodo 引擎工具的可交付边界 100% 通过**，不是把 BDS 扩展成任意 TypeScript、游戏引擎或后端语言。所有条目必须有可重复命令和真实产物证据。

## GA-100 验收矩阵

| 领域 | GA-100 边界 | 验收证据 |
|---|---|---|
| 基础语法与解析 | 缩进、事件、绑定、动画、循环、函数、数组、Map、模块导入、async/await、record/enum、Option/Result | `npm run test:language-ga` |
| TypeScript 转译 | 默认兼容输出、source map、Strict Compile、类型保真输出、模块声明 | `npm run build`、`npm run test:typed-ts` |
| Web 运行时 | payload ingress、AES-GCM、签名包、浏览器 WebCrypto、每帧/事件/绑定 | `npm run test:browser` |
| Babylon / MapLibre | 真实 Chromium + WebGL2、适配器事件/材质/地图交互 | `npm run test:browser`、`npm run test:maplibre-browser` |
| Shared Model | TypeScript/JSON Schema/Go/C#、验证、兼容性报告 | `npm run test:shared-rc`、`npm run test:shared-csharp` |
| Go HTTP / MQTT | 真实 Go 1.22 编译和测试 | `npm run test:server-http-go`、`npm run test:server-mqtt-go` |
| C# / Godot | Shared DTO + dependency-free Godot runtime bridge，真实 .NET 8 编译/运行 | `npm run test:shared-csharp-dotnet`、`npm run test:godot-dotnet` |
| WASM | 纯函数 WAT/WASM 编译与运行 | `npm run test:wasm` |
| 编辑器 | Monaco compiler + LSP diagnostics/completion/hover + VS Code language package | `npm run test:lsp`、`bds-lsp`、`editors/vscode` |
| 安全与授权 | AES 混淆边界、Ed25519 签名、keyring 轮换、subject/artifact/key 吊销 | `npm run test:licensing` |
| npm 分发 | `npm pack`、隔离安装、CLI/API/init/compile、Node >=20 | `npm run test:package` |
| 发布治理 | MIT、CHANGELOG、CI、Chromium gate、npm provenance workflow | `npm run ga:gate` |

## 明确边界

- 第三方 Babylon.js、MapLibre GL JS 和 Godot SDK 由 Badodo 引擎宿主提供，BDS 包不重新打包它们。
- 授权系统提供签名、轮换和吊销策略接口；联网授权服务、客户账户、计费和审计由 Badodo 产品层实现。
- Go MQTT broker、Godot 场景树和 VS Code UI 的宿主连接器不由编译器包自动代管，但均有稳定 adapter/bridge 合同。
