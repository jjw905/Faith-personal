export type StatsAdminCategory =
  | "usage"
  | "pipeline"
  | "moderation"
  | "survey";

export function parseStatsCategory(
  value: string | null | undefined,
): StatsAdminCategory {
  if (
    value === "usage" ||
    value === "pipeline" ||
    value === "moderation" ||
    value === "survey"
  ) {
    return value;
  }
  return "usage";
}
