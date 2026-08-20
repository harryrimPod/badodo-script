import * as AST from "./ast";

/**
 * Phase 0 normalized representation. This is deliberately syntax-preserving;
 * it is a conformance anchor, not yet the typed multi-target IR.
 */
export interface NormalizedProgram {
  version: "0.1";
  kind: "Program";
  body: NormalizedStmt[];
}

export type NormalizedStmt = Record<string, unknown> & { kind: string };

/** Remove source locations so fixtures compare semantic shape rather than text. */
export function normalizeProgram(program: AST.Program): NormalizedProgram {
  return {
    version: "0.1",
    kind: "Program",
    body: program.body.map((stmt) => normalizeNode(stmt) as NormalizedStmt),
  };
}

function normalizeNode(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeNode);
  if (node === null || typeof node !== "object") return node;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "line" || key === "col") continue;
    result[key] = normalizeNode(value);
  }
  return result;
}

