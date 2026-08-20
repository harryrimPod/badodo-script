# Badodo Script GA-100 报告

日期：2026-08-20  
目标：Badodo 引擎工具内嵌脚本层  
版本：0.1.1（GA-100，已发布 v0.1.0；本版新增 bds run 与语法使用说明书，证据与契约不变）

## 结果

- `npm run verify`：通过。
- `npm run ga:gate`：通过，18 项静态发布契约检查。
- 浏览器：Chromium + Babylon WebGL2、签名包验签、AES-GCM、事件/每帧执行通过。
- 地图：MapLibre GL JS 4.7.1 + WebGL2、本地 style、marker click、fly_to 通过。
- Go：1.22.x 真实 HTTP/MQTT `go test` 通过。
- .NET：8.x 真实 Shared C# DTO restore/build/run 通过。
- Godot bridge：dependency-free C# runtime 真实 restore/build/run 通过。
- LSP：诊断、completion、hover 和 JSON-RPC initialize/completion/shutdown 通过。
- 安全：Ed25519 artifact、license 时间/feature、keyring 轮换、key/subject/artifact 吊销通过。
- npm：tarball、隔离安装、CommonJS/ESM API、CLI、`init`、实际编译通过。

## GA 边界

GA-100 表示本报告中的 Badodo 引擎工具契约全部有自动化证据；不表示 BDS 成为任意 TypeScript、Go、C# 或 Godot API 的通用替代品。具体宿主 SDK 包装、联网授权服务、计费、客户账户和审计由 Badodo 引擎产品层实现。

## 发布动作

1. `v0.1.0` 已推送到 GitHub 并创建 Release；`bds run` 与语法使用说明书随 `v0.1.1` 增量发布。
2. GitHub Actions CI 在 Node 20/22、Go 1.22、.NET 8 和 Chromium 上已通过。
3. npm `release.yml` 为可选（`NPM_TOKEN` + provenance）。
4. 后续 API 变更按 CHANGELOG 和兼容性报告推进。
