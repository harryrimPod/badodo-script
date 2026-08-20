import { SharedArtifacts } from "../shared";
import { SharedValidationResult, validateSharedValue } from "../shared-rc";

/** Validate a record at an application ingress without executing BDS code. */
export function validateSharedIngress(
  value: unknown,
  declaration: string,
  artifacts: SharedArtifacts,
): SharedValidationResult {
  return validateSharedValue(value, declaration, artifacts);
}

export class SharedIngressValidationError extends Error {
  readonly result: SharedValidationResult;

  constructor(declaration: string, result: SharedValidationResult) {
    super(`Shared ingress 校验失败 (${declaration}): ${result.errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
    this.name = "SharedIngressValidationError";
    this.result = result;
  }
}

/** Validate and return the value before handing it to an adapter or runtime. */
export function assertSharedIngress<T>(
  value: T,
  declaration: string,
  artifacts: SharedArtifacts,
): T {
  const result = validateSharedIngress(value, declaration, artifacts);
  if (!result.valid) throw new SharedIngressValidationError(declaration, result);
  return value;
}
