/**
 * 디자인 랩·페이지 UX 미리보기가 현재 제품 UI만 가리키는지 회귀.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DESIGN_CATEGORIES } from "../src/components/design/design-catalog";
import { resolvePageUxSurface } from "../src/lib/page-ux-registry";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function scenario(name: string, fn: () => void) {
  fn();
  console.log(`ok — ${name}`);
}

scenario("구식 처리중·최근활동 카테고리 없음", () => {
  const ids = DESIGN_CATEGORIES.map((c) => c.id);
  assert.ok(!ids.includes("processing"));
  assert.ok(!ids.includes("activity"));
  assert.ok(ids.includes("meeting-process"));
  assert.ok(ids.includes("upload-start"));
});

scenario("삭제된 제품 컴포넌트 파일 없음", () => {
  assert.equal(
    existsSync(join(root, "src/components/dashboard/processing-now.tsx")),
    false,
  );
  assert.equal(
    existsSync(
      join(root, "src/components/dashboard/processing-status-popup.tsx"),
    ),
    false,
  );
});

scenario("업로드 씬은 MeetingCreatePage", () => {
  const scenes = read("src/components/design/scenes/processing-scenes.tsx");
  assert.match(scenes, /MeetingCreatePage/);
  assert.doesNotMatch(scenes, /CreatePageShell|ProcessingNow|ProcessingStatus/);
});

scenario("회의 상세 처리 씬은 MeetingRecordLayout", () => {
  const scenes = read(
    "src/components/design/scenes/meeting-process-scenes.tsx",
  );
  assert.match(scenes, /MeetingRecordLayout/);
  assert.match(scenes, /MeetingProcessLoader/);
});

scenario("페이지 UX 통계 surface id=stats", () => {
  const surface = resolvePageUxSurface("/stats");
  assert.equal(surface.id, "stats");
  assert.equal(surface.label, "통계");
  assert.equal(resolvePageUxSurface("/ai-usage").id, "stats");
  assert.equal(resolvePageUxSurface("/operations").id, "stats");
});

scenario("대시보드 제작중은 기록 행 픽스처", () => {
  const dash = read("src/app/(dashboard)/dashboard/page.tsx");
  assert.match(dash, /FIXTURE_PROCESSING_MULTI/);
  assert.match(dash, /anim-processing/);
  assert.doesNotMatch(dash, /ProcessingNowSection/);
});

scenario("카탈로그 씬 Preview는 모두 함수", () => {
  for (const cat of DESIGN_CATEGORIES) {
    for (const scene of cat.scenes) {
      assert.equal(
        typeof scene.Preview,
        "function",
        `${cat.id}/${scene.id}`,
      );
    }
  }
});

scenario("회의 기록 헤더 · 모바일 돌아가기", () => {
  const layout = read("src/components/meetings/meeting-record-layout.tsx");
  assert.match(layout, /showLeadingOnMobile/);
  assert.match(layout, /backAlwaysVisible/);
  const create = read("src/components/meetings/meeting-create-page.tsx");
  assert.match(create, /max-md:hidden|hidden[\s\S]*md:block/);
  assert.match(create, /backAlwaysVisible/);
});

scenario("useMdUp · 디자인 스테이지 폭 우선", () => {
  const hook = read("src/hooks/use-md-up.ts");
  assert.match(hook, /data-faith-design-viewport/);
  assert.match(hook, /data-faith-design-width/);
  assert.match(
    read("src/components/dashboard/recent-meetings-table.tsx"),
    /useMdUp/,
  );
  assert.doesNotMatch(
    read("src/components/dashboard/recent-meetings-table.tsx"),
    /matchMedia\(MD_UP_QUERY\)/,
  );
});

console.log("design preview hygiene: all ok");
