import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const examplesDir = path.join(root, "examples");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "badodo-examples-"));

function normalizeText(value) {
  return value.replace(/\r\n/g, "\n");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const sources = fs.readdirSync(examplesDir)
  .filter((name) => name.endsWith(".bds"))
  .sort();
const failures = [];

try {
  if (sources.length === 0) throw new Error(`No .bds examples found in ${examplesDir}`);

  for (const sourceFile of sources) {
    const sourcePath = path.join(examplesDir, sourceFile);
    const outputFile = sourceFile.replace(/\.bds$/, ".ts");
    const outputPath = path.join(examplesDir, outputFile);
    const mapPath = `${outputPath}.map`;
    const source = fs.readFileSync(sourcePath, "utf8");

    try {
      assert.ok(fs.existsSync(outputPath), `missing expected output ${path.relative(root, outputPath)}`);
      assert.ok(fs.existsSync(mapPath), `missing expected source map ${path.relative(root, mapPath)}`);

      const result = compile(source, sourceFile);
      const expectedCode = `${result.typescript}\n//# sourceMappingURL=${outputFile}.map\n`;
      assert.equal(
        normalizeText(fs.readFileSync(outputPath, "utf8")),
        normalizeText(expectedCode),
        "TypeScript output differs from the compiler output",
      );
      assert.deepEqual(readJson(mapPath), JSON.parse(result.sourceMap ?? "null"), "source map differs from compiler output");

      const generatedPath = path.join(tempDir, outputFile);
      fs.writeFileSync(generatedPath, expectedCode, "utf8");
      fs.writeFileSync(`${generatedPath}.map`, result.sourceMap ?? "", "utf8");
      console.log(`OK ${sourceFile} -> ${outputFile}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${sourceFile}: ${message}`);
      console.error(`FAIL ${sourceFile}: ${message}`);
    }
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} example golden check(s) failed.`);
  process.exit(1);
}
console.log(`\nExample golden verification passed: ${sources.length} fixture(s).`);
