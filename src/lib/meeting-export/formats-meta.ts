import type { MeetingExportFormat } from "./types";

export type MeetingExportFormatMeta = {
  id: MeetingExportFormat;
  label: string;
  ext: string;
  mime: string;
  /** @deprecated UI는 ExportFormatIcon 사용. 메타 호환용 */
  symbol: string;
  /** @deprecated UI는 ExportFormatIcon 사용. 메타 호환용 */
  toneClass: string;
  blurb: string;
  phase: 1 | 2;
  /** 최종 사용자에게 기본 노출하는 문서·업무용 포맷. */
  popular?: boolean;
};

export const MEETING_EXPORT_FORMATS: MeetingExportFormatMeta[] = [
  {
    id: "txt",
    label: "TXT",
    ext: "txt",
    mime: "text/plain;charset=utf-8",
    symbol: "notes",
    toneClass: "bg-[#f3efe6] text-[#7a5c2e]",
    blurb: "일반 텍스트",
    phase: 1,
    popular: true,
  },
  {
    id: "md",
    label: "Markdown",
    ext: "md",
    mime: "text/markdown;charset=utf-8",
    symbol: "code",
    toneClass: "bg-[#ebe8f4] text-[#5a4a7a]",
    blurb: "문서용 마크다운",
    phase: 1,
  },
  {
    id: "json",
    label: "JSON",
    ext: "json",
    mime: "application/json;charset=utf-8",
    symbol: "data_object",
    toneClass: "bg-[#e8ecef] text-[#3a4550]",
    blurb: "구조화 데이터",
    phase: 1,
  },
  {
    id: "csv",
    label: "CSV",
    ext: "csv",
    mime: "text/csv;charset=utf-8",
    symbol: "table_chart",
    toneClass: "bg-[#e7f2ea] text-[#2f6b45]",
    blurb: "표·엑셀",
    phase: 1,
    popular: true,
  },
  {
    id: "srt",
    label: "SRT",
    ext: "srt",
    mime: "application/x-subrip;charset=utf-8",
    symbol: "closed_caption",
    toneClass: "bg-[#e6f3f2] text-[#2f6b66]",
    blurb: "자막 (SubRip)",
    phase: 1,
  },
  {
    id: "vtt",
    label: "VTT",
    ext: "vtt",
    mime: "text/vtt;charset=utf-8",
    symbol: "subtitles",
    toneClass: "bg-[#e8eef4] text-[#3d6a8a]",
    blurb: "웹 자막 (WebVTT)",
    phase: 1,
  },
  {
    id: "docx",
    label: "DOCX",
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    symbol: "draft",
    toneClass: "bg-[#e8eef8] text-[#3d5a8a]",
    blurb: "한글·Word",
    phase: 2,
    popular: true,
  },
  {
    id: "pdf",
    label: "PDF",
    ext: "pdf",
    mime: "application/pdf",
    symbol: "picture_as_pdf",
    toneClass: "bg-[#f3e8e8] text-[#8a3d3d]",
    blurb: "문서",
    phase: 2,
    popular: true,
  },
];

/** 사용자 화면에서 우선 제공하는 일반 문서 포맷. HWP 대신 한글 호환 DOCX를 사용한다. */
export const POPULAR_MEETING_EXPORT_FORMATS = MEETING_EXPORT_FORMATS.filter(
  (format) => format.popular,
);

export function meetingExportFormatMeta(
  id: MeetingExportFormat,
): MeetingExportFormatMeta {
  const found = MEETING_EXPORT_FORMATS.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown export format: ${id}`);
  return found;
}
