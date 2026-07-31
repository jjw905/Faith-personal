import type { MeetingExportModel } from "./types";

const UTF8_BOM = "\uFEFF";

/** RFC4180 필드 이스케이프. */
export function escapeCsvField(value: string): string {
  // 회의 제목·발화가 Excel 수식으로 실행되지 않도록 CSV injection 문자를
  // 데이터로 강제한다. 앞 공백 뒤 수식 기호도 Excel에서 해석될 수 있다.
  const safe = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function row(fields: string[]): string {
  return fields.map(escapeCsvField).join(",");
}

/** Excel 한글: UTF-8 BOM + CRLF. */
export function serializeMeetingCsv(model: MeetingExportModel): string {
  const lines = [
    row([
      "meetingId",
      "title",
      "date",
      "duration",
      "time",
      "speaker",
      "text",
    ]),
  ];
  if (model.lines.length === 0) {
    lines.push(
      row([
        model.meetingId,
        model.title,
        model.date,
        model.duration,
        "",
        "",
        "",
      ]),
    );
  } else {
    for (const l of model.lines) {
      lines.push(
        row([
          model.meetingId,
          model.title,
          model.date,
          model.duration,
          l.time,
          l.speaker,
          l.text,
        ]),
      );
    }
  }
  return UTF8_BOM + lines.join("\r\n") + "\r\n";
}

export function serializeMeetingsListCsv(models: MeetingExportModel[]): string {
  const lines = [
    row(["meetingId", "title", "date", "duration", "time", "speaker", "text"]),
  ];
  for (const model of models) {
    if (model.lines.length === 0) {
      lines.push(
        row([
          model.meetingId,
          model.title,
          model.date,
          model.duration,
          "",
          "",
          "",
        ]),
      );
      continue;
    }
    for (const l of model.lines) {
      lines.push(
        row([
          model.meetingId,
          model.title,
          model.date,
          model.duration,
          l.time,
          l.speaker,
          l.text,
        ]),
      );
    }
  }
  return UTF8_BOM + lines.join("\r\n") + "\r\n";
}
