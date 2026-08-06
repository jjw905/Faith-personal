/**
 * 사이드바 핀 / 레일 / 모바일 드로어 / 본문 간섭 시나리오.
 * 실행: npm run test:sidebar-layout
 */
import assert from "node:assert/strict";

import {
  SIDEBAR_RAIL_MIN_WIDTH_PX,
  nextCollapsedAfterPinToggle,
  pinnedDoesNotCoverContent,
  resolveSidebarVisual,
  sidebarOverlapsMainContent,
} from "../src/lib/sidebar-layout";

function scenario(name: string, fn: () => void) {
  fn();
  console.log(`ok — ${name}`);
}

function run() {
  scenario("레일: 본문 레일 오프셋, in-flow 없음 → 본문 비가림", () => {
    const v = resolveSidebarVisual({
      isRailLayout: true,
      collapsed: true,
    });
    assert.equal(v.mode, "rail");
    assert.equal(v.contentOffset, "rail");
    assert.equal(v.inFlowExpanded, false);
    assert.equal(v.showExpandedChrome, false);
    assert.equal(sidebarOverlapsMainContent(v), false);
  });

  scenario("핀(>>): expanded 오프셋 + in-flow → 본문 비가림", () => {
    const pinned = resolveSidebarVisual({
      isRailLayout: true,
      collapsed: false,
    });
    assert.equal(pinned.mode, "pinned");
    assert.equal(pinned.contentOffset, "expanded");
    assert.equal(pinned.inFlowExpanded, true);
    assert.equal(sidebarOverlapsMainContent(pinned), false);
    assert.ok(pinnedDoesNotCoverContent(pinned));
  });

  scenario("<< 레일로 복귀", () => {
    let collapsed = false;
    collapsed = nextCollapsedAfterPinToggle(collapsed);
    const rail = resolveSidebarVisual({
      isRailLayout: true,
      collapsed,
    });
    assert.equal(collapsed, true);
    assert.equal(rail.mode, "rail");
    assert.equal(sidebarOverlapsMainContent(rail), false);
  });

  scenario(">> << 왕복: pinned는 비가림, rail과 오프셋 다름", () => {
    const rail = resolveSidebarVisual({
      isRailLayout: true,
      collapsed: true,
    });
    const pinned = resolveSidebarVisual({
      isRailLayout: true,
      collapsed: false,
    });
    assert.ok(pinnedDoesNotCoverContent(pinned));
    assert.notEqual(rail.contentOffset, pinned.contentOffset);
  });

  scenario("데스크톱 이하(태블릿 md+): 레일 유지, 사라지지 않음", () => {
    assert.equal(SIDEBAR_RAIL_MIN_WIDTH_PX, 768);
    const tabletRail = resolveSidebarVisual({
      isRailLayout: true,
      collapsed: true,
    });
    assert.equal(tabletRail.mode, "rail");
    assert.equal(tabletRail.contentOffset, "rail");
    const tabletPinned = resolveSidebarVisual({
      isRailLayout: true,
      collapsed: false,
    });
    assert.equal(tabletPinned.mode, "pinned");
    assert.ok(pinnedDoesNotCoverContent(tabletPinned));
  });

  scenario("모바일(< md): 오프셋 없음, 드로어용", () => {
    const v = resolveSidebarVisual({
      isRailLayout: false,
      collapsed: true,
    });
    assert.equal(v.mode, "mobile");
    assert.equal(v.contentOffset, "none");
    assert.equal(v.showExpandedChrome, true);
    assert.equal(sidebarOverlapsMainContent(v), false);
  });

  console.log("\nAll sidebar layout scenarios passed.");
}

run();
