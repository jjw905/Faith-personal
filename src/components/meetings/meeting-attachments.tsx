"use client";

import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  Presentation,
} from "lucide-react";

import type {
  MeetingTranscript,
  TranscriptAttachment,
  TranscriptAttachmentKind,
  TranscriptLine,
} from "@/types/transcript";
import { cn } from "@/lib/utils";

export type TranscriptFileItem = {
  lineId: string;
  time: string;
  speaker: string;
  attachment: TranscriptAttachment;
  segmentId?: string;
};

export function collectTranscriptFiles(
  transcript: MeetingTranscript,
): TranscriptFileItem[] {
  return transcript.lines
    .filter((l): l is TranscriptLine & { attachment: TranscriptAttachment } =>
      Boolean(l.attachment),
    )
    .map((l) => ({
      lineId: l.id,
      time: l.time,
      speaker: l.speaker,
      attachment: l.attachment,
      segmentId: l.segmentId,
    }));
}

export function resolveAttachmentKind(
  attachment: TranscriptAttachment,
): TranscriptAttachmentKind {
  if (attachment.kind) return attachment.kind;
  const ext = (attachment.name.split(".").pop() ?? "").toLowerCase();
  if (["wav", "mp3", "m4a", "aac", "ogg", "flac"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx", "txt", "rtf", "md"].includes(ext)) return "doc";
  if (["xls", "xlsx", "csv", "tsv"].includes(ext)) return "sheet";
  if (["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext)) return "image";
  if (["ppt", "pptx", "key"].includes(ext)) return "slide";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
  if (["js", "ts", "tsx", "json", "py", "yml", "yaml"].includes(ext)) {
    return "code";
  }
  return "file";
}

function kindLabel(kind: TranscriptAttachmentKind) {
  switch (kind) {
    case "audio":
      return "오디오";
    case "pdf":
      return "PDF";
    case "doc":
      return "문서";
    case "sheet":
      return "표";
    case "image":
      return "이미지";
    case "slide":
      return "슬라이드";
    case "archive":
      return "압축";
    case "code":
      return "코드";
    default:
      return "파일";
  }
}

function KindIcon({
  kind,
  className,
}: {
  kind: TranscriptAttachmentKind;
  className?: string;
}) {
  const cls = cn("h-4 w-4 shrink-0", className ?? "text-muted");
  const sw = 1.75;
  switch (kind) {
    case "audio":
      return <FileAudio className={cls} strokeWidth={sw} />;
    case "pdf":
      return <FileType2 className={cls} strokeWidth={sw} />;
    case "doc":
      return <FileText className={cls} strokeWidth={sw} />;
    case "sheet":
      return <FileSpreadsheet className={cls} strokeWidth={sw} />;
    case "image":
      return <FileImage className={cls} strokeWidth={sw} />;
    case "slide":
      return <Presentation className={cls} strokeWidth={sw} />;
    case "archive":
      return <FileArchive className={cls} strokeWidth={sw} />;
    case "code":
      return <FileCode2 className={cls} strokeWidth={sw} />;
    default:
      return <File className={cls} strokeWidth={sw} />;
  }
}

function kindTone(kind: TranscriptAttachmentKind, hostSide: boolean) {
  if (hostSide) return "bg-white/15 text-primary-foreground";
  switch (kind) {
    case "audio":
      return "bg-[#e8eef4] text-[#3d6a8a]";
    case "pdf":
      return "bg-[#f3e8e8] text-[#8a3d3d]";
    case "doc":
      return "bg-[#e8eef8] text-[#3d5a8a]";
    case "sheet":
      return "bg-[#e7f2ea] text-[#2f6b45]";
    case "image":
      return "bg-[#f0ebe6] text-[#7a5c3e]";
    case "slide":
      return "bg-[#f3ebe4] text-[#8a5a28]";
    case "archive":
      return "bg-[#eeeaf4] text-[#5a3d8a]";
    case "code":
      return "bg-[#e8ecef] text-[#3a4550]";
    default:
      return "bg-surface-2 text-muted";
  }
}

/** 새 회의 첨부 카드와 같은 톤 — 다시보기 말풍선용. */
export function TranscriptAttachmentCard({
  attachment,
  hostSide,
}: {
  attachment: TranscriptAttachment;
  hostSide: boolean;
}) {
  const kind = resolveAttachmentKind(attachment);
  const ext = (attachment.name.split(".").pop() ?? "file").toUpperCase();

  return (
    <div
      className={cn(
        "w-full max-w-[15.75rem] overflow-hidden rounded-2xl text-left shadow-soft",
        hostSide
          ? "rounded-bl-md bg-primary text-primary-foreground"
          : "rounded-br-md bg-card text-foreground ring-1 ring-border",
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl",
            kindTone(kind, hostSide),
          )}
        >
          <KindIcon
            kind={kind}
            className={hostSide ? "text-primary-foreground" : undefined}
          />
          <span className="mt-0.5 text-[8px] font-bold leading-none tracking-wide opacity-80">
            {ext}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-snug">
            {attachment.name}
          </p>
          <p
            className={cn(
              "mt-1 text-[11px] font-medium tabular-nums",
              hostSide ? "text-primary-foreground/75" : "text-muted",
            )}
          >
            {kindLabel(kind)} {attachment.sizeLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * 대화에 올라온 첨부만 모아 보는 리스트.
 * 행 클릭 시 해당 대화 줄로 이동할 수 있게 onSelectLine 제공.
 */
export function MeetingAttachmentsList({
  transcript,
  onSelectLine,
}: {
  transcript: MeetingTranscript;
  onSelectLine?: (lineId: string) => void;
}) {
  const files = collectTranscriptFiles(transcript);

  if (files.length === 0) {
    return (
      <section>
        <p className="py-8 text-center text-sm text-muted">
          첨부된 파일이 없습니다.
        </p>
      </section>
    );
  }

  return (
    <section>
      <p className="mb-3 text-xs font-medium tabular-nums text-muted-2">
        {files.length}개
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-soft">
        {files.map((item) => {
          const kind = resolveAttachmentKind(item.attachment);
          const ext = (
            item.attachment.name.split(".").pop() ?? "file"
          ).toUpperCase();
          return (
            <li key={item.lineId}>
              <button
                type="button"
                onClick={() => onSelectLine?.(item.lineId)}
                className="flex w-full min-w-0 items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-surface sm:px-4"
              >
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl",
                    kindTone(kind, false),
                  )}
                >
                  <KindIcon kind={kind} />
                  <span className="mt-0.5 text-[8px] font-bold leading-none opacity-80">
                    {ext}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {item.attachment.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-medium text-muted">
                    {kindLabel(kind)} {item.attachment.sizeLabel}
                    <span className="text-muted-2"> , </span>
                    {item.speaker}
                    <span className="text-muted-2"> , </span>
                    <span className="tabular-nums">{item.time}</span>
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {onSelectLine ? (
        <p className="mt-2 text-[11px] font-medium text-muted-2">
          파일을 누르면 해당 대화 위치로 이동합니다.
        </p>
      ) : null}
    </section>
  );
}
