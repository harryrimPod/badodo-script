import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateSharedArtifacts } from "../dist/shared.js";
import { generateSharedCSharp } from "../dist/shared-csharp.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dotnetCommand = process.env.BDS_DOTNET ?? "dotnet";
const toolEnv = { ...process.env };
if (!toolEnv.DOTNET_CLI_HOME) toolEnv.DOTNET_CLI_HOME = path.join(root, ".tmp", "dotnet-home");
if (!toolEnv.NUGET_PACKAGES) toolEnv.NUGET_PACKAGES = path.join(root, ".tmp", "nuget-packages");
toolEnv.APPDATA = path.join(root, ".tmp", "appdata");
toolEnv.DOTNET_SKIP_FIRST_TIME_EXPERIENCE ??= "1";
toolEnv.DOTNET_CLI_TELEMETRY_OPTOUT ??= "1";
fs.mkdirSync(toolEnv.DOTNET_CLI_HOME, { recursive: true });
fs.mkdirSync(toolEnv.NUGET_PACKAGES, { recursive: true });
fs.mkdirSync(toolEnv.APPDATA, { recursive: true });
const dotnetProbe = spawnSync(dotnetCommand, ["--version"], { stdio: "ignore", env: toolEnv });
if (dotnetProbe.error || dotnetProbe.status !== 0) {
  console.log(".NET SDK not installed; generated C# source check skipped.");
  process.exit(0);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "bds-csharp-"));
try {
  const artifacts = generateSharedArtifacts(`
@shared type DeviceState:
    id: string
    online: bool
`);
  const generated = generateSharedCSharp(artifacts.declarations, { namespace: "Badodo.Contracts" });
  fs.writeFileSync(path.join(fixture, "records.cs"), generated.records, "utf8");
  fs.writeFileSync(path.join(fixture, "BdsFixture.csproj"), `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
`, "utf8");
  fs.writeFileSync(path.join(fixture, "NuGet.Config"), `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
  </packageSources>
</configuration>
`, "utf8");
  fs.writeFileSync(path.join(fixture, "Program.cs"), `using System.Linq;
using System.Text.Json;
using Badodo.Contracts;

var valid = JsonSerializer.Deserialize<DeviceState>("""{"id":"D-1","online":true}""") ?? throw new Exception("valid payload did not deserialize");
if (valid.Validate().Count != 0) throw new Exception("valid payload failed validation");
var invalid = JsonSerializer.Deserialize<DeviceState>("""{"online":true}""") ?? throw new Exception("invalid payload did not deserialize");
if (!invalid.Validate().Any(error => error.Contains("required"))) throw new Exception("required presence was not detected");
`, "utf8");

  const nugetConfig = path.join(fixture, "NuGet.Config");
  const restore = spawnSync(dotnetCommand, ["restore", "BdsFixture.csproj", "--nologo", "--configfile", nugetConfig, "-v", "minimal"], { cwd: fixture, encoding: "utf8", env: toolEnv });
  process.stdout.write(restore.stdout ?? "");
  process.stderr.write(restore.stderr ?? "");
  if (restore.status !== 0) process.exit(restore.status ?? 1);
  const build = spawnSync(dotnetCommand, ["build", "BdsFixture.csproj", "--no-restore", "--nologo", "-v", "minimal"], { cwd: fixture, encoding: "utf8", env: toolEnv });
  process.stdout.write(build.stdout ?? "");
  process.stderr.write(build.stderr ?? "");
  if (build.status !== 0) process.exit(build.status ?? 1);
  const run = spawnSync(dotnetCommand, ["run", "--project", "BdsFixture.csproj", "--no-build", "--no-restore", "--nologo"], { cwd: fixture, encoding: "utf8", env: toolEnv });
  process.stdout.write(run.stdout ?? "");
  process.stderr.write(run.stderr ?? "");
  if (run.status !== 0) process.exit(run.status ?? 1);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
