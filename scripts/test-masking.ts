/**
 * STT 없이 마스킹 모듈만 검증하는 셀프테스트.
 * 실행: npm run test:masking
 */
import assert from "node:assert/strict";

import { maskPii } from "../src/lib/masking/mask";
import {
  maskTeamMeeting,
  maskTeamTimeline,
  maskTeamTranscript,
} from "../src/lib/team/masked-meeting-content";
import sampleData from "../src/mocks/sample-transcripts.json";

function run() {
  const rich = sampleData.samples[0];
  const result = maskPii(rich.text, { names: rich.names });

  assert.ok(
    result.matches.length >= 6,
    `expected many matches, got ${result.matches.length}`,
  );
  assert.notEqual(result.masked, result.original);
  assert.equal(result.masked.includes("010-1234-5678"), false);
  assert.equal(result.masked.includes("900101-1234567"), false);
  assert.match(result.masked, /010-\*{4}-\d{4}/);
  assert.ok(result.stats.phone >= 1);
  assert.ok(result.stats.email >= 1);
  assert.ok(result.stats.rrn >= 1);
  assert.ok(result.stats.account >= 1);
  assert.ok(result.stats.name >= 1);

  const clean = sampleData.samples[2];
  const cleanResult = maskPii(clean.text, { names: clean.names });
  assert.equal(
    cleanResult.matches.length,
    0,
    "clean sample should have no PII",
  );
  assert.equal(cleanResult.masked, clean.text);

  const hangulPhone = maskPii("연락처는 공일공-2394-2493 입니다.");
  assert.ok(hangulPhone.stats.phone >= 1, "hangul phone");
  assert.match(hangulPhone.masked, /010-\*{4}-2493/);

  const glued = [
    "110112471920신한",
    "신한110112471920",
    "110-112-471920신한",
  ];
  for (const input of glued) {
    const r = maskPii(input);
    assert.ok(r.stats.account >= 1, `glued fail: ${input} → ${r.masked}`);
  }

  const spoken = [
    "110112134938 이고 신한 입니다",
    "110112134938이고 신한입니다",
    "계좌는 110112134938 이고요 신한은행이에요",
    "110112134938 신한입니다",
    "입금은 110112134938 입니다. 은행은 신한",
  ];
  for (const input of spoken) {
    const r = maskPii(input);
    assert.ok(r.stats.account >= 1, `spoken fail: ${input} → ${r.masked}`);
    assert.equal(r.masked.includes("110112134938"), false, input);
  }

  const mismatch = maskPii("3333-01-1234567 신한");
  assert.equal(mismatch.stats.account, 0, "kakao+shinhan block");

  const tossMismatch = maskPii("1901-1234-5678 국민");
  assert.equal(tossMismatch.stats.account, 0, "toss+kb block");

  const okShinhan = maskPii("110-112-471920 신한");
  assert.ok(okShinhan.stats.account >= 1, "shinhan ok");

  const okKakao = maskPii("3333-01-1234567 카뱅");
  assert.ok(okKakao.stats.account >= 1, "kakao ok");

  const okNh = maskPii("301-1234-5678-90 농협");
  assert.ok(okNh.stats.account >= 1, "nh ok");

  const digitsOnly = [
    "110112134938",
    "3333-01-1234567",
    "3333011234567",
  ];
  for (const input of digitsOnly) {
    const r = maskPii(input);
    assert.ok(r.stats.account >= 1, `digits-only fail: ${input} → ${r.masked}`);
  }

  const phoneOnly = maskPii("01012345678");
  assert.equal(phoneOnly.stats.account, 0, "phone must not be account");
  assert.ok(phoneOnly.stats.phone >= 1, "phone still detected");

  const rrnOnly = maskPii("9001011234567");
  assert.equal(rrnOnly.stats.account, 0, "rrn must not be account");

  const maskedMeeting = maskTeamMeeting(
    {
      id: "team-1",
      title: "홍길동 회의",
      tags: ["홍길동"],
      summaryTags: [],
      date: "2026-07-24T00:00:00.000Z",
      duration: "10분",
      participants: [
        {
          id: "person-1",
          name: "홍길동",
          initials: "HG",
          color: "blue",
          recognitionNote: "홍길동 담당",
          summary: "홍길동이 발표",
          tags: ["홍길동"],
        },
      ],
      status: "completed",
      security: "protected",
      workspace: "team",
    },
    ["홍길동"],
  );
  assert.equal(maskedMeeting.title.includes("홍길동"), false);
  assert.equal(maskedMeeting.participants[0]?.name.includes("홍길동"), false);
  assert.equal(
    maskedMeeting.participants[0]?.recognitionNote?.includes("홍길동"),
    false,
  );

  const maskedTranscript = maskTeamTranscript(
    {
      meetingId: "team-1",
      lines: [
        {
          id: "line-1",
          time: "00:00",
          speaker: "홍길동",
          text: "홍길동의 발언",
          words: [
            {
              text: "홍길동",
              startSec: 0,
              endSec: 1,
              startOffset: 0,
              endOffset: 3,
            },
          ],
        },
      ],
    },
    ["홍길동"],
  );
  assert.equal(maskedTranscript.lines[0]?.speaker.includes("홍길동"), false);
  assert.equal(maskedTranscript.lines[0]?.words, undefined);

  const maskedTimeline = maskTeamTimeline(
    {
      meetingId: "team-1",
      durationLabel: "10분",
      overallSummary: "홍길동의 요약",
      segments: [
        {
          id: "segment-1",
          start: "00:00",
          end: "00:10",
          title: "홍길동 안건",
          summary: "홍길동 논의",
          kind: "discussion",
          speakers: ["홍길동"],
          speakerNotes: [{ name: "홍길동", said: "홍길동 발언" }],
        },
      ],
    },
    ["홍길동"],
  );
  assert.equal(
    maskedTimeline.segments[0]?.speakers?.[0]?.includes("홍길동"),
    false,
  );
  assert.equal(
    maskedTimeline.segments[0]?.speakerNotes?.[0]?.name.includes("홍길동"),
    false,
  );

  console.log("masking self-test passed");
  console.log(
    JSON.stringify(
      {
        sample: rich.id,
        detected: result.matches.length,
        stats: result.stats,
      },
      null,
      2,
    ),
  );
}

run();
