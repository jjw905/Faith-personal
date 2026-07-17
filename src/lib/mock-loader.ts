import meetingsData from "@/mocks/meetings.json";
import securityMetricsData from "@/mocks/security-metrics.json";
import type { SecurityMetricsData } from "@/types/dashboard";
import type { Meeting } from "@/types/meeting";

export function getRecentMeetings(): Meeting[] {
  return meetingsData.meetings as Meeting[];
}

export function getSecurityMetrics(): SecurityMetricsData {
  return securityMetricsData as SecurityMetricsData;
}
