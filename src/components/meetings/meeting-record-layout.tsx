"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * 회의 기록(`/meetings/[id]`) 클릭 시 레이아웃 — 제품 전면 프레임의 유일한 주축.
 * 다른 셸·카드·소프트 배경 프레임을 새로 만들지 말고 이것만 재활용한다.
 */

const BACK_CLASS =
  "-ml-2 h-12 gap-2 px-2.5 text-base font-semibold md:h-11 md:px-2.5";

/** 상단 헤더: 좌·우는 콘텐츠 폭(auto·shrink-0), 가운데만 말줄임.
 * 좁은 화면은 날짜 + 우측(… 도구) 한 줄.
 * `showLeadingOnMobile`: 생성 포털 등 돌아가기를 모바일에서도 표시. */
export function MeetingRecordHeaderRow({
  center,
  trailing,
  leading,
  showLeadingOnMobile = false,
  className,
}: {
  center: ReactNode;
  trailing?: ReactNode;
  /** 돌아가기·대시보드 CTA 등 */
  leading?: ReactNode;
  showLeadingOnMobile?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 items-center gap-2",
        showLeadingOnMobile
          ? "grid-cols-[auto_minmax(0,1fr)_auto] gap-2 md:gap-3"
          : "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-3",
        className,
      )}
    >
      <div
        className={cn(
          "min-w-0 shrink-0 items-center justify-start",
          showLeadingOnMobile
            ? "flex"
            : leading
              ? "hidden md:flex"
              : "hidden md:block",
        )}
      >
        {leading}
      </div>
      <div className="flex min-w-0 max-w-full items-center justify-center overflow-hidden px-1 md:col-start-2">
        {center}
      </div>
      <div className="flex shrink-0 items-center justify-end md:col-start-3">
        {trailing}
      </div>
    </div>
  );
}

export function MeetingRecordBackLink({
  href = "/dashboard",
  /** 상세와 동일: 모바일은 숨김. 오버레이 등에서만 항상 표시 */
  alwaysVisible = false,
}: {
  href?: string;
  alwaysVisible?: boolean;
}) {
  return (
    <Button
      asChild
      variant="ghost"
      className={cn(
        BACK_CLASS,
        alwaysVisible ? "inline-flex" : "hidden md:inline-flex",
      )}
    >
      <Link href={href}>
        <ChevronLeft className="h-6 w-6 md:h-5 md:w-5" strokeWidth={1.75} />
        돌아가기
      </Link>
    </Button>
  );
}

export function MeetingRecordBackButton({
  onClick,
  alwaysVisible = true,
}: {
  onClick: () => void;
  alwaysVisible?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        BACK_CLASS,
        alwaysVisible ? "inline-flex" : "hidden md:inline-flex",
      )}
    >
      <ChevronLeft className="h-6 w-6 md:h-5 md:w-5" strokeWidth={1.75} />
      돌아가기
    </Button>
  );
}

/** PageContainer 없는 내부 뼈대 (포털·임베드용) */
export function MeetingRecordChrome({
  back,
  headerCenter,
  trailing,
  leading,
  title,
  children,
  fillHeight = false,
  /** lg 이상에서 본문 2열용으로 폭을 키움 */
  wide = false,
  /** 돌아가기를 모바일에서도 헤더 좌측에 표시 (생성 포털·딥링크) */
  backAlwaysVisible = false,
  className,
}: {
  back?: ReactNode;
  headerCenter: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  fillHeight?: boolean;
  wide?: boolean;
  backAlwaysVisible?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        fillHeight
          ? "mx-auto flex min-h-[calc(100dvh-7rem)] flex-col"
          : "mx-auto space-y-5",
        wide ? "w-full max-w-3xl lg:max-w-none" : "max-w-3xl",
        className,
      )}
    >
      <div className={fillHeight ? "shrink-0" : undefined}>
        <MeetingRecordHeaderRow
          center={headerCenter}
          trailing={trailing}
          leading={back ?? leading}
          showLeadingOnMobile={backAlwaysVisible}
        />
        {title ? <div className="mt-4">{title}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** 회의 기록 상세와 동일한 페이지 프레임 */
export function MeetingRecordLayout({
  backHref = "/dashboard",
  backAlwaysVisible = false,
  onBack,
  headerCenter,
  trailing,
  title,
  children,
  fillHeight = false,
  wide = false,
}: {
  backHref?: string;
  backAlwaysVisible?: boolean;
  /** 있으면 Link 대신 버튼 */
  onBack?: () => void;
  headerCenter: ReactNode;
  trailing?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  fillHeight?: boolean;
  /** lg 이상 2열 본문용 */
  wide?: boolean;
}) {
  const back = onBack ? (
    <MeetingRecordBackButton onClick={onBack} alwaysVisible={backAlwaysVisible} />
  ) : (
    <MeetingRecordBackLink href={backHref} alwaysVisible={backAlwaysVisible} />
  );

  return (
    <PageContainer white>
      <MeetingRecordChrome
        back={back}
        backAlwaysVisible={backAlwaysVisible}
        headerCenter={headerCenter}
        trailing={trailing}
        title={title}
        fillHeight={fillHeight}
        wide={wide}
      >
        {children}
      </MeetingRecordChrome>
    </PageContainer>
  );
}

/**
 * 일정·기록 클릭 시와 같은 전면 포털 셸.
 * 회의록 생성 등 목록 위에 덮을 때 MeetingRecordChrome만 쓴다.
 */
export function MeetingRecordPortal({
  open,
  ariaLabel,
  onBack,
  headerCenter,
  trailing,
  leading,
  title,
  children,
  footer,
}: {
  open: boolean;
  ariaLabel: string;
  onBack: () => void;
  headerCenter: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onBack]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-white px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6.5rem)] pt-1 sm:px-6 sm:pb-10 sm:pt-2"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <MeetingRecordChrome
        back={<MeetingRecordBackButton onClick={onBack} alwaysVisible />}
        backAlwaysVisible
        leading={leading}
        headerCenter={headerCenter}
        trailing={trailing}
        title={title}
      >
        {children ? <div className="mt-5 space-y-5">{children}</div> : null}
        {footer ? <div className="pt-2">{footer}</div> : null}
      </MeetingRecordChrome>
    </div>,
    document.body,
  );
}
