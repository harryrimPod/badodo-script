# Changelog

## 0.1.1 - 2026-08-20

- Added `bds run`: compile-and-run in a single command with local fixture nodes (Python-like DX).
- Added syntax user guide `docs/syntax-guide.md`.
- Updated GitHub release notes and README for `bds run`.

## 0.1.0 - 2026-08-19

- First public technical-preview BDS compiler package.
- Added strict compile, Shared Model RC, payload ingress validation and transport-neutral Go projection.
- Added opt-in type-preserving TypeScript projection with `emitTypes`.
- Added Windows CRLF support and production encryption-key enforcement.
- Added constrained Go `net/http` JSON adapter projection with deterministic routes and validation/error mapping.
- Added broker-neutral Go MQTT JSON adapter projection with exact topics, QoS 0/1 and response-topic mapping.
- Added Shared C# DTO projection with System.Text.Json metadata, nullable types, wire presence and validation.
- Added reproducible build, verification and npm package file policy.
- Added npm-standard distribution: `npx`/global CLI usage, `bds init`, `bds doctor`, public package exports, local tarball smoke test and provenance release workflow.
- Added GA language core: Map literals, module imports, async/await, named record/enum declarations, Option/Result standard helpers.
- Added dependency-free C# Godot runtime bridge with real .NET 8 compile/run evidence.
- Added `bds-lsp`, LSP protocol smoke, VS Code language package, issuer keyring rotation and revocation policy APIs.
- Added GA-100 contract and static release gate covering browser, cross-language, editor, security, and npm evidence.
