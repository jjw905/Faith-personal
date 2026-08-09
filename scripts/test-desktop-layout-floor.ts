/**
 * 데스크톱 레이아웃 바닥 · 창 폭별 크롬 유지 회귀.
 * 실행: npx tsx scripts/test-desktop-layout-floor.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DESKTOP_SHELL_MIN_WIDTH_PX,
  preferDesktopChrome,
  resolveSidebarVisual,
  SIDEBAR_RAIL_MIN_WIDTH_PX,
} from "../src/lib/sidebar-layout";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function scenario(name: string, fn: () => void) {
  fn();
  console.log(`ok — ${name}`);
}

scenario("CSS · pointer:fine 셸 바닥 64rem", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /@media \(pointer: fine\)/);
  assert.match(css, /\.faith-desktop-shell\s*\{[\s\S]*min-width:\s*64rem/);
  assert.equal(DESKTOP_SHELL_MIN_WIDTH_PX, 1024);
});

scenario("dashboard-shell · @container faith-desktop-shell", () => {
  assert.match(
    read("src/components/layout/dashboard-shell.tsx"),
    /@container faith-desktop-shell/,
  );
});

scenario("창 폭 매트릭스 · fine=항상 레일, touch=md 경계", () => {
  const widths = [320, 390, 600, 767, 768, 900, 1023, 1024, 1280, 1440];
  for (const w of widths) {
    const fine = preferDesktopChrome({
      pointerFine: true,
      viewportWidthPx: w,
    });
    const touch = preferDesktopChrome({
      pointerFine: false,
      viewportWidthPx: w,
    });
    assert.equal(fine, true, `fine pointer must stay desktop at ${w}`);
    assert.equal(
      resolveSidebarVisual({ isRailLayout: fine, collapsed: true }).mode,
      "rail",
    );
    const expectTouchDesktop = w >= SIDEBAR_RAIL_MIN_WIDTH_PX;
    assert.equal(
      touch,
      expectTouchDesktop,
      `touch at ${w}: expected desktop=${expectTouchDesktop}`,
    );
    assert.equal(
      resolveSidebarVisual({ isRailLayout: touch, collapsed: true }).mode,
      expectTouchDesktop ? "rail" : "mobile",
    );
  }
});

scenario("디자인 스테이지 · 폭이 포인터보다 우선", () => {
  assert.equal(
    preferDesktopChrome({
      designStageWidthPx: 390,
      pointerFine: true,
      viewportWidthPx: 1400,
    }),
    false,
  );
  assert.equal(
    preferDesktopChrome({
      designStageWidthPx: 900,
      pointerFine: false,
      viewportWidthPx: 400,
    }),
    true,
  );
});

scenario("공통 Button · 모바일 48, 데스크톱 sm≥36·본문≥sm", () => {
  const btn = read("src/components/ui/button.tsx");
  assert.match(btn, /min-h-12/);
  assert.match(btn, /icon:[\s\S]*min-h-12 min-w-12/);
  // sm 이 데스크톱에서 과도하게 작지 않음 (h-8/text-xs 금지)
  assert.doesNotMatch(btn, /sm:[\s\S]*md:h-8 md:min-h-8 md:text-xs/);
  assert.match(btn, /sm:[\s\S]*md:h-9 md:min-h-9 md:text-sm/);
});

console.log("\nall ok — desktop layout floor by window size");
