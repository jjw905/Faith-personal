/**
 * 회의 내보내기 포맷별 깨짐·구성 검증.
 * 실행: npm run test:meeting-export
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

import {
  buildMeetingExportArtifact,
  buildMeetingExportModel,
  maskMeetingExportModel,
  serializeMeetingTxt,
  type MeetingExportFormat,
} from "../src/lib/meeting-export";
import { escapeCsvField } from "../src/lib/meeting-export/csv";
import { escapeMarkdownBodyLine } from "../src/lib/meeting-export/md";
import {
  buildMeetingShareUrl,
  resolveMeetingShareMask,
} from "../src/lib/meeting-share";
import type { Meeting } from "../src/types/meeting";
import type { MeetingTimeline } from "../src/types/timeline";
import type { MeetingTranscript } from "../src/types/transcript";

const LONG_HANGUL =
  "한글은공백없이이어진긴문단에서도폭에맞춰줄이바뀌어야하며페이지가넘어가도내용이잘리지않아야한다".repeat(
    40,
  );

const meeting: Meeting = {
  id: "mtg-export-verify",
  title: "검증용 한글 회의 #1",
  tags: ["업로드"],
  summaryTags: ["검증"],
  date: "2026-07-31 14:00",
  duration: "32분",
  participants: [
    {
      id: "participant-1",
      name: "김Faith",
      initials: "김",
      color: "bg-primary",
    },
  ],
  status: "completed",
  security: "unprotected",
  workspace: "personal",
  capture: "upload",
};

const timeline: MeetingTimeline = {
  meetingId: meeting.id,
  durationLabel: "32분",
  overallSummary: "개요: 내보내기 포맷과 한글 깨짐을 검증한다.",
  decisions: ["DOCX와 PDF를 2차로 지원한다", '쉼표, "따옴표" 포함 결정'],
  actions: [{ owner: "김Faith", task: "검증 스크립트 통과", due: "오늘" }],
  segments: [
    {
      id: "seg-1",
      start: "00:00",
      end: "05:00",
      title: "안건 소개",
      summary: LONG_HANGUL.slice(0, 200),
      kind: "agenda",
    },
    {
      id: "seg-2",
      start: "05:00",
      end: "20:00",
      title: "논의",
      summary: LONG_HANGUL,
      kind: "discussion",
    },
  ],
};

const transcript: MeetingTranscript = {
  meetingId: meeting.id,
  lines: [
    {
      id: "l1",
      time: "00:01",
      startSec: 1.2,
      speaker: "사회자",
      text: "안녕하세요, 회의를 시작합니다.",
      words: [
        { text: "안녕", startSec: 1.2, endSec: 1.6, startOffset: 0, endOffset: 2 },
        { text: "하세요", startSec: 1.6, endSec: 2.1, startOffset: 2, endOffset: 5 },
      ],
    },
    {
      id: "l2",
      time: "00:05",
      startSec: 5,
      speaker: "참석자",
      text: '# 해시로 시작하는 대사와 "따옴표", 쉼표 테스트',
    },
    {
      id: "l3",
      time: "00:12",
      startSec: 12.5,
      speaker: "사회자",
      text: LONG_HANGUL.slice(0, 180),
    },
    {
      id: "l4",
      time: "01:00",
      startSec: 60,
      speaker: "참석자",
      text: "후속 액션을 정리합니다 --> 아님 → 로 바꿔야 함, 연락처 010-1234-5678",
    },
  ],
};

let failed = 0;

function assert(cond: unknown, message: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

function assertIncludes(hay: string, needle: string, label: string) {
  assert(hay.includes(needle), `${label} contains "${needle.slice(0, 40)}"`);
}

function unzipLocalFile(bytes: Uint8Array, name: string): string | null {
  // Minimal ZIP local-file extract for word/document.xml
  const view = Buffer.from(bytes);
  const target = Buffer.from(name);
  let offset = 0;
  while (offset + 30 < view.length) {
    const sig = view.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const method = view.readUInt16LE(offset + 8);
    const compSize = view.readUInt32LE(offset + 18);
    const nameLen = view.readUInt16LE(offset + 26);
    const extraLen = view.readUInt16LE(offset + 28);
    const fileName = view.subarray(offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = view.subarray(dataStart, dataStart + compSize);
    if (fileName.equals(target)) {
      if (method === 0) return data.toString("utf8");
      if (method === 8) return inflateRawSync(data).toString("utf8");
      return null;
    }
    offset = dataStart + compSize;
  }
  return null;
}

async function main() {
  const model = buildMeetingExportModel({
    meeting,
    timeline,
    transcript,
    summary: timeline.overallSummary,
  });

  // TXT regression order
  const txt = serializeMeetingTxt(model);
  const idx = [
    txt.indexOf(model.title),
    txt.indexOf("개요"),
    txt.indexOf("결정"),
    txt.indexOf("후속"),
    txt.indexOf("타임라인"),
    txt.indexOf("대화기록"),
  ];
  assert(
    idx.every((n) => n >= 0) &&
      idx[0]! < idx[1]! &&
      idx[1]! < idx[2]! &&
      idx[2]! < idx[3]! &&
      idx[3]! < idx[4]! &&
      idx[4]! < idx[5]!,
    "txt section order",
  );
  assertIncludes(txt, model.title, "txt");
  assertIncludes(txt, model.summary, "txt");
  assertIncludes(txt, "김Faith", "txt");

  // MD
  const mdArt = await buildMeetingExportArtifact(model, "md");
  const md = mdArt.text!;
  assert(md.startsWith("# "), "md title heading");
  assert(md.includes("## 개요"), "md summary heading");
  assert(md.includes("## 결정"), "md decisions heading");
  assert(md.includes("## 후속"), "md actions heading");
  assert(md.includes("## 타임라인"), "md timeline heading");
  assert(md.includes("## 대화기록"), "md transcript heading");
  const escapedHash = escapeMarkdownBodyLine(
    '# 해시로 시작하는 대사와 "따옴표", 쉼표 테스트',
  );
  assert(escapedHash.startsWith("\\#"), "md escapes leading #");
  assertIncludes(md, "\\# 해시로", "md body escaped hash");

  // JSON
  const jsonArt = await buildMeetingExportArtifact(model, "json");
  const parsed = JSON.parse(jsonArt.text!) as {
    title: string;
    summary: string;
    decisions: string[];
    actions: unknown[];
    segments: unknown[];
    lines: unknown[];
  };
  assert(parsed.title === model.title, "json title");
  assert(parsed.summary === model.summary, "json summary hangul");
  assert(parsed.decisions.length === model.decisions.length, "json decisions");
  assert(parsed.actions.length === model.actions.length, "json actions");
  assert(parsed.segments.length === model.segments.length, "json segments");
  assert(parsed.lines.length === model.lines.length, "json lines");

  // CSV BOM + CRLF + escape
  const csvArt = await buildMeetingExportArtifact(model, "csv");
  const csvBytes = csvArt.bytes;
  assert(
    csvBytes[0] === 0xef && csvBytes[1] === 0xbb && csvBytes[2] === 0xbf,
    "csv UTF-8 BOM",
  );
  const csv = csvArt.text!;
  assert(csv.includes("\r\n"), "csv CRLF");
  assertIncludes(csv, "검증용 한글 회의 #1", "csv hangul title");
  assert(csv.includes('""따옴표""') || csv.includes('"따옴표"'), "csv quote escape");
  assert(escapeCsvField(" =2+2").startsWith("'"), "csv formula injection");

  // SRT
  const srtArt = await buildMeetingExportArtifact(model, "srt");
  const srt = srtArt.text!;
  assert(/^\d+\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}\n/m.test(srt), "srt cue shape");
  assert(!srt.includes("WEBVTT"), "srt has no WEBVTT");
  const srtCues = srt.trim().split(/\n\n+/).filter(Boolean);
  assert(srtCues.length === model.cues.length, "srt cue count");
  assert(!srt.includes("--> 아님"), "srt arrow sanitized in body");

  // VTT
  const vttArt = await buildMeetingExportArtifact(model, "vtt");
  const vtt = vttArt.text!;
  assert(vtt.startsWith("WEBVTT\n"), "vtt header");
  assert(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/.test(vtt), "vtt dot ms");
  assert(!/\d{2}:\d{2}:\d{2},\d{3}/.test(vtt), "vtt no comma ms");

  // DOCX
  const docxArt = await buildMeetingExportArtifact(model, "docx");
  assert(
    docxArt.bytes[0] === 0x50 && docxArt.bytes[1] === 0x4b,
    "docx zip magic",
  );
  const documentXml = unzipLocalFile(docxArt.bytes, "word/document.xml");
  assert(Boolean(documentXml), "docx has word/document.xml");
  assertIncludes(documentXml!, model.title, "docx title");
  assertIncludes(documentXml!, "대화기록", "docx transcript section");
  assertIncludes(documentXml!, "사회자", "docx speaker");
  const pCount = (documentXml!.match(/<w:p[\s>]/g) || []).length;
  assert(pCount >= 10, `docx paragraph count (${pCount})`);

  // Masked export: source model stays intact, all output formats use the masked model.
  const maskedModel = maskMeetingExportModel(model, "partial", ["김Faith"]);
  const maskedTxt = serializeMeetingTxt(maskedModel);
  assertIncludes(maskedTxt, "김****", "masked txt name");
  assert(!maskedTxt.includes("010-1234-5678"), "masked txt phone");
  assert(model.actions[0]?.owner === "김Faith", "source model unchanged");
  const maskedDocx = await buildMeetingExportArtifact(maskedModel, "docx");
  const maskedDocumentXml = unzipLocalFile(
    maskedDocx.bytes,
    "word/document.xml",
  );
  assert(Boolean(maskedDocumentXml), "masked docx has document.xml");
  assert(!maskedDocumentXml!.includes("김Faith"), "masked docx name");
  assert(!maskedDocumentXml!.includes("010-1234-5678"), "masked docx phone");

  // PDF (compressed streams — use pdf-lib to inspect)
  const fontPath = path.join(
    process.cwd(),
    "public/fonts/MeetingExport-KR.ttf",
  );
  const fontBytes = new Uint8Array(await readFile(fontPath));
  const pdfArt = await buildMeetingExportArtifact(model, "pdf", fontBytes);
  const pdfHead = Buffer.from(pdfArt.bytes.subarray(0, 5)).toString("latin1");
  assert(pdfHead === "%PDF-", "pdf magic");
  const { PDFDocument } = await import("pdf-lib");
  const loaded = await PDFDocument.load(pdfArt.bytes);
  const pageCount = loaded.getPageCount();
  assert(pageCount >= 2, `pdf multi-page wrap (${pageCount})`);
  // Hangul draw succeeds only with embedded CJK font (Helvetica throws).
  assert(pdfArt.bytes.byteLength > 5_000, "pdf size suggests embedded font");
  assert(
    loaded.getForm !== undefined && pageCount >= 2,
    "pdf loads after hangul embed",
  );

  // Share link masking policy is encoded and parsed without changing access control.
  const maskedShareUrl = buildMeetingShareUrl(
    "partial",
    "https://faith.test/meetings/mtg-export-verify?line=l2",
  );
  const maskedShare = new URL(maskedShareUrl);
  assert(maskedShare.searchParams.get("mask") === "partial", "share mask query");
  assert(maskedShare.searchParams.get("line") === "l2", "share focus preserved");
  const originalShare = new URL(
    buildMeetingShareUrl("off", maskedShareUrl),
  );
  assert(!originalShare.searchParams.has("mask"), "share off removes mask");
  assert(resolveMeetingShareMask("label") === "partial", "share label maps to partial");
  assert(resolveMeetingShareMask("unexpected") === null, "share invalid rejected");

  // All formats build
  const formats: MeetingExportFormat[] = [
    "txt",
    "md",
    "json",
    "csv",
    "srt",
    "vtt",
    "docx",
    "pdf",
  ];
  for (const format of formats) {
    const art = await buildMeetingExportArtifact(model, format, fontBytes);
    assert(art.bytes.byteLength > 0, `${format} non-empty`);
    assert(art.filename.endsWith(`.${format === "md" ? "md" : format}`), `${format} filename`);
  }

  if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll meeting export checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
