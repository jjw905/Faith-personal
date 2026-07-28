import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { pronunciationSimilarity } from "../src/lib/stt/pronunciation";
import { suggestTermCorrections } from "../src/lib/stt/term-suggest";

async function main() {
  const similar = pronunciationSimilarity("유시스", "뉴시스");
  if (similar < 0.9) {
    throw new Error(`뉴시스 발음 유사도가 낮습니다: ${similar}`);
  }

  const known = await suggestTermCorrections(["유시스 기자의 질문입니다."], {
    glossary: ["뉴시스"],
    genericDictionary: false,
  });
  if (
    !known.suggestions.some(
      (row) => row.wrong === "유시스" && row.suggestion === "뉴시스",
    )
  ) {
    throw new Error("뉴시스 용어 추천이 생성되지 않았습니다.");
  }

  const numericHomophone = await suggestTermCorrections(
    ["803 국립공원 생태탐방원"],
    {
      glossary: ["팔공산"],
      genericDictionary: false,
    },
  );
  if (numericHomophone.suggestions[0]?.suggestion !== "팔공산") {
    throw new Error("803 -> 팔공산 추천이 생성되지 않았습니다.");
  }

  const participantName = await suggestTermCorrections(
    ["그만승 차관님이 설명했습니다."],
    {
      glossary: ["김한승"],
      genericDictionary: false,
    },
  );
  if (participantName.suggestions[0]?.suggestion !== "김한승") {
    throw new Error("유사한 참석자 이름 추천이 생성되지 않았습니다.");
  }

  const protectedWord = await suggestTermCorrections(
    ["공공의료 정책을 검토합니다."],
    {
      glossary: ["공공의대"],
      genericDictionary: false,
    },
  );
  if (protectedWord.suggestions.length > 0) {
    throw new Error("실재어 공공의료를 잘못 추천했습니다.");
  }

  const inflected = await suggestTermCorrections(
    ["본예산에 편성한다라고 설명했습니다."],
    { genericDictionary: true },
  );
  if (inflected.suggestions.length > 0) {
    throw new Error("활용형을 사전 후보로 잘못 추천했습니다.");
  }

  console.log(
    JSON.stringify(
      {
        pronunciationSimilarity: similar,
        knownSuggestion: known.suggestions[0],
        numericHomophoneSuggestion: numericHomophone.suggestions[0],
        participantNameSuggestion: participantName.suggestions[0],
        protectedSuggestionCount: protectedWord.suggestions.length,
        inflectedSuggestionCount: inflected.suggestions.length,
        dictionaryUsage: known.usage,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
