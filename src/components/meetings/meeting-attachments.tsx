"use client";

import { VaultFileIcon } from "@/components/vault/vault-file-icon";
import type {
  MeetingTranscript,
  TranscriptAttachment,
  TranscriptAttachmentKind,
  TranscriptLine,
} from "@/types/transcript";

export type TranscriptFileItem = {
  lineId: string;
  time: string;
  speaker: string;
  attachment: TranscriptAttachment;
  segmentId?: string;
};

export function collectTranscriptFiles(
  transcript: MeetingTranscript | null | undefined,
): TranscriptFileItem[] {
  if (!transcript?.lines?.length) return [];
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

/** 다시보기 말풍선용 첨부 카드. 보관함 파일 아이콘 재사용. 색 면 없음. */
export function TranscriptAttachmentCard({
  attachment,
}: {
  attachment: TranscriptAttachment;
  hostSide?: boolean;
}) {
  return (
    <div className="w-full max-w-[15.75rem] shrink-0 overflow-hidden text-left text-foreground">
      <div className="flex items-center gap-3 py-1">
        <VaultFileIcon
          name={attachment.name}
          size={22}
          className="h-11 w-11 shrink-0 rounded-full border border-border bg-transparent"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-snug">
            {attachment.name}
          </p>
          <p className="mt-1 text-xs font-medium tabular-nums text-muted">
            {attachment.sizeLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * 대화에 올라온 첨부만 모아 보는 리스트.
 * 행 클릭 시 해당 대화 줄로 이동할 수 있게 onSelectLine 제공.
 * 종류별 색 면 없이 아이콘·텍스트·간격만으로 구분.
 */
export function MeetingAttachmentsList({
  transcript,
  onSelectLine,
}: {
  transcript?: MeetingTranscript | null;
  onSelectLine?: (lineId: string) => void;
}) {
  const files = collectTranscriptFiles(transcript);

  if (files.length === 0) {
    return (
      <section>
        <p className="py-8 text-center text-base text-muted">
          첨부된 파일이 없습니다.
        </p>
      </section>
    );
  }

  return (
    <section>
      <p className="text-sm font-semibold tabular-nums text-muted-2">
        {files.length}개
      </p>
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {files.map((item) => {
          return (
            <li key={item.lineId}>
              <button
                type="button"
                onClick={() => onSelectLine?.(item.lineId)}
                className="flex min-h-14 w-full min-w-0 items-center gap-3 bg-transparent py-3.5 text-left transition-opacity hover:opacity-80 sm:gap-4"
              >
                <VaultFileIcon
                  name={item.attachment.name}
                  size={22}
                  className="h-11 w-11 shrink-0 self-center rounded-full border border-border bg-transparent sm:h-12 sm:w-12"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-foreground">
                    {item.attachment.name}
                  </span>
                  <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-base text-muted">
                    <span className="tabular-nums">
                      {item.attachment.sizeLabel}
                    </span>
                    <span className="text-muted-2" aria-hidden>
                      ·
                    </span>
                    <span className="truncate">{item.speaker}</span>
                    <span className="text-muted-2" aria-hidden>
                      ·
                    </span>
                    <span className="tabular-nums">{item.time}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {onSelectLine ? (
        <p className="mt-3 text-base text-muted-2">
          파일을 누르면 해당 대화 위치로 이동합니다.
        </p>
      ) : null}
    </section>
  );
}
