/**
 * 의미 보정(맥락 정리) 평가
 * - 입력: STT(+화자) 텍스트
 * - 출력: 전체요약, 타임라인(누가/무엇을), 결정, 액션
 * - 평가: 속기 대비 의미 회수 (CER 아님)
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const OUT = ".data/stt-bench";

const SAMPLES = [
  {
    id: "assembly",
    name: "추경 의결",
    stt: join(OUT, "assembly__gpt-4o-transcribe-diarize__diarized.txt"),
    reference: join(OUT, "reference.txt"),
  },
  {
    id: "assembly2",
    name: "인사청문 일정",
    stt: join(OUT, "assembly2__gpt-4o-transcribe-diarize__diarized.txt"),
    reference: join(OUT, "assembly2-reference.txt"),
  },
  {
    id: "ktv",
    name: "KTV 브리핑",
    stt: join(OUT, "ktv__gpt-4o-transcribe-diarize__diarized.txt"),
    reference: join(OUT, "ktv-reference.txt"),
  },
] as const;

const STRUCTURE_SYSTEM = `너는 회의록 정리 전문가다.
입력은 STT 결과(화자 라벨 포함 가능)다. 원문 단어를 고치지 말고, 의미만 정리한다.

반드시 JSON만 출력:
{
  "overallSummary": "회의 전체 요약 2~4문장",
  "timeline": [
    { "title": "구간 제목", "speakers": ["화자 A"], "summary": "누가 무엇을 말했는지" }
  ],
  "decisions": ["결정·의결·합의 내용"],
  "actions": [
    { "owner": "담당(화자 라벨 또는 역할)", "task": "할 일", "due": "기한(없으면 빈 문자열)" }
  ]
}

규칙:
- 타임라인은 시간순, 5개 내외
- 액션/결정은 입력에 근거가 있을 때만
- 추측으로 인물 실명을 지어내지 말 것 (입력이 화자 A면 화자 A 유지)
- 없는 사실을 만들지 말 것`;

const JUDGE_SYSTEM = `너는 회의록 의미 평가자다.
기준문(속기 또는 공식 텍스트)과 정리본(JSON)을 비교한다.
문자 일치(CER)는 보지 말고, 의미·사실·역할·후속조치만 본다.

JSON만 출력:
{
  "factCoverage": 0-100,
  "speakerAttribution": 0-100,
  "decisionCapture": 0-100,
  "actionCapture": 0-100,
  "hallucinationPenalty": 0-100,
  "overall": 0-100,
  "notes": ["짧은 메모"]
}

점수 기준:
- factCoverage: 기준문의 핵심 안건·수치가 정리본에 의미상 포함되면 가점
- speakerAttribution: 누가 무엇을 했는지 구분·표현이 유용하면 가점 (라벨만 있어도 됨)
- decisionCapture: 의결·일정·방향 결정 포착
- actionCapture: 담당·후속 조치 포착 (기준문에 액션이 거의 없으면 해당 없음=높은 점수)
- hallucinationPenalty: 기준문/입력에 없는 사실을 만든 정도 (0=없음, 100=심각). overall에서 감점 반영
- overall: 위 항목 종합 (hallucination이 크면 크게 깎음)
- notes: 3개 이내, 개조식`;

function getClient() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === "your_openai_api_key_here") {
    throw new Error("OPENAI_API_KEY missing");
  }
  return new OpenAI({ apiKey: key });
}

async function structureMeeting(client: OpenAI, sttText: string) {
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: STRUCTURE_SYSTEM },
      {
        role: "user",
        content: `다음 STT를 의미 정리하라.\n\n${sttText}`,
      },
    ],
  });
  const raw = res.choices[0]?.message?.content || "{}";
  return JSON.parse(raw) as {
    overallSummary?: string;
    timeline?: Array<{ title?: string; speakers?: string[]; summary?: string }>;
    decisions?: string[];
    actions?: Array<{ owner?: string; task?: string; due?: string }>;
  };
}

async function judgeSemantic(
  client: OpenAI,
  reference: string,
  structured: unknown,
) {
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      {
        role: "user",
        content:
          `## 기준문\n${reference}\n\n## 정리본\n${JSON.stringify(structured, null, 2)}`,
      },
    ],
  });
  const raw = res.choices[0]?.message?.content || "{}";
  return JSON.parse(raw) as {
    factCoverage?: number;
    speakerAttribution?: number;
    decisionCapture?: number;
    actionCapture?: number;
    hallucinationPenalty?: number;
    overall?: number;
    notes?: string[];
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const client = getClient();
  const results: Array<Record<string, unknown>> = [];

  for (const sample of SAMPLES) {
    if (!existsSync(sample.stt) || !existsSync(sample.reference)) {
      throw new Error(`missing files: ${sample.id}`);
    }
    const stt = readFileSync(sample.stt, "utf8");
    const reference = readFileSync(sample.reference, "utf8");

    console.log(`\n=== structure ${sample.id} ===`);
    const t0 = Date.now();
    const structured = await structureMeeting(client, stt);
    const structureMs = Date.now() - t0;
    writeFileSync(
      join(OUT, `${sample.id}__semantic-structure.json`),
      JSON.stringify(structured, null, 2),
      "utf8",
    );

    console.log(`=== judge ${sample.id} ===`);
    const t1 = Date.now();
    const scores = await judgeSemantic(client, reference, structured);
    const judgeMs = Date.now() - t1;

    const row = {
      sampleId: sample.id,
      sampleName: sample.name,
      structureMs,
      judgeMs,
      timelineCount: structured.timeline?.length ?? 0,
      decisionCount: structured.decisions?.length ?? 0,
      actionCount: structured.actions?.length ?? 0,
      factCoverage: scores.factCoverage ?? 0,
      speakerAttribution: scores.speakerAttribution ?? 0,
      decisionCapture: scores.decisionCapture ?? 0,
      actionCapture: scores.actionCapture ?? 0,
      hallucinationPenalty: scores.hallucinationPenalty ?? 0,
      overall: scores.overall ?? 0,
      notes: scores.notes ?? [],
      structurePath: `${sample.id}__semantic-structure.json`,
    };
    results.push(row);
    console.log(
      `${sample.name}: overall=${row.overall} fact=${row.factCoverage} action=${row.actionCapture} hallu=${row.hallucinationPenalty}`,
    );
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    definition:
      "보정=의미 정리(타임라인/결정/액션/요약). 문자 CER·원음 복원 교정이 아님.",
    input: "gpt-4o-transcribe-diarize diarized STT",
    structureModel: "gpt-4o-mini",
    judgeModel: "gpt-4o-mini",
    results,
  };
  writeFileSync(
    join(OUT, "semantic-structure-results.json"),
    JSON.stringify(payload, null, 2),
    "utf8",
  );
  console.log("\nWrote", join(OUT, "semantic-structure-results.json"));
  console.table(
    results.map((r) => ({
      sample: r.sampleName,
      overall: r.overall,
      fact: r.factCoverage,
      speaker: r.speakerAttribution,
      decision: r.decisionCapture,
      action: r.actionCapture,
      hallu: r.hallucinationPenalty,
    })),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
