"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { NotificationPanel } from "@/components/layout/notification-panel";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { defaultNotificationExamples } from "@/lib/notification-examples";
import { isNotificationChromePreview } from "@/lib/page-ux-registry";

type NotificationsUiValue = {
  open: boolean;
  openNotifications: () => void;
  closeNotifications: () => void;
};

const NotificationsUiContext = createContext<NotificationsUiValue | null>(null);

function emitNotificationsChanged(unreadCount?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("faith:notifications-changed", {
      detail: typeof unreadCount === "number" ? { unreadCount } : {},
    }),
  );
}

/**
 * 알림 센터 열기 상태를 앱 전체에서 공유한다.
 * 트리거는 사이드바 하단(데스크탑, 모바일 드로어)과
 * 화면별 하단 추적 바(모바일)에 함께 둔다.
 *
 * UX 미리보기·디자인 랩 알림 씬은 같은 사이드바 알림 센터에
 * 예시 데이터를 고정 오픈한다 (contained 미리보기 분리 없음).
 */
export function NotificationsUiProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { scenarioId } = usePageUxPreview();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [manualOpen, setManualOpen] = useState(false);

  const previewForced = isNotificationChromePreview({
    scenarioId,
    pathname,
    search: search ? `?${search}` : "",
  });
  const open = previewForced || manualOpen;

  const openNotifications = useCallback(() => setManualOpen(true), []);
  const closeNotifications = useCallback(() => {
    if (previewForced) return;
    setManualOpen(false);
  }, [previewForced]);

  // 미리보기 ↔ 사이드바/하단바 배지 동기화
  useEffect(() => {
    if (previewForced) {
      const unread = defaultNotificationExamples().filter((n) => n.unread)
        .length;
      emitNotificationsChanged(unread);
      return;
    }
    emitNotificationsChanged();
  }, [previewForced, scenarioId, pathname, search]);

  const value = useMemo(
    () => ({ open, openNotifications, closeNotifications }),
    [open, openNotifications, closeNotifications],
  );

  return (
    <NotificationsUiContext.Provider value={value}>
      {children}
      <NotificationPanel open={open} onClose={closeNotifications} />
    </NotificationsUiContext.Provider>
  );
}

export function useNotificationsUi(): NotificationsUiValue {
  const ctx = useContext(NotificationsUiContext);
  if (!ctx) {
    throw new Error(
      "useNotificationsUi must be used within NotificationsUiProvider",
    );
  }
  return ctx;
}
