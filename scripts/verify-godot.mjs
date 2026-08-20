import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateGodotRuntime } from "../dist/godot.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dotnetCommand = process.env.BDS_DOTNET ?? "dotnet";
const env = { ...process.env, DOTNET_CLI_HOME: process.env.DOTNET_CLI_HOME ?? path.join(root, ".tmp", "dotnet-home"), NUGET_PACKAGES: process.env.NUGET_PACKAGES ?? path.join(root, ".tmp", "nuget-packages"), APPDATA: path.join(root, ".tmp", "appdata"), DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1", DOTNET_CLI_TELEMETRY_OPTOUT: "1" };
fs.mkdirSync(env.DOTNET_CLI_HOME, { recursive: true });
fs.mkdirSync(env.NUGET_PACKAGES, { recursive: true });
fs.mkdirSync(env.APPDATA, { recursive: true });
const probe = spawnSync(dotnetCommand, ["--version"], { stdio: "ignore", env });
if (probe.error || probe.status !== 0) {
  console.log(".NET SDK not installed; Godot runtime projection check skipped.");
  process.exit(0);
}

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "bds-godot-runtime-"));
try {
  fs.writeFileSync(path.join(fixture, "runtime.cs"), generateGodotRuntime({ namespace: "Badodo.Test" }), "utf8");
  fs.writeFileSync(path.join(fixture, "BdsGodotFixture.csproj"), `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>`, "utf8");
  fs.writeFileSync(path.join(fixture, "NuGet.Config"), `<?xml version="1.0" encoding="utf-8"?><configuration><packageSources><clear /></packageSources></configuration>`, "utf8");
  fs.writeFileSync(path.join(fixture, "Program.cs"), `using Badodo.Test;\nvar runtime = new BadodoRuntime();\nvar frames = 0;\nruntime.OnFrame(time => frames++);\nruntime.Tick(0.25);\nif (frames != 1 || runtime.Time != 0.25) throw new Exception("runtime tick failed");\nruntime.RegisterNode("root", new object());\nif (runtime.ResolveNode("root") is null) throw new Exception("node registry failed");\nConsole.WriteLine("godot runtime ok");\n`, "utf8");
  for (const args of [["restore", "BdsGodotFixture.csproj", "--nologo", "--configfile", "NuGet.Config", "-v", "minimal"], ["build", "BdsGodotFixture.csproj", "--no-restore", "--nologo", "-v", "minimal"], ["run", "--project", "BdsGodotFixture.csproj", "--no-build", "--no-restore", "--nologo"]]) {
    const result = spawnSync(dotnetCommand, args, { cwd: fixture, env, encoding: "utf8" });
    process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
