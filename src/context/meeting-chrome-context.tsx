"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type MeetingChromeContextValue = {
  /** 새 회의 등: 좌측 메뉴·헤더 숨김 */
  focusMode: boolean;
  setFocusMode: (value: boolean) => void;
};

const MeetingChromeContext = createContext<MeetingChromeContextValue | null>(
  null,
);

export function MeetingChromeProvider({ children }: { children: ReactNode }) {
  const [focusMode, setFocusModeState] = useState(false);
  const setFocusMode = useCallback((value: boolean) => {
    setFocusModeState(value);
  }, []);

  const value = useMemo(
    () => ({ focusMode, setFocusMode }),
    [focusMode, setFocusMode],
  );

  return (
    <MeetingChromeContext.Provider value={value}>
      {children}
    </MeetingChromeContext.Provider>
  );
}

export function useMeetingChrome() {
  const ctx = useContext(MeetingChromeContext);
  if (!ctx) {
    return {
      focusMode: false,
      setFocusMode: () => undefined,
    };
  }
  return ctx;
}
