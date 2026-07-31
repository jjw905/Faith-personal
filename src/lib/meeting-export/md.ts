import type { MeetingExportModel } from "./types";

/** 본문 줄이 ATX 헤더·리스트로 파싱되지 않게 선두 특수문자 이스케이프. */
export function escapeMarkdownBodyLine(line: string): string {
  if (!line) return line;
  return line.replace(/^([#>*+\-]\s?)/, "\\$1").replace(/^(\d+)\.\s/, "$1\\. ");
}

export function serializeMeetingMd(model: MeetingExportModel): string {
  const out: string[] = [
    `# ${escapeMarkdownBodyLine(model.title).replace(/^\\#\s?/, "")}`,
    "",
    `${model.date}, ${model.duration}`,
    "",
  ];

  if (model.summary) {
    out.push("## 개요", "", escapeMarkdownBodyLine(model.summary), "");
  }
  if (model.decisions.length) {
    out.push("## 결정", "");
    for (const d of model.decisions) {
      out.push(`- ${escapeMarkdownBodyLine(d)}`);
    }
    out.push("");
  }
  if (model.actions.length) {
    out.push("## 후속", "");
    for (const a of model.actions) {
      const owner = a.owner.trim();
      const task = escapeMarkdownBodyLine(a.task);
      out.push(`- ${owner ? `${owner}: ${task}` : task}`);
    }
    out.push("");
  }
  if (model.segments.length) {
    out.push("## 타임라인", "");
    for (const s of model.segments) {
      out.push(
        `- \`[${s.start}-${s.end}]\` ${escapeMarkdownBodyLine(s.title)}`,
      );
      if (s.summary) out.push(`  ${escapeMarkdownBodyLine(s.summary)}`);
    }
    out.push("");
  }
  if (model.lines.length) {
    out.push("## 대화기록", "");
    for (const l of model.lines) {
      out.push(
        `- **${l.time} ${escapeMarkdownBodyLine(l.speaker)}:** ${escapeMarkdownBodyLine(l.text)}`,
      );
    }
    out.push("");
  }
  return out.join("\n");
}
