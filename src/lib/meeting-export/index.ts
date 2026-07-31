import { serializeMeetingCsv, serializeMeetingsListCsv } from "./csv";
import { serializeMeetingDocx } from "./docx";
import {
  MEETING_EXPORT_FORMATS,
  meetingExportFormatMeta,
} from "./formats-meta";
import { serializeMeetingJson, serializeMeetingsListJson } from "./json";
import { serializeMeetingMd } from "./md";
import { buildMeetingExportModel, safeExportFileName } from "./model";
import { serializeMeetingPdf } from "./pdf";
import { serializeMeetingSrt } from "./srt";
import { serializeMeetingTxt } from "./txt";
import type { MeetingExportFormat, MeetingExportModel } from "./types";
import { serializeMeetingVtt } from "./vtt";

import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";

export type MeetingExportPayload = {
  meeting: Meeting;
  timeline?: MeetingTimeline;
  transcript?: MeetingTranscript;
  summary?: string;
};

export type MeetingExportArtifact = {
  filename: string;
  mime: string;
  bytes: Uint8Array;
  /** UTF-8 text formats also expose string for tests */
  text?: string;
};

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export async function buildMeetingExportArtifact(
  model: MeetingExportModel,
  format: MeetingExportFormat,
  fontBytes?: Uint8Array,
): Promise<MeetingExportArtifact> {
  const meta = meetingExportFormatMeta(format);
  const base = safeExportFileName(model.title);
  const filename = `${base}.${meta.ext}`;

  switch (format) {
    case "txt": {
      const text = serializeMeetingTxt(model);
      return { filename, mime: meta.mime, bytes: textToBytes(text), text };
    }
    case "md": {
      const text = serializeMeetingMd(model);
      return { filename, mime: meta.mime, bytes: textToBytes(text), text };
    }
    case "json": {
      const text = serializeMeetingJson(model);
      return { filename, mime: meta.mime, bytes: textToBytes(text), text };
    }
    case "csv": {
      const text = serializeMeetingCsv(model);
      return { filename, mime: meta.mime, bytes: textToBytes(text), text };
    }
    case "srt": {
      const text = serializeMeetingSrt(model);
      return { filename, mime: meta.mime, bytes: textToBytes(text), text };
    }
    case "vtt": {
      const text = serializeMeetingVtt(model);
      return { filename, mime: meta.mime, bytes: textToBytes(text), text };
    }
    case "docx": {
      const bytes = await serializeMeetingDocx(model);
      return { filename, mime: meta.mime, bytes };
    }
    case "pdf": {
      const bytes = await serializeMeetingPdf(model, fontBytes);
      return { filename, mime: meta.mime, bytes };
    }
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unsupported format: ${_exhaustive}`);
    }
  }
}

function triggerDownload(filename: string, data: Uint8Array, mime: string) {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const blob = new Blob([copy], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 단일 회의 다운로드. 기본 포맷 txt. */
export async function exportMeetingDownload(
  payload: MeetingExportPayload,
  format: MeetingExportFormat = "txt",
) {
  const model = buildMeetingExportModel(payload);
  const artifact = await buildMeetingExportArtifact(model, format);
  triggerDownload(artifact.filename, artifact.bytes, artifact.mime);
}

/**
 * 목록 다중 다운로드.
 * csv/json: 합본 1파일. 그 외: 회의별 연속 다운로드.
 */
export async function exportMeetingsListDownload(
  meetings: Meeting[],
  format: MeetingExportFormat = "txt",
) {
  if (meetings.length === 0) return;

  if (format === "csv" || format === "json") {
    const models = meetings.map((meeting) =>
      buildMeetingExportModel({ meeting }),
    );
    const text =
      format === "csv"
        ? serializeMeetingsListCsv(models)
        : serializeMeetingsListJson(models);
    const meta = meetingExportFormatMeta(format);
    const bytes = new TextEncoder().encode(text);
    triggerDownload(
      `meetings-${meetings.length}.${meta.ext}`,
      bytes,
      meta.mime,
    );
    return;
  }

  for (const meeting of meetings) {
    await exportMeetingDownload({ meeting }, format);
  }
}

export {
  buildMeetingExportModel,
  MEETING_EXPORT_FORMATS,
  meetingExportFormatMeta,
  safeExportFileName,
  serializeMeetingTxt,
  serializeMeetingMd,
  serializeMeetingJson,
  serializeMeetingCsv,
  serializeMeetingSrt,
  serializeMeetingVtt,
};

export type { MeetingExportFormat, MeetingExportModel };
