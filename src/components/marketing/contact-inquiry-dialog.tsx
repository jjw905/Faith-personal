"use client";

import { Check, Copy, Mail, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Input } from "@/components/ui/input";
import {
  SUPPORT_EMAIL,
  buildSupportMailto,
} from "@/lib/support-email";
import { cn } from "@/lib/utils";

const fieldCls =
  "h-11 rounded-xl border-border-strong bg-surface text-[15px] text-foreground placeholder:text-muted-2 focus-visible:ring-2 focus-visible:ring-primary";

type ContactInquiryDialogProps = {
  open: boolean;
  onClose: () => void;
  subject?: string;
  /** 디자인 랩: 프리뷰 영역 안에만 표시 */
  contained?: boolean;
};

/** 문의 팝업 — 수신 이메일 + 문의 작성. 배경 클릭/Esc로 닫힘. */
export function ContactInquiryDialog({
  open,
  onClose,
  subject = "Faith 문의",
  contained,
}: ContactInquiryDialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setEmail("");
    setMessage("");
    setError("");
    setCopied(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    prevFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const focusTimer = window.setTimeout(() => {
      emailRef.current?.focus();
    }, 20);

    if (!contained) {
      document.body.style.overflow = "hidden";
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      if (!contained) {
        document.body.style.overflow = "";
      }
      prevFocusRef.current?.focus?.();
    };
  }, [open, onClose, contained]);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("복사에 실패했습니다. 주소를 직접 선택해 주세요.");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const msg = message.trim();
    if (!msg) {
      setError("문의 내용을 입력해 주세요.");
      return;
    }
    setError("");

    const body = [
      "안녕하세요,",
      "",
      "문의 내용:",
      msg,
      "",
      email.trim() ? `회신 이메일: ${email.trim()}` : "",
      "",
      "---",
    ]
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .join("\n");

    window.location.href = buildSupportMailto({ subject, body });
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className={cn(
        "flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4",
        contained ? "absolute inset-0 z-10" : "fixed inset-0 z-[80]",
      )}
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="flex max-h-[min(92dvh,40rem)] w-full max-w-md flex-col rounded-t-3xl bg-card shadow-[0_16px_48px_rgba(17,24,39,0.22)] outline-none sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-lg font-bold tracking-tight text-foreground"
            >
              문의
            </h2>
            <p
              id={descId}
              className="mt-1 text-sm leading-relaxed text-muted"
            >
              이메일로 바로 보내거나, 아래에서 내용을 작성해 주세요.
            </p>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-border/60">
            <p className="text-xs font-semibold tracking-wide text-muted-2">
              수신 이메일
            </p>
            <div className="mt-2 flex items-center gap-2">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
              >
                {SUPPORT_EMAIL}
              </a>
              <button
                type="button"
                onClick={() => void copyEmail()}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  copied
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-foreground ring-1 ring-border-strong hover:bg-surface-2",
                )}
              >
                {copied ? (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={2} />
                )}
                {copied ? "복사됨" : "복사"}
              </button>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="contact-email"
                className="text-sm font-semibold text-foreground"
              >
                회신 이메일
                <span className="ml-1 font-medium text-muted-2">(선택)</span>
              </label>
              <Input
                ref={emailRef}
                id="contact-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={cn(fieldCls, "mt-1.5")}
              />
            </div>

            <div>
              <label
                htmlFor="contact-message"
                className="text-sm font-semibold text-foreground"
              >
                문의 내용
              </label>
              <textarea
                id="contact-message"
                required
                rows={5}
                placeholder="문의하실 내용을 적어 주세요."
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (error) setError("");
                }}
                className={cn(
                  fieldCls,
                  "mt-1.5 flex min-h-[8rem] w-full resize-y px-3 py-2.5 leading-relaxed",
                )}
              />
            </div>

            {error ? (
              <p className="text-sm font-medium text-red-700" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <Mail className="h-4 w-4" strokeWidth={2} />
              메일로 보내기
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
