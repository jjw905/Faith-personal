import { defaultNotificationExamples } from "@/lib/notification-examples";
import type { AppNotification } from "@/types/notification";

/** 알림 센터 기본 예시 — UX 미리보기와 동일 소스. */
export function getNotifications(): AppNotification[] {
  return defaultNotificationExamples().map((n) => ({ ...n }));
}
