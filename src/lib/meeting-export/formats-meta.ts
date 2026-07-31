import type { MeetingExportFormat } from "./types";

export type MeetingExportFormatMeta = {
  id: MeetingExportFormat;
  label: string;
  ext: string;
  mime: string;
  /** Material Symbols Outlined 리가처 */
  symbol: string;
  /** Faith soft tone (meeting-attachments kindTone) */
  toneClass: string;
  blurb: string;
  phase: 1 | 2;
};

export const MEETING_EXPORT_FORMATS: MeetingExportFormatMeta[] = [
  {
    id: "txt",
    label: "TXT",
    ext: "txt",
    mime: "text/plain;charset=utf-8",
    symbol: "text_snippet",
    toneClass: "bg-[#e8eef8] text-[#3d5a8a]",
    blurb: "일반 텍스트",
    phase: 1,
  },
  {
    id: "md",
    label: "Markdown",
    ext: "md",
    mime: "text/markdown;charset=utf-8",
    symbol: "markdown",
    toneClass: "bg-[#e8eef8] text-[#3d5a8a]",
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
  },
  {
    id: "srt",
    label: "SRT",
    ext: "srt",
    mime: "application/x-subrip;charset=utf-8",
    symbol: "subtitles",
    toneClass: "bg-[#e8eef4] text-[#3d6a8a]",
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
    label: "Word",
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    symbol: "description",
    toneClass: "bg-[#e8eef8] text-[#3d5a8a]",
    blurb: "Word 문서",
    phase: 2,
  },
  {
    id: "pdf",
    label: "PDF",
    ext: "pdf",
    mime: "application/pdf",
    symbol: "picture_as_pdf",
    toneClass: "bg-[#f3e8e8] text-[#8a3d3d]",
    blurb: "PDF 문서",
    phase: 2,
  },
];

export function meetingExportFormatMeta(
  id: MeetingExportFormat,
): MeetingExportFormatMeta {
  const found = MEETING_EXPORT_FORMATS.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown export format: ${id}`);
  return found;
}
