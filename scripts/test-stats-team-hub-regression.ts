/**
 * 통계 카테고리 · 팀 채팅 허브 디자인/보안/반응형 회귀.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  fixturePipelineEmpty,
  fixturePipelineFull,
  fixtureSurveyEmpty,
  fixtureSurveyFull,
  fixtureTeamChatFull,
} from "../src/lib/page-ux-fixtures";
import { parseStatsCategory } from "../src/lib/stats-admin-category";
import {
  DESIGN_VIEWPORTS,
} from "../src/components/design/use-design-viewport";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function scenario(name: string, fn: () => void) {
  fn();
  console.log(`ok — ${name}`);
}

scenario("통계 카테고리 파서", () => {
  assert.equal(parseStatsCategory("usage"), "usage");
  assert.equal(parseStatsCategory("survey"), "survey");
  assert.equal(parseStatsCategory("nope"), "usage");
});

scenario("디자인 랩 · 통계·팀 장면 등록", () => {
  const catalog = read("src/components/design/design-catalog.ts");
  assert.match(catalog, /id: "admin-ops"/);
  assert.match(catalog, /stats-full/);
  assert.match(catalog, /team-chat-hub/);
  assert.match(catalog, /page: "화면"/);
  const scenes = read("src/components/design/scenes/admin-team-scenes.tsx");
  assert.match(scenes, /previewLock/);
  assert.match(scenes, /SceneTeamChatHub/);
});

scenario("통계 · 카테고리 탭/모바일 레일/터치", () => {
  const ops = read("src/components/admin/ops-stats-dashboard.tsx");
  assert.match(ops, /STATS_CATEGORY_TABS/);
  assert.match(ops, /StatsAdminMobileRail/);
  assert.match(ops, /hidden items-end border-b border-border md:flex/);
  assert.match(ops, /min-h-12 min-w-12/);
  assert.match(ops, /pb-\[calc\(env\(safe-area-inset-bottom,0px\)\+11rem\)\]/);
  assert.match(ops, /viewPipeline|viewSurvey|previewLock/);
  const rail = read("src/components/admin/stats-admin-mobile-rail.tsx");
  assert.match(rail, /md:hidden/);
  assert.match(rail, /min-h-12/);
  assert.match(rail, /4\.75rem/);
});

scenario("팀 허브 · 반응형·터치·사이트 자원만", () => {
  const hub = read("src/components/team/team-chat-hub.tsx");
  assert.match(hub, /TeamHubMobileRail/);
  assert.match(hub, /md:hidden/);
  assert.match(hub, /TOUCH_ICON_BUTTON|TOUCH_BUTTON|TOUCH_ROW/);
  assert.match(hub, /h-\[calc\(100dvh-14\.5rem\)\]/);
  assert.match(hub, /Faith 자료 첨부|보관함/);
  assert.match(hub, /vaultFileId|teamMeetingId/);
  assert.match(hub, /previewLock/);
  assert.doesNotMatch(hub, /type=\"file\"/);
  const panel = read("src/components/team/team-workspace-panel.tsx");
  assert.match(panel, /TeamChatHub/);
  assert.match(panel, /overflow-x-auto/);
  assert.match(panel, /hidden min-w-0 md:block md:max-w-sm/);
});

scenario("팀 채팅 API · 보안 가드", () => {
  const route = read("src/app/api/teams/[teamId]/messages/route.ts");
  assert.match(route, /rateLimit/);
  assert.match(route, /ALLOWED_CHANNELS|지원하지 않는 채널/);
  assert.match(route, /team-chat:/);
  assert.match(route, /\^\[a-zA-Z0-9_-\]\{8,64\}\$/);
  const stream = read("src/app/api/teams/[teamId]/messages/stream/route.ts");
  assert.match(stream, /TEAM_CHAT_CHANNEL_GENERAL/);
  assert.match(stream, /지원하지 않는 채널/);
  const chat = read("src/lib/team-chat.ts");
  assert.match(chat, /sealTeamText|openTeamText/);
  assert.match(chat, /protectUserFileForTeam/);
});

scenario("vault 팀원 접근", () => {
  const vault = read("src/lib/storage/vault-service.ts");
  assert.match(vault, /vaultFileAccessWhere/);
  assert.match(vault, /members: \{ some: \{ userId/);
  const content = read("src/app/api/vault/[id]/content/route.ts");
  assert.match(content, /members: \{ some: \{ userId/);
});

scenario("미리보기 fixture", () => {
  assert.equal(fixturePipelineEmpty().total, 0);
  assert.ok(fixturePipelineFull().total > 0);
  assert.equal(fixtureSurveyEmpty().total, 0);
  assert.ok(fixtureSurveyFull().total > 0);
  assert.equal(fixtureTeamChatFull("me").length, 3);
});

scenario("디자인 뷰포트 폭", () => {
  assert.deepEqual(
    DESIGN_VIEWPORTS.map((v) => v.width),
    [390, 768, 1024],
  );
});

scenario("사이드바 설문 통계 항목 제거 · /stats 통합", () => {
  const constants = read("src/lib/constants.ts");
  assert.match(constants, /href: "\/stats"/);
  assert.doesNotMatch(constants, /href: "\/survey-stats"/);
  const surveyPage = read("src/app/(dashboard)/survey-stats/page.tsx");
  assert.match(surveyPage, /redirect\("\/stats\?cat=survey"\)/);
});

console.log("\nall ok — stats/team design+security regression");
