import securityMetricsData from "@/mocks/security-metrics.json";
import type { SecurityMetricsData } from "@/types/dashboard";

export function getSecurityMetrics(): SecurityMetricsData {
  return securityMetricsData as SecurityMetricsData;
}
