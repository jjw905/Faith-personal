/**
 * 분석 진행률 — 여러 실측 시나리오 검증.
 *
 * 실행: npx tsx --tsconfig tsconfig.json scripts/verify-process-progress-anim.ts
 */

import {
  nextDisplayPercent,
  softCreepCeiling,
  softElapsedProgress,
  structureProgressPercent,
  structurePartRange,
  simulateFollowTargets,
  PROGRESS_STRUCTURE_START,
  PROGRESS_STRUCTURE_DONE,
  PROGRESS_ALIGNED,
  PROGRESS_BUILT,
} from "../src/lib/meeting-process-progress";

type Sample = { atMs: number; target: number };

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

let passed = 0;
const failures: string[] = [];

function ok(name: string) {
  passed += 1;
  console.log(`ok  ${name}`);
}

function fail(name: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  failures.push(`${name}: ${msg}`);
  console.log(`FAIL  ${name}`);
  console.log(`      ${msg}`);
}

function run(name: string, fn: () => void) {
  try {
    fn();
    ok(name);
  } catch (e) {
    fail(name, e);
  }
}

/** STT fraction 0→1 → 1~72 (process-upload mapSttFraction) */
function mapStt(fraction: number) {
  return 3 + Math.max(0, Math.min(1, fraction)) * (72 - 3);
}

function follow(
  samples: Sample[],
  durationMs: number,
  start?: number,
) {
  return simulateFollowTargets({ samples, durationMs, start });
}

function displayAt(
  samples: Sample[],
  atMs: number,
  start = samples[0]?.target ?? 0,
) {
  let cur = start;
  let target = start;
  let si = 0;
  for (let t = 0; t <= atMs; t += 16.67) {
    while (si < samples.length && samples[si]!.atMs <= t) {
      target = Math.max(target, samples[si]!.target);
      si += 1;
    }
    cur = nextDisplayPercent({
      current: cur,
      target,
      dtMs: 16.67,
      nowMs: t,
    });
  }
  return { cur, target };
}

function assertMonotone(series: number[], label: string) {
  for (let i = 1; i < series.length; i++) {
    assert(
      series[i]! + 1e-9 >= series[i - 1]!,
      `${label} non-monotonic @${i}: ${series[i - 1]}→${series[i]}`,
    );
  }
}

function assertSettled(
  samples: Sample[],
  atMs: number,
  expectedTarget: number,
  maxLag = 2.5,
) {
  const { cur, target } = displayAt(samples, atMs);
  assert(target >= expectedTarget - 0.05, `target ${target} < ${expectedTarget}`);
  assert(
    expectedTarget - cur < maxLag,
    `not settled: want ~${expectedTarget}, display=${cur.toFixed(2)}`,
  );
  assert(
    cur - expectedTarget <= 1.2,
    `invented ahead: display=${cur.toFixed(2)} target=${expectedTarget}`,
  );
}

// ═══════════════════════════════════════════════════════════
// S1. 짧은 회의: STT 빠름 → 구조화 1파트 → 완료
// ═══════════════════════════════════════════════════════════
run("S1 short meeting full pipeline", () => {
  const samples: Sample[] = [
    { atMs: 0, target: 0 },
    { atMs: 500, target: 3 },
    { atMs: 2_000, target: mapStt(0.35) },
    { atMs: 4_000, target: mapStt(0.7) },
    { atMs: 6_000, target: mapStt(1) }, // 72
    { atMs: 6_500, target: structureProgressPercent({ partIndex: 0, partCount: 1, attempt: 1 }) },
    { atMs: 12_000, target: structureProgressPercent({ partIndex: 0, partCount: 1, attempt: 1, waitedMs: 8_000 }) },
    { atMs: 20_000, target: PROGRESS_STRUCTURE_DONE }, // 90
    { atMs: 21_000, target: PROGRESS_ALIGNED }, // 95
    { atMs: 22_000, target: PROGRESS_BUILT }, // 98
    { atMs: 23_000, target: 100 },
  ];
  const { series, maxLead } = follow(samples, 28_000, 0);
  assertMonotone(series, "S1");
  assert(series[series.length - 1]! >= 99.5, `final ${series.at(-1)}`);
  assert(maxLead <= 1.2, `maxLead ${maxLead}`);
  assertSettled(samples, 7_500, 72, 2.5);
  assertSettled(samples, 24_500, 100, 1);
});

// ═══════════════════════════════════════════════════════════
// S2. 긴 회의: STT 청크 다수 + 구조화 3파트
// ═══════════════════════════════════════════════════════════
run("S2 long meeting multi-chunk STT + 3 structure parts", () => {
  const samples: Sample[] = [{ atMs: 0, target: 3 }];
  // 12 STT chunks over 60s
  for (let i = 1; i <= 12; i++) {
    samples.push({ atMs: i * 5_000, target: mapStt(i / 12) });
  }
  // 3 structure parts with heartbeats
  let t = 65_000;
  for (let p = 0; p < 3; p++) {
    samples.push({
      atMs: t,
      target: structureProgressPercent({ partIndex: p, partCount: 3, attempt: 1 }),
    });
    t += 8_000;
    samples.push({
      atMs: t,
      target: structureProgressPercent({
        partIndex: p,
        partCount: 3,
        attempt: 1,
        waitedMs: 15_000,
      }),
    });
    t += 10_000;
  }
  samples.push({ atMs: t, target: PROGRESS_STRUCTURE_DONE });
  samples.push({ atMs: t + 2_000, target: PROGRESS_ALIGNED });
  samples.push({ atMs: t + 4_000, target: PROGRESS_BUILT });
  samples.push({ atMs: t + 6_000, target: 100 });

  const end = t + 10_000;
  const { series, maxLead } = follow(samples, end, 3);
  assertMonotone(series, "S2");
  assert(series.at(-1)! >= 99.5, `final ${series.at(-1)}`);
  assert(maxLead <= 1.25, `maxLead ${maxLead}`);

  // 파트 경계: part1 시작 직후 표시가 part0 hi를 크게 넘지 않고 part1로 이동
  const p1Start = structureProgressPercent({ partIndex: 1, partCount: 3, attempt: 1 });
  const p0 = structurePartRange({ partIndex: 0, partCount: 3 });
  assert(p1Start >= p0.hi - 0.5, `part1 after part0 ${p1Start} vs ${p0.hi}`);
});

// ═══════════════════════════════════════════════════════════
// S3. 구조화 LLM 장기 대기 (heartbeat만, 표시는 실측 추종)
// ═══════════════════════════════════════════════════════════
run("S3 long structure LLM wait with heartbeats", () => {
  const samples: Sample[] = [{ atMs: 0, target: 72 }];
  for (let sec = 2; sec <= 60; sec += 2) {
    samples.push({
      atMs: sec * 1000,
      target: structureProgressPercent({
        partIndex: 0,
        partCount: 1,
        attempt: 1,
        waitedMs: sec * 1000,
      }),
    });
  }
  samples.push({ atMs: 65_000, target: 90 });
  samples.push({ atMs: 70_000, target: 100 });

  const { series, maxLead } = follow(samples, 75_000, 72);
  assertMonotone(series, "S3");
  assert(maxLead <= 1.25, `maxLead ${maxLead}`);

  // 30초 시점: heartbeat 실측 근처, 가짜 89 아님
  const at30 = structureProgressPercent({
    partIndex: 0,
    partCount: 1,
    attempt: 1,
    waitedMs: 30_000,
  });
  assert(at30 > 75 && at30 < 89, `heartbeat@30s ${at30}`);
  assertSettled(samples, 31_500, at30, 2.5);

  // 서버가 아직 90 되기 전(60s)에 표시가 90 넘으면 안 됨
  const { cur: beforeDone } = displayAt(samples, 60_000, 72);
  assert(beforeDone < 90, `pre-done display ${beforeDone}`);
});

// ═══════════════════════════════════════════════════════════
// S4. 구버전 77 정지 회귀: target 72만 오면 77로 안 부풀림
// ═══════════════════════════════════════════════════════════
run("S4 regression: no fake freeze-inflate at 77", () => {
  const c0 = softCreepCeiling(72);
  const c60 = softCreepCeiling(72, 60_000);
  assert(c0 === 72 && c60 === 72, `ceiling ${c0}/${c60}`);

  let cur = 70;
  for (let t = 0; t < 45_000; t += 16.67) {
    cur = nextDisplayPercent({
      current: cur,
      target: 72,
      stalledMs: t,
      dtMs: 16.67,
      nowMs: t,
    });
  }
  assert(cur <= 72.001, `stuck display ${cur}`);
  assert(cur >= 72, `reached 72 ${cur}`);
  assert(cur < 77, "must not reach old freeze point 77 without real progress");
});

// ═══════════════════════════════════════════════════════════
// S5. 커버리지 재시도 (depth↑) — 같은 파트 안 nudge
// ═══════════════════════════════════════════════════════════
run("S5 coverage retry depth stays in part range", () => {
  const range = structurePartRange({ partIndex: 0, partCount: 2 });
  const d0 = structureProgressPercent({
    partIndex: 0,
    partCount: 2,
    attempt: 1,
    depth: 0,
  });
  const d1 = structureProgressPercent({
    partIndex: 0,
    partCount: 2,
    attempt: 2,
    depth: 1,
  });
  const d2 = structureProgressPercent({
    partIndex: 0,
    partCount: 2,
    attempt: 3,
    depth: 2,
    waitedMs: 10_000,
  });
  assert(d0 >= range.lo && d0 < range.hi, `d0 ${d0} in ${range.lo}-${range.hi}`);
  assert(d1 >= d0, `retry nudge ${d0}→${d1}`);
  assert(d2 > d1 && d2 < range.hi, `depth+wait ${d2} < ${range.hi}`);
});

// ═══════════════════════════════════════════════════════════
// S6. 초고속 완료 (거의 즉시 100)
// ═══════════════════════════════════════════════════════════
run("S6 near-instant complete", () => {
  const samples: Sample[] = [
    { atMs: 0, target: 0 },
    { atMs: 200, target: 72 },
    { atMs: 400, target: 90 },
    { atMs: 600, target: 100 },
  ];
  const { series, maxLead } = follow(samples, 4_000, 0);
  assertMonotone(series, "S6");
  assert(series.at(-1)! >= 99.5, `final ${series.at(-1)}`);
  assert(maxLead <= 1.25, `maxLead ${maxLead}`);
});

// ═══════════════════════════════════════════════════════════
// S7. STT만 천천히 (구조화 전) — 표시가 STT 실측만 따름
// ═══════════════════════════════════════════════════════════
run("S7 STT-only slow climb never jumps to structure", () => {
  const samples: Sample[] = [{ atMs: 0, target: 3 }];
  for (let i = 1; i <= 20; i++) {
    samples.push({ atMs: i * 3_000, target: mapStt(i / 20) });
  }
  const { series, maxLead } = follow(samples, 65_000, 3);
  assertMonotone(series, "S7");
  assert(maxLead <= 1.25, `maxLead ${maxLead}`);
  const last = series.at(-1)!;
  assert(last >= 71 && last <= 73.3, `end of STT band ${last}`);
  assert(last < PROGRESS_STRUCTURE_START + 1.2, "no early structure invent");
});

// ═══════════════════════════════════════════════════════════
// S8. 서버가 뒤로 안 감(저장소 max) — 표시도 역행 없음
// ═══════════════════════════════════════════════════════════
run("S8 display never goes backward", () => {
  // 실측이 요동해도 클라이언트 target은 max로만 갱신된다고 가정
  const samples: Sample[] = [
    { atMs: 0, target: 40 },
    { atMs: 2_000, target: 55 },
    { atMs: 4_000, target: 55 }, // same
    { atMs: 6_000, target: 70 },
    { atMs: 8_000, target: 72 },
  ];
  const { series } = follow(samples, 12_000, 40);
  assertMonotone(series, "S8");
});

// ═══════════════════════════════════════════════════════════
// S9. 1초 폴링 미세 증가 — lead ≤ gap
// ═══════════════════════════════════════════════════════════
run("S9 1s polling small steps, lead within gap", () => {
  const samples: Sample[] = [];
  for (let i = 0; i <= 50; i++) {
    samples.push({ atMs: i * 1000, target: Math.min(72, 5 + i * 1.4) });
  }
  const { maxLead, series } = follow(samples, 55_000, 5);
  assertMonotone(series, "S9");
  assert(maxLead <= 1.25, `maxLead ${maxLead}`);
});

// ═══════════════════════════════════════════════════════════
// S10. 후반 마일스톤 90→95→98→100
// ═══════════════════════════════════════════════════════════
run("S10 late milestones 90→95→98→100", () => {
  const samples: Sample[] = [
    { atMs: 0, target: 88 },
    { atMs: 1_000, target: 90 },
    { atMs: 3_000, target: 95 },
    { atMs: 5_000, target: 98 },
    { atMs: 7_000, target: 100 },
  ];
  const { series, maxLead } = follow(samples, 12_000, 88);
  assertMonotone(series, "S10");
  assert(maxLead <= 1.25, `maxLead ${maxLead}`);
  assertSettled(samples, 2_200, 90);
  assertSettled(samples, 4_200, 95);
  assertSettled(samples, 6_200, 98);
  assertSettled(samples, 9_000, 100, 1);
});

// ═══════════════════════════════════════════════════════════
// S11. 구조화 파트 3개 구간이 겹치지 않고 72~89 커버
// ═══════════════════════════════════════════════════════════
run("S11 structure part ranges partition 72–89", () => {
  const parts = 3;
  const ranges = Array.from({ length: parts }, (_, i) =>
    structurePartRange({ partIndex: i, partCount: parts }),
  );
  assert(ranges[0]!.lo === PROGRESS_STRUCTURE_START, "starts at 72");
  assert(ranges[parts - 1]!.hi === PROGRESS_STRUCTURE_DONE - 1, "ends at 89");
  for (let i = 1; i < parts; i++) {
    assert(
      Math.abs(ranges[i]!.lo - ranges[i - 1]!.hi) < 0.05,
      `gap/overlap at ${i}`,
    );
  }
});

// ═══════════════════════════════════════════════════════════
// S12. 여러 partCount에서 heartbeat가 자기 파트 hi를 넘지 않음
// ═══════════════════════════════════════════════════════════
run("S12 heartbeat never leaves own part for partCount 1..5", () => {
  for (let parts = 1; parts <= 5; parts++) {
    for (let p = 0; p < parts; p++) {
      const { lo, hi } = structurePartRange({ partIndex: p, partCount: parts });
      for (const waited of [0, 5_000, 20_000, 60_000, 120_000]) {
        const pct = structureProgressPercent({
          partIndex: p,
          partCount: parts,
          attempt: 1,
          waitedMs: waited,
        });
        assert(pct >= lo - 0.05, `parts=${parts} p=${p} lo ${pct}>=${lo}`);
        assert(pct < hi, `parts=${parts} p=${p} waited=${waited} ${pct}<${hi}`);
      }
    }
  }
});

// ═══════════════════════════════════════════════════════════
// S13. STT 직후 소프트 진행 — 2~3초 안에 72를 벗어나 대기열 고정 방지
// ═══════════════════════════════════════════════════════════
run("S13 softElapsedProgress leaves 72 within 3s", () => {
  const at0 = softElapsedProgress({
    from: 72,
    to: 80,
    waitedMs: 0,
    expectedMs: 28_000,
  });
  const at3 = softElapsedProgress({
    from: 72,
    to: 80,
    waitedMs: 3_000,
    expectedMs: 28_000,
  });
  const at30 = softElapsedProgress({
    from: 72,
    to: 80,
    waitedMs: 30_000,
    expectedMs: 28_000,
  });
  assert(at0 === 72, `start ${at0}`);
  assert(at3 >= 73, `moved by 3s ${at3}`);
  assert(at30 >= at3, `monotonic ${at3}->${at30}`);
  assert(at30 < 80, `never reach to ${at30}`);
});

// ═══════════════════════════════════════════════════════════
console.log("");
if (failures.length) {
  console.log(`${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`${passed} scenario checks passed`);
