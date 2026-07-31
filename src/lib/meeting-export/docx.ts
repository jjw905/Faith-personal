import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

import type { MeetingExportModel } from "./types";

function bodyPara(text: string, opts?: { bold?: boolean }) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text: text || " ",
        bold: opts?.bold,
        size: 22,
        font: "Malgun Gothic",
      }),
    ],
  });
}

function headingPara(
  text: string,
  level: (typeof HeadingLevel)[keyof typeof HeadingLevel],
) {
  return new Paragraph({
    heading: level,
    spacing: { before: 200, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: level === HeadingLevel.TITLE ? 32 : 26,
        font: "Malgun Gothic",
      }),
    ],
  });
}

/** Word OOXML. 줄바꿈은 Paragraph 분리. */
export async function serializeMeetingDocx(
  model: MeetingExportModel,
): Promise<Uint8Array> {
  const children: Paragraph[] = [
    headingPara(model.title, HeadingLevel.TITLE),
    bodyPara(`${model.date}, ${model.duration}`),
  ];

  if (model.summary) {
    children.push(headingPara("개요", HeadingLevel.HEADING_1));
    for (const line of model.summary.split(/\n/)) {
      children.push(bodyPara(line));
    }
  }
  if (model.decisions.length) {
    children.push(headingPara("결정", HeadingLevel.HEADING_1));
    for (const d of model.decisions) {
      children.push(bodyPara(`• ${d}`));
    }
  }
  if (model.actions.length) {
    children.push(headingPara("후속", HeadingLevel.HEADING_1));
    for (const a of model.actions) {
      const owner = a.owner.trim();
      children.push(bodyPara(owner ? `• ${owner}: ${a.task}` : `• ${a.task}`));
    }
  }
  if (model.segments.length) {
    children.push(headingPara("타임라인", HeadingLevel.HEADING_1));
    for (const s of model.segments) {
      children.push(
        bodyPara(`[${s.start}-${s.end}] ${s.title}`, { bold: true }),
      );
      if (s.summary) {
        for (const line of s.summary.split(/\n/)) children.push(bodyPara(line));
      }
    }
  }
  if (model.lines.length) {
    children.push(headingPara("대화기록", HeadingLevel.HEADING_1));
    for (const l of model.lines) {
      children.push(bodyPara(`${l.time} ${l.speaker}: ${l.text}`));
    }
  }

  const doc = new Document({
    title: model.title,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}
