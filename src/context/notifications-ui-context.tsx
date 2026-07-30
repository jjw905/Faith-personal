"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { NotificationPanel } from "@/components/layout/notification-panel";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { isPageUxNotificationScenario } from "@/lib/page-ux-registry";

type NotificationsUiValue = {
  open: boolean;
  openNotifications: () => void;
  closeNotifications: () => void;
};

const NotificationsUiContext = createContext<NotificationsUiValue | null>(null);

/**
 * 알림 센터 열기 상태를 앱 전체에서 공유한다.
 * 트리거는 사이드바 하단(데스크탑, 모바일 드로어)과
 * 화면별 하단 추적 바(모바일)에 함께 둔다.
 */
export function NotificationsUiProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { scenarioId } = usePageUxPreview();
  const [manualOpen, setManualOpen] = useState(false);
  // 디자인 랩 시나리오는 패널을 고정 오픈하고 닫기를 막는다
  const previewForced = isPageUxNotificationScenario(scenarioId);
  const open = previewForced || manualOpen;

  const openNotifications = useCallback(() => setManualOpen(true), []);
  const closeNotifications = useCallback(() => {
    if (previewForced) return;
    setManualOpen(false);
  }, [previewForced]);

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
