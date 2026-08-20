/**
 * Minimal v3 source map generator with line-level mappings.
 *
 * Produces a valid source map that lets browser DevTools show the original
 * `.bds` source and map breakpoints/errors back to source lines. Column-level
 * precision is omitted (all segments map to column 0) which is sufficient for
 * line-oriented debugging.
 */

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function vlqEncode(value: number): string {
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
  let result = "";
  do {
    let digit = vlq & 0x1f;
    vlq >>>= 5;
    if (vlq > 0) digit |= 0x20;
    result += BASE64[digit];
  } while (vlq > 0);
  return result;
}

export interface Mapping {
  generatedLine: number; // 1-based
  sourceLine: number; // 1-based
}

export interface SourceMapOptions {
  file: string;
  source: string;
  sourceContent: string;
  mappings: Mapping[];
}

export function generateSourceMap(opts: SourceMapOptions): string {
  const sorted = [...opts.mappings].sort((a, b) => a.generatedLine - b.generatedLine);

  let prevSourceLine = 0;
  const lineSegments: string[] = [];
  let lastGeneratedLine = 0;

  for (const m of sorted) {
    // Emit empty lines (just ";") for any generated lines skipped between mappings.
    while (lastGeneratedLine < m.generatedLine - 1) {
      lineSegments.push("");
      lastGeneratedLine++;
    }
    const genCol = 0;
    const srcIdx = 0;
    const srcLineDelta = m.sourceLine - prevSourceLine;
    const srcCol = 0;
    prevSourceLine = m.sourceLine;
    lineSegments.push(vlqEncode(genCol) + vlqEncode(srcIdx) + vlqEncode(srcLineDelta) + vlqEncode(srcCol));
    lastGeneratedLine = m.generatedLine;
  }

  const map = {
    version: 3,
    file: opts.file,
    sources: [opts.source],
    sourcesContent: [opts.sourceContent],
    names: [],
    mappings: lineSegments.join(";"),
  };

  return JSON.stringify(map);
}
