import notificationsData from "@/mocks/notifications.json";
import type { AppNotification } from "@/types/notification";

export function getNotifications(): AppNotification[] {
  return notificationsData.items as AppNotification[];
}
