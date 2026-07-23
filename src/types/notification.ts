export type NotificationType = "masking" | "access" | "storage" | "system";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** 상대 시각 표시용 */
  time: string;
  unread: boolean;
  createdAt?: string;
  readAt?: string | null;
};
