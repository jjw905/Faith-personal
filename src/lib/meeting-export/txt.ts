import type { MeetingExportModel } from "./types";

/** 기존 TXT 내보내기와 동일 섹션 순서. */
export function serializeMeetingTxt(model: MeetingExportModel): string {
  const lines: string[] = [
    model.title,
    `${model.date}, ${model.duration}`,
    "",
  ];
  if (model.summary) {
    lines.push("개요", model.summary, "");
  }
  if (model.decisions.length) {
    lines.push("결정");
    for (const d of model.decisions) lines.push(`- ${d}`);
    lines.push("");
  }
  if (model.actions.length) {
    lines.push("후속");
    for (const a of model.actions) {
      const owner = a.owner.trim();
      lines.push(`- ${owner ? `${owner}: ${a.task}` : a.task}`);
    }
    lines.push("");
  }
  if (model.segments.length) {
    lines.push("타임라인");
    for (const s of model.segments) {
      lines.push(`[${s.start}-${s.end}] ${s.title}`);
      if (s.summary) lines.push(s.summary);
    }
    lines.push("");
  }
  if (model.lines.length) {
    lines.push("대화기록");
    for (const l of model.lines) {
      lines.push(`[${l.time}] ${l.speaker}`, l.text, "");
    }
  }
  return lines.join("\n");
}
