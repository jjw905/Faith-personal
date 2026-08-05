/**
 * 오늘자 UI 합의 회귀 점검 (일회성).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DOCS_FLOAT_GAP_PX,
  DOCS_SITE_HEADER_PX,
} from "../src/components/docs/docs-float-tools";
import { NAV_ITEMS } from "../src/lib/constants";
import {
  formatDottedRangeLabel,
  formatRecordsRangeLabel,
} from "../src/lib/meeting-date";
import {
  pinnedDoesNotCoverContent,
  resolveSidebarVisual,
  sidebarOverlapsMainContent,
} from "../src/lib/sidebar-layout";
import { vaultFileExtLabel } from "../src/lib/vault-file-icon";
import { getUpcomingByWorkspace } from "../src/lib/workspace-data";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function scenario(name: string, fn: () => void) {
  fn();
  console.log(`ok — ${name}`);
}

scenario("사이드바 rail/pinned · 호버 peek 없음 · 레일 캡션", () => {
  const rail = resolveSidebarVisual({
    isRailLayout: true,
    collapsed: true,
  });
  const pinned = resolveSidebarVisual({
    isRailLayout: true,
    collapsed: false,
  });
  assert.equal(sidebarOverlapsMainContent(rail), false);
  assert.equal(rail.mode, "rail");
  assert.ok(pinnedDoesNotCoverContent(pinned));
  const side = read("src/components/layout/app-sidebar.tsx");
  assert.match(side, /md:static md:inset-auto md:h-full md:w-60/);
  assert.doesNotMatch(side, /hoverPeek|onNavHoverEnter|SIDEBAR_HOVER/);
  assert.match(side, /RailHoverCaption/);
  const caption = read("src/components/layout/rail-hover-caption.tsx");
  assert.match(caption, /group-hover:opacity-100/);
  assert.match(caption, /duration-200/);
});

scenario("NAV 플랜 없음 · 할당량 /plan", () => {
  assert.ok(!NAV_ITEMS.some((i) => i.href === "/plan"));
  assert.match(read("src/components/layout/sidebar-usage.tsx"), /href="\/plan"/);
});

scenario("기록 기간 · 검색", () => {
  assert.ok(
    !formatRecordsRangeLabel("2026-08-03", "2026-08-09").includes("주간"),
  );
  assert.equal(
    formatDottedRangeLabel("2027-09-09", "2028-09-10"),
    "2027.09.09 ~ 2028.09.10",
  );
  const table = read("src/components/dashboard/recent-meetings-table.tsx");
  assert.match(table, /PeriodDateNav/);
  assert.match(table, /DateRangeCalendar/);
  const search = read("src/components/dashboard/meeting-search.tsx");
  assert.match(search, /ExpandableMeetingSearch/);
  assert.match(search, /toolbar/);
});

scenario("일정 장소·참석자·빈화면", () => {
  const mid = read("src/components/dashboard/meeting-mid-panel.tsx");
  assert.match(mid, /MeetingPlatformIcon/);
  assert.match(mid, /overflowCount/);
  assert.match(mid, /ArrowRight/);
  assert.match(mid, /hideTitle && hideSearch \? null/);
  const overflow = mid.match(
    /overflowCount > 0 \? \([\s\S]{0,280}\+\{overflowCount\}/,
  )?.[0];
  assert.ok(overflow);
  assert.doesNotMatch(overflow!, /border-card|bg-surface-2/);
});

scenario("알림 · analysis_done 숨김", () => {
  const panel = read("src/components/layout/notification-panel.tsx");
  assert.match(panel, /unread|records/);
  assert.match(panel, /min-h-12/);
  const store = read("src/lib/notifications-store.ts");
  assert.match(store, /NOT: \{ kind: "analysis_done" \}/);
  const process = read("src/lib/stt/process-upload.ts");
  assert.match(process, /kind: "analysis_failed"/);
  assert.doesNotMatch(process, /kind: "analysis_done"/);
});

scenario("회의록 생성 · 캡처 아이콘 오른쪽", () => {
  const create = read("src/components/meetings/meeting-create-page.tsx");
  assert.match(create, /MeetingRecord(?:Layout|Chrome)/);
  assert.match(create, /EMPTY_HEADER_CENTER/);
  const detail = read("src/components/meetings/meeting-detail-header.tsx");
  const row = detail.match(
    /flex min-w-0 items-center gap-3[\s\S]{0,320}MeetingCaptureChip/,
  )?.[0];
  assert.ok(row);
  assert.match(row!, /MeetingTitleHeading[\s\S]+MeetingCaptureChip/);
  assert.doesNotMatch(row!, /MeetingCaptureChip[\s\S]+MeetingTitleHeading/);
  const chip = read("src/components/meetings/meeting-capture-label.tsx");
  assert.match(chip, /제목 오른쪽/);
  assert.match(chip, /h-10 w-10/);
  const scene = read(
    "src/components/design/scenes/meeting-process-scenes.tsx",
  );
  const sceneRow = scene.match(
    /flex min-w-0 items-center gap-3[\s\S]{0,320}MeetingCaptureChip/,
  )?.[0];
  assert.ok(sceneRow);
  assert.match(sceneRow!, /MeetingTitleHeading[\s\S]+MeetingCaptureChip/);
});

scenario("docs float · 아바타 · 시드 · 대시보드 헤더", () => {
  assert.equal(DOCS_SITE_HEADER_PX + DOCS_FLOAT_GAP_PX, 80);
  assert.doesNotMatch(
    read("src/components/people/person-avatar.tsx"),
    /border-card/,
  );
  const items = getUpcomingByWorkspace("personal");
  assert.equal(
    items.find((i) => i.title.includes("발표 연습 리허설"))?.participants
      .length,
    4,
  );
  assert.equal(
    items.find((i) => i.title.includes("주간 개인 리뷰"))?.participants.length,
    7,
  );
  const dash = read("src/app/(dashboard)/dashboard/page.tsx");
  assert.match(dash, /min-h-14[\s\S]{0,80}text-2xl/);
  assert.match(dash, /ExpandableMeetingSearch/);
});

scenario("보관함 대시보드형 · 아이콘 왼쪽·큼", () => {
  const vault = read("src/app/(dashboard)/vault/page.tsx");
  assert.match(vault, /MeetingRecordHeaderRow/);
  assert.match(vault, /ExpandableMeetingSearch/);
  assert.match(vault, /RecordsPageNav/);
  assert.match(vault, /VaultQuotaMeta/);
  assert.doesNotMatch(vault, /CARD_SHADOW|VaultQuotaGauge|VaultFloatSearch/);
  assert.match(vault, /min-h-\[5\.5rem\]/);
  assert.match(vault, /h-11 w-11[\s\S]{0,120}sm:h-12 sm:w-12/);
  // time → icon → title 순서
  const itemFn = vault.slice(vault.indexOf("function VaultListItem"));
  const timeIdx = itemFn.indexOf("w-[4.75rem]");
  const iconIdx = itemFn.indexOf("<VaultFileIcon");
  const titleIdx = itemFn.indexOf('title={item.name}');
  assert.ok(timeIdx > 0 && iconIdx > timeIdx && titleIdx > iconIdx);
});

scenario("확장자 소문자", () => {
  const cases: Array<[string, string]> = [
    ["a.m4a", "m4a"],
    ["b.MP3", "mp3"],
    ["c.JPEG", "jpg"],
    ["d.docx", "doc"],
    ["e.xlsx", "xls"],
    ["f.pptx", "ppt"],
    ["g.hwpx", "hwp"],
    ["h.webm", "web"],
    ["i.flac", "fla"],
    ["j.pdf", "pdf"],
    ["k.WAV", "wav"],
    ["n.mov", "mov"],
  ];
  for (const [name, want] of cases) {
    assert.equal(vaultFileExtLabel(name), want, name);
  }
  const helper = read("src/lib/vault-file-icon.ts");
  assert.doesNotMatch(
    helper,
    /export function vaultFileExtLabel[\s\S]*?toUpperCase/,
  );
  assert.match(
    read("src/components/meetings/new-meeting-session.tsx"),
    /vaultFileExtLabel/,
  );
  assert.match(
    read("src/components/vault/vault-file-icon.tsx"),
    /vaultFileExtLabel/,
  );
  assert.match(
    read("src/components/vault/vault-file-icon.tsx"),
    /소문자/,
  );
});

console.log("\nAll regression scenarios passed.");
