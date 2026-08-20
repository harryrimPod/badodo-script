import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export interface CacheableCompileResult {
  typescript: string;
  sourceMap?: string;
}

export interface CompileCacheOptions {
  cacheDir?: string;
  enabled?: boolean;
  compilerVersion: string;
}

export interface CompileCacheStats {
  hits: number;
  misses: number;
}

/**
 * Content-addressed disk cache for deterministic BDS compilation.
 * The cache is deliberately a small JSON format so it can be inspected or
 * removed without a special tool. A compiler/version/options change naturally
 * produces a new key and never reuses stale output.
 */
export class CompileCache {
  private readonly cacheDir: string;
  private readonly enabled: boolean;
  private readonly compilerVersion: string;
  private hits = 0;
  private misses = 0;

  constructor(options: CompileCacheOptions) {
    this.cacheDir = path.resolve(options.cacheDir ?? ".bds-cache");
    this.enabled = options.enabled !== false;
    this.compilerVersion = options.compilerVersion;
  }

  get stats(): CompileCacheStats {
    return { hits: this.hits, misses: this.misses };
  }

  getOrCompile<T extends CacheableCompileResult>(
    source: string,
    sourceName: string,
    options: unknown,
    compileFn: () => T,
  ): T {
    if (!this.enabled) return compileFn();
    const key = this.key(source, sourceName, options);
    const file = path.join(this.cacheDir, `${key}.json`);
    const cached = this.read<T>(file);
    if (cached) {
      this.hits += 1;
      return cached;
    }

    this.misses += 1;
    const result = compileFn();
    this.write(file, result);
    return result;
  }

  clear(): void {
    if (fs.existsSync(this.cacheDir)) fs.rmSync(this.cacheDir, { recursive: true, force: true });
  }

  private key(source: string, sourceName: string, options: unknown): string {
    return crypto.createHash("sha256").update(JSON.stringify({
      compilerVersion: this.compilerVersion,
      sourceName,
      options,
      source,
    })).digest("hex");
  }

  private read<T extends CacheableCompileResult>(file: string): T | undefined {
    try {
      const value: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!value || typeof value !== "object") return undefined;
      const result = value as { typescript?: unknown; sourceMap?: unknown };
      if (typeof result.typescript !== "string") return undefined;
      if (result.sourceMap !== undefined && typeof result.sourceMap !== "string") return undefined;
      return result as T;
    } catch {
      return undefined;
    }
  }

  private write(file: string, result: CacheableCompileResult): void {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(result), "utf8");
      fs.renameSync(temporary, file);
    } catch {
      // Compilation remains successful when a read-only or interrupted cache
      // directory is encountered. The next invocation simply recompiles.
    }
  }
}
