/**
 * 전 페이지 모바일 환경 회귀.
 * 라우트별 핵심 컴포넌트가 Faith mobile-web-ui(터치 48, 본문/입력 16px)를 따르는지 확인.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function scenario(name: string, fn: () => void) {
  fn();
  console.log(`ok — ${name}`);
}

function mustExist(path: string) {
  assert.ok(existsSync(join(root, path)), `missing ${path}`);
}

/** 페이지 → 검수 대상 파일 */
const PAGE_FILES: Record<string, string[]> = {
  "/": [
    "src/components/marketing/site-nav.tsx",
    "src/components/marketing/site-footer.tsx",
    "src/components/marketing/cta-button.tsx",
    "src/components/marketing/feature-timeline.tsx",
  ],
  "/pricing": [
    "src/components/marketing/pricing-tiers.tsx",
    "src/components/marketing/cta-button.tsx",
  ],
  "/about": ["src/components/marketing/about-docs-view.tsx"],
  "/privacy|/terms|/policy": ["src/components/legal/legal-docs-view.tsx"],
  "/help": ["src/components/help/help-docs-view.tsx"],
  "/login|/signup|/forgot-password|/reset-password": [
    "src/components/auth/auth-shell.tsx",
    "src/components/ui/input.tsx",
    "src/components/ui/button.tsx",
  ],
  "/dashboard|/meetings": [
    "src/components/dashboard/recent-meetings-table.tsx",
    "src/components/dashboard/meetings-mobile-action-bar.tsx",
    "src/components/layout/app-header.tsx",
  ],
  "/meetings/new|/team/live|/team/schedule": [
    "src/components/meetings/new-meeting-session.tsx",
    "src/components/dashboard/audio-upload-zone.tsx",
  ],
  "/meetings/[id]": [
    "src/components/meetings/meeting-detail-header.tsx",
    "src/components/meetings/meeting-summary-card.tsx",
    "src/components/meetings/meeting-record-layout.tsx",
  ],
  "/meetings/[id]/chat": ["src/components/meetings/meeting-chat-replay.tsx"],
  "/meetings/live/*|/meetings/team/*": [
    "src/components/meetings/personal-voice-room.tsx",
    "src/components/meetings/team-voice-room.tsx",
  ],
  "/team": [
    "src/components/team/team-chat-hub.tsx",
    "src/components/team/team-workspace-panel.tsx",
  ],
  "/vault": [
    "src/app/(dashboard)/vault/page.tsx",
    "src/components/vault/vault-mobile-action-bar.tsx",
  ],
  "/stats": [
    "src/components/admin/ops-stats-dashboard.tsx",
    "src/components/admin/stats-admin-mobile-rail.tsx",
  ],
  "/users": [
    "src/components/admin/users-admin-panel.tsx",
    "src/components/admin/users-admin-mobile-rail.tsx",
  ],
  "/plan": ["src/app/(dashboard)/plan/page.tsx"],
  "/account": [
    "src/components/account/account-settings.tsx",
    "src/components/account/social-links-card.tsx",
  ],
  "/settings": ["src/app/(dashboard)/settings/page.tsx"],
  "/survey": ["src/components/survey/survey-form.tsx"],
  "/changelog": ["src/components/changelog/changelog-list.tsx"],
  "/changelog/dev": ["src/components/changelog/dev-changelog-editor.tsx"],
  "/design": [
    "src/components/design/design-lab.tsx",
    "src/components/design/design-frame.tsx",
  ],
  "shell": [
    "src/components/layout/app-legal-footer.tsx",
    "src/components/layout/user-profile.tsx",
    "src/components/ui/input.tsx",
    "src/components/ui/button.tsx",
  ],
};

scenario("전 페이지 맵 · 파일 존재", () => {
  for (const files of Object.values(PAGE_FILES)) {
    for (const f of files) mustExist(f);
  }
});

scenario("공통 Input/Button 모바일 기본", () => {
  const input = read("src/components/ui/input.tsx");
  assert.match(input, /h-14/);
  assert.match(input, /text-base/);
  const btn = read("src/components/ui/button.tsx");
  assert.match(btn, /min-h-12/);
  assert.match(btn, /icon:\s*"min-h-12 min-w-12/);
});

scenario("/ · 마케팅 nav·CTA·푸터", () => {
  const nav = read("src/components/marketing/site-nav.tsx");
  assert.match(nav, /min-h-12/);
  assert.match(nav, /text-base/);
  const cta = read("src/components/marketing/cta-button.tsx");
  assert.match(cta, /min-h-12/);
  assert.match(cta, /text-base/);
  assert.doesNotMatch(cta, /text-sm font-semibold transition-colors/);
  const foot = read("src/components/marketing/site-footer.tsx");
  assert.match(foot, /text-base text-muted-2/);
});

scenario("/pricing · 결제 주기 터치 48", () => {
  const pricing = read("src/components/marketing/pricing-tiers.tsx");
  assert.match(pricing, /min-h-12 flex-1 rounded-full/);
  assert.doesNotMatch(pricing, /min-h-9 flex-1/);
});

scenario("/about·legal·help · 목차 라벨 text-base", () => {
  for (const f of [
    "src/components/marketing/about-docs-view.tsx",
    "src/components/legal/legal-docs-view.tsx",
    "src/components/help/help-docs-view.tsx",
  ]) {
    const src = read(f);
    assert.match(src, /text-base font-semibold tracking-wide text-muted-2/);
    assert.doesNotMatch(
      src,
      /px-2 text-sm font-semibold tracking-wide text-muted-2/,
    );
  }
});

scenario("/changelog · 본문 text-base", () => {
  const list = read("src/components/changelog/changelog-list.tsx");
  assert.match(list, /text-base font-semibold tabular-nums/);
  assert.match(list, /text-base leading-\[1\.65\] text-muted/);
  assert.doesNotMatch(list, /text-xs leading-relaxed text-muted-2/);
});

scenario("/settings·/plan·/account", () => {
  assert.match(
    read("src/app/(dashboard)/settings/page.tsx"),
    /role="switch"[\s\S]*min-h-12 min-w-12/,
  );
  assert.match(
    read("src/app/(dashboard)/plan/page.tsx"),
    /min-h-12 shrink-0 rounded-full px-4 text-base/,
  );
  assert.match(
    read("src/components/account/social-links-card.tsx"),
    /min-h-12 shrink-0 rounded-full border/,
  );
});

scenario("/users·다이얼로그·음성방", () => {
  assert.match(
    read("src/components/admin/users-admin-panel.tsx"),
    /min-h-12 px-3\.5 text-base md:h-8/,
  );
  const dlg = read("src/components/admin/user-admin-change-dialog.tsx");
  assert.match(dlg, /min-h-12 items-center rounded-full px-4 text-base/);
  assert.match(dlg, /min-h-12 items-center rounded-full px-3 text-base/);
  for (const f of [
    "src/components/meetings/personal-voice-room.tsx",
    "src/components/meetings/team-voice-room.tsx",
  ]) {
    const src = read(f);
    assert.doesNotMatch(src, /min-h-10 items-center rounded-full/);
    assert.match(src, /min-h-12 items-center rounded-full/);
  }
});

scenario("/stats·/team·셸", () => {
  assert.match(
    read("src/components/admin/stats-admin-mobile-rail.tsx"),
    /min-h-12/,
  );
  assert.match(
    read("src/components/team/team-chat-hub.tsx"),
    /embed=\{previewLock\}/,
  );
  const legal = read("src/components/layout/app-legal-footer.tsx");
  assert.match(legal, /min-h-12 items-center/);
  assert.match(legal, /text-base/);
  const profile = read("src/components/layout/user-profile.tsx");
  assert.match(profile, /min-h-12 w-full cursor-pointer[\s\S]*text-base/);
  assert.match(
    read("src/components/layout/app-header.tsx"),
    /h-12 w-12[\s\S]*md:hidden/,
  );
});

scenario("뷰포트 fidelity · container breakpoint", () => {
  const css = read("src/app/globals.css");
  assert.match(
    css,
    /@custom-variant md \(@container \(min-width: 768px\)\)/,
  );
  assert.match(read("src/app/layout.tsx"), /@container min-h-full/);
});

console.log("\nall ok — full page mobile audit");
