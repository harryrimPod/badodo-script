/** Stable wire contract for encrypted BDS payloads. */
export const BDS_PAYLOAD_VERSION = 1;

export interface BdsPayload {
  version: number;
  nodeNames: string[];
  code: string;
}

export interface PayloadValidationError {
  path: string;
  keyword: "type" | "required" | "version" | "string" | "duplicate" | "additionalProperties";
  message: string;
}

export interface PayloadValidationResult {
  valid: boolean;
  errors: PayloadValidationError[];
}

export class PayloadValidationErrorException extends Error {
  readonly errors: PayloadValidationError[];

  constructor(errors: PayloadValidationError[]) {
    super(`BDS payload 校验失败: ${errors.map((error) => `${error.path} ${error.message}`).join("; ")}`);
    this.name = "PayloadValidationErrorException";
    this.errors = errors;
  }
}

/** Validate the decrypted payload without executing its code. */
export function validateBdsPayload(value: unknown, expectedVersion = BDS_PAYLOAD_VERSION): PayloadValidationResult {
  const errors: PayloadValidationError[] = [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: [{ path: "$", keyword: "type", message: "payload 必须是 object" }] };
  }

  const object = value as Record<string, unknown>;
  const required: Array<keyof BdsPayload> = ["version", "nodeNames", "code"];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) {
      errors.push({ path: `$.${key}`, keyword: "required", message: "字段缺失" });
    }
  }

  for (const key of Object.keys(object).sort()) {
    if (!required.includes(key as keyof BdsPayload)) {
      errors.push({ path: `$.${key}`, keyword: "additionalProperties", message: "不允许额外字段" });
    }
  }

  if (Object.prototype.hasOwnProperty.call(object, "version")) {
    if (typeof object.version !== "number" || !Number.isInteger(object.version)) {
      errors.push({ path: "$.version", keyword: "type", message: "version 必须是整数" });
    } else if (object.version !== expectedVersion) {
      errors.push({ path: "$.version", keyword: "version", message: `不支持的 payload version: ${object.version}` });
    }
  }

  if (Object.prototype.hasOwnProperty.call(object, "nodeNames")) {
    if (!Array.isArray(object.nodeNames)) {
      errors.push({ path: "$.nodeNames", keyword: "type", message: "nodeNames 必须是数组" });
    } else {
      const seen = new Set<string>();
      for (let index = 0; index < object.nodeNames.length; index++) {
        const name = object.nodeNames[index];
        const path = `$.nodeNames[${index}]`;
        if (typeof name !== "string") {
          errors.push({ path, keyword: "string", message: "节点名必须是字符串" });
          continue;
        }
        if (name.length === 0) errors.push({ path, keyword: "string", message: "节点名不能为空" });
        if (seen.has(name)) errors.push({ path, keyword: "duplicate", message: `节点名重复: ${name}` });
        seen.add(name);
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(object, "code") && typeof object.code !== "string") {
    errors.push({ path: "$.code", keyword: "type", message: "code 必须是字符串" });
  }

  return { valid: errors.length === 0, errors };
}

/** Validate and narrow a decrypted payload before any code execution. */
export function assertBdsPayload(value: unknown, expectedVersion = BDS_PAYLOAD_VERSION): BdsPayload {
  const result = validateBdsPayload(value, expectedVersion);
  if (!result.valid) throw new PayloadValidationErrorException(result.errors);
  return value as BdsPayload;
}
