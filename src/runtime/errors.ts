/** Typed errors exposed by the bounded BadodoScript runtime. */
export type RuntimeErrorCode =
  | "RUNTIME_UNSUPPORTED_OPERATION"
  | "RUNTIME_STEP_LIMIT"
  | "RUNTIME_LOOP_LIMIT"
  | "RUNTIME_CALL_DEPTH_LIMIT"
  | "RUNTIME_INVALID_VALUE"
  | "RUNTIME_HOST_FAILURE"
  | "RUNTIME_PROGRAM_INVALID";

export class RuntimeExecutionError extends Error {
  readonly code: RuntimeErrorCode;
  readonly line?: number;

  constructor(code: RuntimeErrorCode, message: string, line?: number, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "RuntimeExecutionError";
    this.code = code;
    this.line = line;
  }
}

export function asRuntimeHostFailure(error: unknown, operation: string, line?: number): RuntimeExecutionError {
  if (error instanceof RuntimeExecutionError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new RuntimeExecutionError("RUNTIME_HOST_FAILURE", `${operation} 失败: ${message}`, line, error);
}
