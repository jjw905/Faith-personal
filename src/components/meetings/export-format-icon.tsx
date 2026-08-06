import type { ReactNode } from "react";

import type { MeetingExportFormat } from "@/lib/meeting-export";
import { cn } from "@/lib/utils";

/**
 * 내보내기 포맷용 시중 파일 형식 아이콘.
 * 테두리·섹션 배경 없이 문서 실루엣만 (선택 상태는 부모에서 표시).
 */
export function ExportFormatIcon({
  format,
  className,
  size = 40,
}: {
  format: MeetingExportFormat;
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {iconFor(format, size)}
    </span>
  );
}

function iconFor(format: MeetingExportFormat, size: number) {
  switch (format) {
    case "docx":
      return <WordDocIcon size={size} />;
    case "pdf":
      return <PdfDocIcon size={size} />;
    case "csv":
      return <ExcelDocIcon size={size} />;
    case "txt":
      return <TxtDocIcon size={size} />;
    case "md":
      return <MarkdownDocIcon size={size} />;
    case "json":
      return <JsonDocIcon size={size} />;
    case "srt":
    case "vtt":
      return <CaptionDocIcon size={size} />;
    default:
      return <TxtDocIcon size={size} />;
  }
}

function DocShell({
  size,
  fill,
  fold,
  children,
}: {
  size: number;
  fill: string;
  fold: string;
  children?: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 4.5C8 3.119 9.119 2 10.5 2H24l8 8v25.5c0 1.381-1.119 2.5-2.5 2.5h-19C9.119 38 8 36.881 8 35.5V4.5Z"
        fill={fill}
      />
      <path d="M24 2v6.5c0 .828.672 1.5 1.5 1.5H34L24 2Z" fill={fold} />
      {children}
    </svg>
  );
}

function WordDocIcon({ size }: { size: number }) {
  return (
    <DocShell size={size} fill="#2B579A" fold="#1E3F73">
      <text
        x="20"
        y="27"
        textAnchor="middle"
        fill="#fff"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="13"
        fontWeight="700"
        letterSpacing="-0.02em"
      >
        W
      </text>
    </DocShell>
  );
}

function PdfDocIcon({ size }: { size: number }) {
  return (
    <DocShell size={size} fill="#E5252A" fold="#B01C20">
      <text
        x="20"
        y="26.5"
        textAnchor="middle"
        fill="#fff"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="8.5"
        fontWeight="800"
        letterSpacing="0.02em"
      >
        PDF
      </text>
    </DocShell>
  );
}

function ExcelDocIcon({ size }: { size: number }) {
  return (
    <DocShell size={size} fill="#217346" fold="#165A33">
      <text
        x="20"
        y="27"
        textAnchor="middle"
        fill="#fff"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="13"
        fontWeight="700"
        letterSpacing="-0.02em"
      >
        X
      </text>
    </DocShell>
  );
}

function TxtDocIcon({ size }: { size: number }) {
  return (
    <DocShell size={size} fill="#6B7280" fold="#4B5563">
      <path
        d="M13 18h14M13 22.5h14M13 27h9"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </DocShell>
  );
}

function MarkdownDocIcon({ size }: { size: number }) {
  return (
    <DocShell size={size} fill="#5A4A7A" fold="#3F3558">
      <text
        x="20"
        y="26.5"
        textAnchor="middle"
        fill="#fff"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="9"
        fontWeight="700"
      >
        MD
      </text>
    </DocShell>
  );
}

function JsonDocIcon({ size }: { size: number }) {
  return (
    <DocShell size={size} fill="#3A4550" fold="#2A3238">
      <text
        x="20"
        y="26.5"
        textAnchor="middle"
        fill="#fff"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        fontSize="8"
        fontWeight="700"
      >
        {"{ }"}
      </text>
    </DocShell>
  );
}

function CaptionDocIcon({ size }: { size: number }) {
  return (
    <DocShell size={size} fill="#2F6B66" fold="#23524E">
      <rect
        x="12"
        y="19"
        width="16"
        height="8"
        rx="1.5"
        stroke="#fff"
        strokeWidth="1.75"
        fill="none"
      />
      <path
        d="M15 23h4M21 23h4"
        stroke="#fff"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </DocShell>
  );
}
