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

const REQUIRED_AWS_KMS_ENV = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_KMS_CONTENT_KEY_ARN",
  "AWS_KMS_AUDIT_KEY_ARN",
] as const;

const REQUIRED_AWS_KMS_PROVISIONING_ENV = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
] as const;

const REQUIRED_GCP_KMS_ENV = [
  "GCP_PROJECT_ID",
  "GCP_KMS_LOCATION",
  "GCP_KMS_KEY_RING",
  "GCP_KMS_CONTENT_KEY",
  "GCP_KMS_AUDIT_KEY",
] as const;

const REQUIRED_GCP_KMS_PROVISIONING_ENV = [
  "GCP_PROJECT_ID",
  "GCP_KMS_LOCATION",
  "GCP_KMS_TEAM_KEY_RING",
] as const;

export type KmsProvider = "aws" | "gcp";

export function kmsProvider(
  env: RuntimeEnvironment = process.env,
): KmsProvider | null {
  if (env.GCP_KMS_ENABLED === "1") return "gcp";
  if (env.AWS_KMS_ENABLED === "1") return "aws";
  return null;
}

/**
 * KMS is deny-by-default. Local development, tests, previews, and builds cannot
 * call KMS even when cloud credentials were accidentally copied into the shell.
 */
export function evaluateKmsRuntime(
  env: RuntimeEnvironment = process.env,
): KmsRuntimeDecision {
  const provider = kmsProvider(env);
  if (!provider) {
    return { allowed: false, reason: "disabled" };
  }
  if (env.NODE_ENV !== "production") {
    return { allowed: false, reason: "non_production_node" };
  }
  const runtimeEnv =
    provider === "gcp" ? env.GCP_KMS_RUNTIME_ENV : env.AWS_KMS_RUNTIME_ENV;
  if (runtimeEnv !== "production") {
    return { allowed: false, reason: "non_production_runtime" };
  }

  const required =
    provider === "gcp" ? REQUIRED_GCP_KMS_ENV : REQUIRED_AWS_KMS_ENV;
  const missing = required.filter((name) => !env[name]?.trim());
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

export function evaluateKmsProvisioningRuntime(
  env: RuntimeEnvironment = process.env,
): KmsRuntimeDecision {
  const provider = kmsProvider(env);
  if (!provider) {
    return { allowed: false, reason: "disabled" };
  }
  if (env.NODE_ENV !== "production") {
    return { allowed: false, reason: "non_production_node" };
  }
  const runtimeEnv =
    provider === "gcp" ? env.GCP_KMS_RUNTIME_ENV : env.AWS_KMS_RUNTIME_ENV;
  if (runtimeEnv !== "production") {
    return { allowed: false, reason: "non_production_runtime" };
  }

  const required =
    provider === "gcp"
      ? REQUIRED_GCP_KMS_PROVISIONING_ENV
      : REQUIRED_AWS_KMS_PROVISIONING_ENV;
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    return { allowed: false, reason: "missing_configuration", missing };
  }
  return { allowed: true };
}
