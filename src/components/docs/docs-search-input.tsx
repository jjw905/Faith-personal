"use client";

import { Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

import { cn } from "@/lib/utils";

type ImeMode = "ko" | "en";

const IME_STORAGE_KEY = "faith-docs-ime-mode";

function readStoredIme(): ImeMode | null {
  try {
    const v = sessionStorage.getItem(IME_STORAGE_KEY);
    if (v === "ko" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function writeStoredIme(mode: ImeMode) {
  try {
    sessionStorage.setItem(IME_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function guessImeMode(): ImeMode {
  const stored = readStoredIme();
  if (stored) return stored;
  if (typeof navigator !== "undefined") {
    return navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
  }
  return "ko";
}

/** 포커스 시 한/영 힌트, 입력 시작하면 사라짐. */
export function useDocsImePlaceholder(value: string) {
  const [focused, setFocused] = useState(false);
  const [imeMode, setImeMode] = useState<ImeMode>("ko");

  useEffect(() => {
    setImeMode(guessImeMode());
  }, []);

  const setMode = useCallback((mode: ImeMode) => {
    setImeMode(mode);
    writeStoredIme(mode);
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing || e.key === "Process" || e.keyCode === 229) {
        setMode("ko");
        return;
      }
      if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
        setMode("en");
      }
    },
    [setMode],
  );

  const empty = value.length === 0;

  return {
    imeLabel: imeMode === "ko" ? "한" : "영",
    showImeHint: empty && focused,
    placeholder: empty && !focused ? "문서 검색..." : undefined,
    inputProps: {
      onFocus: () => {
        setImeMode(guessImeMode());
        setFocused(true);
      },
      onBlur: () => setFocused(false),
      onKeyDown,
      onCompositionStart: () => setMode("ko"),
    },
  };
}

export function DocsSearchInput({
  value,
  onChange,
  id,
  className,
  inputClassName,
  autoFocus,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const ime = useDocsImePlaceholder(value);

  return (
    <label
      className={cn(
        "relative flex h-11 w-full items-center rounded-xl border border-border bg-card px-3 transition-colors focus-within:border-border-strong focus-within:bg-surface",
        className,
      )}
    >
      <span className="sr-only">문서 검색</span>
      <Search
        className="h-4 w-4 shrink-0 text-muted"
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="relative min-w-0 flex-1">
        {ime.showImeHint ? (
          <span
            className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-2"
            aria-hidden
          >
            {ime.imeLabel}
          </span>
        ) : null}
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={ime.placeholder}
          className={cn(
            "w-full bg-transparent px-2.5 text-sm text-foreground outline-none placeholder:text-muted-2 [&::-webkit-search-cancel-button]:hidden",
            inputClassName,
          )}
          autoComplete="off"
          autoFocus={autoFocus}
          enterKeyHint="search"
          {...ime.inputProps}
        />
      </span>
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
          aria-label="검색어 지우기"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </label>
  );
}
