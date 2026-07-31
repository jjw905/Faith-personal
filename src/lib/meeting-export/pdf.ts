import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

import type { MeetingExportModel } from "./types";

const MARGIN = 48;
const FONT_SIZE = 11;
const TITLE_SIZE = 16;
const HEADING_SIZE = 13;
const LINE_HEIGHT = 16;
const TITLE_LINE = 22;
const HEADING_LINE = 20;

function wrapByGlyph(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  if (!text) return [""];
  const lines: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ch === "\n") {
      lines.push(line);
      line = "";
      continue;
    }
    const next = line + ch;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line.length > 0) {
      lines.push(line);
      line = ch;
    } else {
      line = next;
    }
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

type DrawCtx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  y: number;
  width: number;
  height: number;
};

function ensureSpace(ctx: DrawCtx, need: number) {
  if (ctx.y - need < MARGIN) {
    ctx.page = ctx.doc.addPage([ctx.width, ctx.height]);
    ctx.y = ctx.height - MARGIN;
  }
}

function drawWrapped(
  ctx: DrawCtx,
  text: string,
  size: number,
  lineH: number,
  emphasize = false,
) {
  const maxW = ctx.width - MARGIN * 2;
  const lines = wrapByGlyph(text, ctx.font, size, maxW);
  for (const line of lines) {
    ensureSpace(ctx, lineH);
    ctx.page.drawText(line || " ", {
      x: MARGIN,
      y: ctx.y - size,
      size,
      font: ctx.font,
      color: emphasize ? rgb(0.1, 0.1, 0.12) : rgb(0.15, 0.15, 0.18),
    });
    ctx.y -= lineH;
  }
}

function drawHeading(ctx: DrawCtx, label: string) {
  ctx.y -= 8;
  drawWrapped(ctx, label, HEADING_SIZE, HEADING_LINE, true);
  ctx.y -= 4;
}

/** Browser: fetch public font. Node callers pass fontBytes. */
export async function loadMeetingExportFontBytes(): Promise<Uint8Array> {
  const res = await fetch("/fonts/MeetingExport-KR.ttf");
  if (!res.ok) throw new Error("Failed to load MeetingExport-KR.ttf");
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * PDF: Hangul font embed (subset preferred for Acrobat), glyph wrap, page breaks.
 * Pass fontBytes in Node (verify script); browser may omit to fetch.
 */
export async function serializeMeetingPdf(
  model: MeetingExportModel,
  fontBytes?: Uint8Array,
): Promise<Uint8Array> {
  const bytes = fontBytes ?? (await loadMeetingExportFontBytes());
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  let font: PDFFont;
  try {
    font = await doc.embedFont(bytes, { subset: true });
  } catch {
    font = await doc.embedFont(bytes, { subset: false });
  }

  const pageSize: [number, number] = [595.28, 841.89];
  const first = doc.addPage(pageSize);
  const ctx: DrawCtx = {
    doc,
    page: first,
    font,
    y: pageSize[1] - MARGIN,
    width: pageSize[0],
    height: pageSize[1],
  };

  drawWrapped(ctx, model.title, TITLE_SIZE, TITLE_LINE, true);
  drawWrapped(ctx, `${model.date}, ${model.duration}`, FONT_SIZE, LINE_HEIGHT);
  ctx.y -= 6;

  if (model.summary) {
    drawHeading(ctx, "개요");
    drawWrapped(ctx, model.summary, FONT_SIZE, LINE_HEIGHT);
  }
  if (model.decisions.length) {
    drawHeading(ctx, "결정");
    for (const d of model.decisions) {
      drawWrapped(ctx, `• ${d}`, FONT_SIZE, LINE_HEIGHT);
    }
  }
  if (model.actions.length) {
    drawHeading(ctx, "후속");
    for (const a of model.actions) {
      const owner = a.owner.trim();
      drawWrapped(
        ctx,
        owner ? `• ${owner}: ${a.task}` : `• ${a.task}`,
        FONT_SIZE,
        LINE_HEIGHT,
      );
    }
  }
  if (model.segments.length) {
    drawHeading(ctx, "타임라인");
    for (const s of model.segments) {
      drawWrapped(
        ctx,
        `[${s.start}-${s.end}] ${s.title}`,
        FONT_SIZE,
        LINE_HEIGHT,
        true,
      );
      if (s.summary) drawWrapped(ctx, s.summary, FONT_SIZE, LINE_HEIGHT);
    }
  }
  if (model.lines.length) {
    drawHeading(ctx, "대화기록");
    for (const l of model.lines) {
      drawWrapped(
        ctx,
        `${l.time} ${l.speaker}: ${l.text}`,
        FONT_SIZE,
        LINE_HEIGHT,
      );
    }
  }

  return doc.save();
}
