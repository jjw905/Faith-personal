export type KmsRuntimeDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "disabled"
        | "non_production_node"
        | "non_production_runtime"
        | "missing_configuration";
      missing?: string[];
    };

type RuntimeEnvironment = Record<string, string | undefined>;

const REQUIRED_KMS_ENV = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_KMS_CONTENT_KEY_ARN",
  "AWS_KMS_AUDIT_KEY_ARN",
] as const;

/**
 * KMS is deny-by-default. Local development, tests, previews, and builds cannot
 * call KMS even when AWS credentials were accidentally copied into the shell.
 */
export function evaluateKmsRuntime(
  env: RuntimeEnvironment = process.env,
): KmsRuntimeDecision {
  if (env.AWS_KMS_ENABLED !== "1") {
    return { allowed: false, reason: "disabled" };
  }
  if (env.NODE_ENV !== "production") {
    return { allowed: false, reason: "non_production_node" };
  }
  if (env.AWS_KMS_RUNTIME_ENV !== "production") {
    return { allowed: false, reason: "non_production_runtime" };
  }

  const missing = REQUIRED_KMS_ENV.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    return { allowed: false, reason: "missing_configuration", missing };
  }
  return { allowed: true };
}

export function assertKmsRuntimeAllowed(
  env: RuntimeEnvironment = process.env,
): void {
  const decision = evaluateKmsRuntime(env);
  if (decision.allowed) return;

  const detail =
    decision.reason === "missing_configuration"
      ? ` Missing: ${decision.missing?.join(", ")}.`
      : "";
  throw new Error(`[KMS_BLOCKED] ${decision.reason}.${detail}`);
}
