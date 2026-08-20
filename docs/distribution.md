# Badodo Script 分发说明 / Distribution Guide

## 中文

### 两种发布资产

| 资产 | 用途 | 运行时要求 |
|---|---|---|
| `badodo-script-<version>-windows-x64.zip` | Windows 零安装 CLI | 无需安装 Node.js；内嵌 Node.js 20+ |
| `badodo-script-<version>-dist.zip` | 可审计的 Node 分发包 | Node.js 20+；已包含 `wabt` 与示例 |
| `badodo-script-<version>-core.zip` | 轻量 Node CLI | Node.js 20+；不含 WASM 工具和示例 |

Windows 包中的 `bds.exe` 是 Node SEA 单文件程序，`bds doctor` 会显示
`standalone 内嵌`，并明确提示 LSP 作为独立 Node 包能力提供。发布前请用
`SHA256SUMS.txt` 校验文件完整性。当前构建未配置 Authenticode 证书，签名应在
企业发布流水线中完成。

```powershell
.\bds.exe --version
.\bds.exe doctor
.\bds.exe run examples/door.bds
```

在仓库根目录重建资产：

```powershell
npm ci
npm run package:standalone
npm run package:node-dist
npm run package:node-core
npm run test:standalone
```

### 资产边界

- standalone 包内嵌编译器、运行时、WASM 编译器和 `collectNodes` fixture，并附带 `examples/`。
- Node 分发包保留 `dist/`、类型声明、source map、示例和 `wabt`，适合审计、二次集成和离线 CI。
- Core 包只保留编译器和 CLI，适合生产镜像；需要 WASM 时使用完整 Node 分发包。
- Babylon.js、MapLibre GL JS、Go、.NET 和 Godot 宿主仍按项目需要单独安装；它们不被打进 CLI 二进制。
- 两种资产均为 MIT 许可证；第三方依赖继续遵守各自许可证和归属要求。

## English

### Release assets

| Asset | Use | Runtime requirement |
|---|---|---|
| `badodo-script-<version>-windows-x64.zip` | Zero-install Windows CLI | No Node.js install; embeds Node.js 20+ |
| `badodo-script-<version>-dist.zip` | Auditable Node distribution | Node.js 20+; includes `wabt` and examples |
| `badodo-script-<version>-core.zip` | Lightweight Node CLI | Node.js 20+; excludes WASM tooling and examples |

The Windows archive contains a Node SEA single-file `bds.exe`. `bds doctor` reports
the embedded runtime and explains that LSP is provided by the separate Node package.
Verify the archive with `SHA256SUMS.txt`. The current local build is not
Authenticode-signed; apply the organization certificate in the release pipeline.

```powershell
.\bds.exe --version
.\bds.exe doctor
.\bds.exe run examples/door.bds
```

Rebuild both assets from the repository root:

```powershell
npm ci
npm run package:standalone
npm run package:node-dist
npm run package:node-core
npm run test:standalone
```

### Boundaries

- The standalone archive embeds the compiler, runtime, WASM compiler, and `collectNodes` fixture, and includes `examples/`.
- The Node distribution keeps `dist/`, declarations, source maps, examples, and `wabt` for audit, integration, and offline CI.
- The core archive keeps only the compiler and CLI for production images; use the full Node distribution for WASM.
- Babylon.js, MapLibre GL JS, Go, .NET, and Godot hosts remain separately installed by the consuming project.
- Both assets are MIT-licensed; third-party dependencies retain their own license and attribution requirements.
