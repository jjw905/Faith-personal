export type NotificationType =
  | "masking"
  | "access"
  | "storage"
  | "system"
  | "invite"
  | "team"
  | "meeting"
  /** 운영 공지 */
  | "urgent";

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
  data?: Record<string, unknown>;
};

/** 긴급: 운영 공지·보안·명시 priority. system은 일반. */
export function isUrgentNotification(
  type: NotificationType,
  data?: Record<string, unknown> | null,
): boolean {
  if (type === "urgent" || type === "access") return true;
  if (data?.priority === "urgent" || data?.urgent === true) return true;
  return false;
}

/** 안 읽음 목록: 긴급 먼저, 그다음 최신순. */
export function sortNotificationsUrgentFirst(
  items: AppNotification[],
): AppNotification[] {
  return [...items].sort((a, b) => {
    const ua = isUrgentNotification(a.type, a.data);
    const ub = isUrgentNotification(b.type, b.data);
    if (ua !== ub) return ua ? -1 : 1;
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}
