"use client";

import { ChevronLeft, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useState,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Soft canvas — matches account/settings (`--background` #fbfbfd). */
const AUTH_BG = "#fbfbfd";

/** Elevated card — same elevation as account/settings panels. */
export const AUTH_CARD =
  "rounded-3xl bg-card shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border";

export const AUTH_CARD_PAD = "px-6 py-6 sm:px-[30px] sm:py-7";

/** AUTH_CARD + 공통 패딩. */
export const AUTH_CARD_BOX = `${AUTH_CARD} ${AUTH_CARD_PAD}`;

/** 인증 알림 배너 (본문 text-base, iOS/모바일 규칙). */
export const AUTH_ALERT =
  "rounded-xl px-3 py-2 text-base leading-snug";
export const AUTH_ALERT_ERROR = `${AUTH_ALERT} bg-masked-soft text-masked`;
export const AUTH_ALERT_INFO = `${AUTH_ALERT} bg-surface text-muted`;
export const AUTH_ALERT_SUCCESS = `${AUTH_ALERT} bg-surface text-foreground`;

/** 필드 아래 검증 힌트 (배너보다 한 단계 가볍게). */
export const AUTH_FIELD_HINT_ERROR =
  "mt-1 text-base leading-snug text-masked";

export const AUTH_FIELD_HINT =
  "mt-1.5 text-base text-muted";

export const AUTH_LABEL =
  "mb-1.5 block text-base font-semibold text-foreground";

/** Faith 모바일 입력 h-14 + text-lg (web.dev/MD: ≥16px, 모바일 가독성). */
export const AUTH_FIELD_INPUT =
  "h-14 border-border bg-card text-lg focus-visible:ring-primary/30";

/** 비밀번호 + 보기 토글(48). 글자수 카운터 없음(업계: 보기 토글+규칙 힌트). */
export const AUTH_PASSWORD_INPUT =
  "h-14 border-border bg-card pr-12 text-lg focus-visible:ring-primary/30";

export const AUTH_PRIMARY_BTN =
  "flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60";

export const AUTH_SECONDARY_BTN =
  "flex min-h-12 w-full items-center justify-center rounded-xl border border-border bg-card text-base font-semibold text-foreground transition-colors hover:bg-surface disabled:opacity-60";

/** 페이지 h1 아래 카드 간격. */
export const AUTH_CARD_OFFSET = "mt-4 sm:mt-5";

/** 로그인·가입 진입: Linear/Notion류 짧은 fade-up. */
export const authEnter = "auth-enter";

export function authEnterDelay(step: 1 | 2 | 3) {
  return `auth-enter-d${step}` as const;
}

/** 비밀번호 입력 + 보기 토글 (web.dev / Shopify / Google 권장). */
export function AuthPasswordField({
  id,
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  className,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={AUTH_PASSWORD_INPUT}
        required={required}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
        className="absolute inset-y-0 right-0 flex min-h-12 min-w-12 items-center justify-center text-muted transition-colors hover:text-foreground"
      >
        {visible ? (
          <EyeOff className="h-5 w-5" strokeWidth={2} aria-hidden />
        ) : (
          <Eye className="h-5 w-5" strokeWidth={2} aria-hidden />
        )}
      </button>
    </div>
  );
}

const authBackClassName =
  "-ml-1 inline-flex h-12 min-h-12 items-center gap-1.5 rounded-xl px-1 text-base text-muted transition-colors hover:bg-surface hover:text-foreground";

/** Faith 돌아가기 — ChevronLeft + 라벨, 터치 48. */
export function AuthBackLink({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(authBackClassName, className)}>
      <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      돌아가기
    </Link>
  );
}

/** Faith 돌아가기 — 버튼 버전(단계 전환 등). */
export function AuthBackButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(authBackClassName, className)}
    >
      <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      돌아가기
    </button>
  );
}

/** 페이지 제목 블록 (h1 + 선택 부제). 모바일은 밀도↑ (MD3/NN content-to-chrome). */
export function AuthPageTitle({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-center", className)}>
      <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-1.5 text-base text-muted sm:mt-2">{subtitle}</p>
      ) : null}
    </div>
  );
}

const authFlowBackClassName =
  "inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface hover:text-foreground";

/**
 * 다단계 인증: 뒤로+제목 한 줄 (iOS inline / MD3 small top app bar).
 * NN/g content-to-chrome: 세로 스택(뒤로·큰 제목)을 없애 본문 간섭을 줄임.
 * 좁은 폭에서 제목과 겹치지 않도록 뒤로는 아이콘+aria (라벨은 목록→상세용 AuthBack* 유지).
 */
export function AuthFlowHeading({
  title,
  subtitle,
  onBack,
  backHref,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  onBack?: () => void;
  backHref?: string;
  className?: string;
}) {
  const backIcon = (
    <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
  );

  return (
    <div className={cn(className)}>
      <div className="flex min-h-12 items-center gap-1">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="돌아가기"
            className={authFlowBackClassName}
          >
            {backIcon}
          </button>
        ) : backHref ? (
          <Link
            href={backHref}
            aria-label="돌아가기"
            className={authFlowBackClassName}
          >
            {backIcon}
          </Link>
        ) : null}
        <h1 className="min-w-0 flex-1 text-lg font-bold tracking-tight text-foreground sm:text-xl">
          {title}
        </h1>
      </div>
      {subtitle ? (
        <p
          className={cn(
            "mt-1 text-base leading-snug text-muted sm:mt-1.5",
            onBack || backHref ? "pl-12" : null,
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

/** 카드 안 섹션 제목 + 굵은 구분선. */
export function AuthSectionHeader({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
    </div>
  );
}

type AuthCardDivProps = {
  as?: "div";
} & HTMLAttributes<HTMLDivElement>;

type AuthCardFormProps = {
  as: "form";
} & FormHTMLAttributes<HTMLFormElement>;

/** 인증 카드 — 선택적 섹션 제목 + 패딩 통일. */
export function AuthCard({
  title,
  className,
  children,
  as = "div",
  ...rest
}: {
  title?: string;
  className?: string;
  children: ReactNode;
} & (AuthCardDivProps | AuthCardFormProps)) {
  const body = (
    <>
      {title ? <AuthSectionHeader title={title} /> : null}
      {title ? <div className="mt-5">{children}</div> : children}
    </>
  );

  const boxClass = cn(AUTH_CARD_BOX, className);

  if (as === "form") {
    const formProps = rest as FormHTMLAttributes<HTMLFormElement>;
    return (
      <form className={boxClass} {...formProps}>
        {body}
      </form>
    );
  }

  const divProps = rest as HTMLAttributes<HTMLDivElement>;
  return (
    <div className={boxClass} {...divProps}>
      {body}
    </div>
  );
}

/** Login keeps default; signup / forgot / reset sit a bit higher. */
const contentPad = {
  default: "pt-1 pb-24 sm:pt-3 sm:pb-36",
  raised: "pt-0 pb-36 sm:pt-0 sm:pb-52",
} as const;

/** 인증 페이지 — 오버스크롤 시 흰 여백이 보이지 않도록 html/body 배경을 맞춤. */
export function AuthShell({
  children,
  mainClassName,
  contentAlign = "default",
  embedded = false,
}: {
  children: ReactNode;
  mainClassName?: string;
  /** `raised` = less top / more bottom pad (signup, forgot, reset). */
  contentAlign?: keyof typeof contentPad;
  /** 디자인 랩 등 임베드: document 배경 조작 없이 min-h-full. */
  embedded?: boolean;
}) {
  useEffect(() => {
    if (embedded) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.backgroundColor;
    const prevBody = body.style.backgroundColor;
    const prevHtmlOverscroll = html.style.overscrollBehaviorY;
    const prevBodyOverscroll = body.style.overscrollBehaviorY;

    html.style.backgroundColor = AUTH_BG;
    body.style.backgroundColor = AUTH_BG;
    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";

    return () => {
      html.style.backgroundColor = prevHtml;
      body.style.backgroundColor = prevBody;
      html.style.overscrollBehaviorY = prevHtmlOverscroll;
      body.style.overscrollBehaviorY = prevBodyOverscroll;
    };
  }, [embedded]);

  return (
    <div
      className={cn(
        "flex flex-col overflow-x-hidden bg-background",
        embedded ? "min-h-full" : "min-h-dvh",
      )}
      style={embedded ? { backgroundColor: AUTH_BG } : undefined}
    >
      {/* NN/g: sticky/chrome은 가능한 한 작게(~48–56). 불투명 배경. */}
      <header className="shrink-0 bg-background">
        <div className="mx-auto flex h-12 w-full max-w-[min(100%,80rem)] items-center px-4 sm:h-14 sm:px-6">
          {embedded ? (
            <span className="text-xl font-bold tracking-tight text-foreground">
              Faith
            </span>
          ) : (
            <Link
              href="/"
              className="inline-flex min-h-12 items-center text-xl font-bold tracking-tight text-foreground"
            >
              Faith
            </Link>
          )}
        </div>
      </header>

      <main
        className={cn("flex flex-1 justify-center px-4 sm:px-6", mainClassName)}
      >
        <div
          className={cn(
            /* justify-center는 콘텐츠가 뷰포트보다 길면 상·하단이 잘림 → start + pad */
            "flex w-full max-w-md flex-col justify-start",
            embedded ? "pb-16 pt-4 sm:pb-20" : contentPad[contentAlign],
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
