# BDS 发布与上线清单

## 本地发布前

```bash
npm ci
npx playwright install chromium
npm run verify
npm pack --dry-run
```

`npm run verify` 必须完成构建、全部单元/运行时/投影/生产硬化测试。发布包只包含 `dist`、文档、许可证和变更记录，不包含源码、demo 或工作区配置。

GitHub Actions 在 CI 和发布工作流中使用 `npx playwright install --with-deps chromium`，因此真实 Babylon/MapLibre WebGL2 smoke 不会退化为 fake runtime 或静默跳过。

## 下载与使用

`badodo-script` 尚未发布到 npm 注册表。在发布之前，用户无需克隆仓库，直接从 GitHub 安装：

```bash
# 一次性运行，不写入全局环境
npx --yes github:harryrimPod/badodo-script --version
npx --yes github:harryrimPod/badodo-script init my-bds-project

# 项目级安装（init 生成的 package.json 已依赖 github:harryrimPod/badodo-script）
cd my-bds-project
npm install
npm run compile
```

全局安装 git 依赖（`npm install --global github:...`）在 npm 10 下构建失败，暂不支持。npm 发布完成后再恢复 `npx badodo-script` / `npm install badodo-script` 写法。

Node API 也可直接导入：

```js
const { compile } = require("badodo-script");
const result = compile("speed = 1", "inline.bds");
console.log(result.typescript);
```

`npm run test:package` 会执行完整本地发行验证：`npm pack`、隔离目录安装、CommonJS API 导入、CLI 版本检查、`init` 脚手架和真实 `.bds` 编译。发布工作流位于 `.github/workflows/release.yml`，由仓库管理员手动触发，并使用 npm provenance。

## CLI 编译

```bash
npx bds compile script.bds --strict --nodes door,light --target web --emit-types
```

生产编译应使用 Strict Compile、显式节点清单和明确 target。发布生成的 `.ts` 与 `.ts.map` 应作为同一组制品保存。

Go service 需要 HTTP 时，使用 `generateGoHTTP(...)` 生成三件套，并在宿主 Go 项目中运行其标准库测试；`npm run test:server-http-go` 在 CI 的 Go toolchain 上执行真实 `go test`，本机未安装 Go 时会明确跳过；本阶段不会自动生成认证、动态路由或 MQTT 语义。

Go service 需要 MQTT 时，使用 `generateGoMQTT(...)` 生成三件套，并由宿主实现 `MQTTTransport`；`npm run test:server-mqtt-go` 在 CI 的 Go toolchain 上执行真实 `go test`。broker SDK、认证/TLS、QoS 2 和重连策略不由生成器代管。

Godot/.NET 宿主需要共享数据时，使用 `generateSharedCSharp(...)` 生成 `records.cs`，并使用 `generateGodotRuntime()` 生成节点/事件/每帧 bridge；`npm run test:shared-csharp-dotnet` 与 `npm run test:godot-dotnet` 在 CI 的 .NET 8 SDK 上执行真实编译/运行。

## 加密打包

```bash
npx bds pack script.bds -k "$BDS_PACK_KEY"
```

`BDS_PACK_KEY` 至少 16 个字符；不要把密钥写进仓库、package.json、demo 或浏览器 bundle。加密格式属于混淆级保护，浏览器端密钥仍可被运行时提取。

## 回滚

保留上一版本的 npm tarball、生成的 `.ts/.map/.bds.bin` 和对应 SHA-256 清单。新版本验证失败时，回滚制品而不是覆盖旧制品。
