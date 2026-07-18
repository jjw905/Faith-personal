export type NotificationType = "masking" | "access" | "storage" | "system";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  time: string;
  unread: boolean;
};
