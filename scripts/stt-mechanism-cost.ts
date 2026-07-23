/**
 * 목표 STT 파이프라인 정의 + 영상 길이 기준 총비용
 * 화자 분리는 STT와 분리 가능 (자체/오픈소스/타 API)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = ".data/stt-bench";

/** 분당 추정 단가 (OpenAI 공시 추정) */
const RATE = {
  mini: 0.003,
  transcribe: 0.006,
  whisper: 0.006,
  diarize: 0.006,
} as const;

/** 의미 보정(gpt-4o-mini) — 회의 1건당 대략 (입·출력 토큰) */
const SEMANTIC_PER_MEETING_USD = 0.01;

type Pipeline = {
  id: string;
  name: string;
  /** 화자 */
  speakers: "none" | "openai-diarize" | "self";
  /** STT 모델 */
  stt: keyof typeof RATE;
  /** 긴 오디오 청크 이어쓰기 필요 */
  chunkContinue: boolean;
  note: string;
};

/**
 * 원하는 메커니즘
 * 1) STT: 길이 기반 청크 + 직전 문맥 prompt 이어전사 (끊김 방지)
 * 2) 화자: 선택 — OpenAI diarize 일체형 / 자체(또는 오픈소스) 분리
 * 3) 보정: 의미 정리만 (요약·타임라인·결정·액션)
 */
const PIPELINES: Pipeline[] = [
  {
    id: "mini-chunk-self-spk",
    name: "mini STT(청크이어) + 자체 화자",
    speakers: "self",
    stt: "mini",
    chunkContinue: true,
    note: "비용 최소. 화자는 pyannote 등 자체(인프라비만)",
  },
  {
    id: "mini-chunk-no-spk",
    name: "mini STT(청크이어) · 화자 없음",
    speakers: "none",
    stt: "mini",
    chunkContinue: true,
    note: "화자 UI 불필요 시",
  },
  {
    id: "diarize-oneshot",
    name: "4o-diarize 일체형",
    speakers: "openai-diarize",
    stt: "diarize",
    chunkContinue: false,
    note: "STT+화자 API 한 방. 청크 파이프라인 불필요",
  },
  {
    id: "whisper-chunk-self-spk",
    name: "whisper(청크이어) + 자체 화자",
    speakers: "self",
    stt: "whisper",
    chunkContinue: true,
    note: "통째로도 잘 채우지만 청크는 안전장치",
  },
  {
    id: "4o-chunk-self-spk",
    name: "4o STT(청크이어) + 자체 화자",
    speakers: "self",
    stt: "transcribe",
    chunkContinue: true,
    note: "mini 대비 STT 2배",
  },
];

const LENGTHS_MIN = [
  { label: "추경 18.5분", min: 18.5 },
  { label: "인사청문 12.6분", min: 12.6 },
  { label: "KTV 11.7분", min: 11.7 },
  { label: "3건 합 42.8분", min: 42.8 },
  { label: "1시간", min: 60 },
] as const;

function costStt(stt: keyof typeof RATE, minutes: number) {
  return Math.round(RATE[stt] * minutes * 1000) / 1000;
}

function costPipeline(p: Pipeline, minutes: number) {
  const sttUsd = costStt(p.stt, minutes);
  /** 자체 화자: API $0, GPU/서버는 운영비(여기선 0으로 두고 주석) */
  const speakerUsd = p.speakers === "openai-diarize" ? 0 : 0;
  const semanticUsd = SEMANTIC_PER_MEETING_USD;
  const total = Math.round((sttUsd + speakerUsd + semanticUsd) * 1000) / 1000;
  return { sttUsd, speakerUsd, semanticUsd, total };
}

function main() {
  mkdirSync(OUT, { recursive: true });

  const mechanism = {
    steps: [
      "1. 업로드 오디오 길이 확인",
      "2. STT: 길면 N분 청크 + 직전 끝문맥 prompt로 API 이어전사 → 순서 연결(+경계 중복 제거)",
      "3. 화자(선택): (A) 4o-diarize 일체형 또는 (B) 자체/오픈소스 diarize 후 구간 정렬",
      "4. 의미 보정: 요약·타임라인(누가/무엇을)·결정·액션 (단어 CER 교정 아님)",
    ],
    speakerNote:
      "화자 구분은 OpenAI 전유물이 아님. pyannote.audio 등으로 자체 구축 가능. " +
      "다만 음성 ML 파이프라인(학습/GPU/타임스탬프 정렬)이 필요하고, STT와 시계열을 맞추는 작업이 핵심.",
  };

  const rows = PIPELINES.map((p) => {
    const byLength: Record<string, ReturnType<typeof costPipeline>> = {};
    for (const L of LENGTHS_MIN) {
      byLength[L.label] = costPipeline(p, L.min);
    }
    return {
      id: p.id,
      name: p.name,
      speakers: p.speakers,
      stt: p.stt,
      chunkContinue: p.chunkContinue,
      note: p.note,
      ratePerMin: RATE[p.stt],
      costs: byLength,
    };
  });

  /** 타산성: 1시간 기준 비교 */
  const hour = rows
    .map((r) => ({
      name: r.name,
      total1h: r.costs["1시간"].total,
      stt1h: r.costs["1시간"].sttUsd,
      speakers: r.speakers,
    }))
    .sort((a, b) => a.total1h - b.total1h);

  const payload = {
    generatedAt: new Date().toISOString(),
    mechanism,
    ratesUsdPerMin: RATE,
    semanticPerMeetingUsd: SEMANTIC_PER_MEETING_USD,
    pipelines: rows,
    ranking1h: hour,
    verdict: [
      "같은 영상 길시면 STT 총액은 모델 단가×분만 좌우. 청크는 품질용이지 비용 절감용이 아님.",
      "화자 자체 구축 시 API 화자 비용 $0. 대신 서버/GPU 운영비.",
      "1시간 타산: mini+자체화자 ≈ $0.19, diarize 일체형 ≈ $0.37 (의미보정 $0.01 포함).",
      "화자 필수+운영 단순: diarize. 비용 최소+화자 필요: mini 청크 + 자체 화자.",
    ],
  };

  writeFileSync(
    join(OUT, "mechanism-cost.json"),
    JSON.stringify(payload, null, 2),
    "utf8",
  );

  console.log("=== 메커니즘 ===");
  for (const s of mechanism.steps) console.log(s);
  console.log("\n화자:", mechanism.speakerNote);
  console.log("\n=== 1시간 총비용 (의미보정 $0.01 포함) ===");
  console.table(hour);
  console.log("\nWrote", join(OUT, "mechanism-cost.json"));
}

main();
