/**
 * 디자인 뷰포트가 실제 모바일 폭(container query)을 따르는지 회귀.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function scenario(name: string, fn: () => void) {
  fn();
  console.log(`ok — ${name}`);
}

scenario("globals · sm/md/lg 가 @container 기준", () => {
  const css = read("src/app/globals.css");
  assert.match(
    css,
    /@custom-variant md \(@container \(min-width: 768px\)\)/,
  );
  assert.match(
    css,
    /@custom-variant max-md \(@container \(max-width: 767px\)\)/,
  );
  assert.match(css, /@custom-variant sm \(@container/);
  assert.match(css, /@custom-variant lg \(@container/);
});

scenario("body · @container 루트", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /className="@container min-h-full"/);
});

scenario("DesignFrame · 전 씬 뷰포트 스테이지", () => {
  const frame = read("src/components/design/design-frame.tsx");
  assert.match(frame, /DesignViewportPicker/);
  assert.match(frame, /DesignViewportStage/);
  assert.match(frame, /useDesignViewport/);
});

scenario("DesignViewportStage · @container 폭 박스", () => {
  const stage = read("src/components/design/use-design-viewport.tsx");
  assert.match(stage, /@container relative mx-auto/);
  assert.match(stage, /data-faith-design-viewport/);
});

scenario("통계·팀 모바일 레일 · preview embed", () => {
  const rail = read("src/components/admin/stats-admin-mobile-rail.tsx");
  assert.match(rail, /embed\?: boolean/);
  assert.match(rail, /absolute inset-x-0 bottom-3/);
  const ops = read("src/components/admin/ops-stats-dashboard.tsx");
  assert.match(ops, /embed=\{previewLock\}/);
  const hub = read("src/components/team/team-chat-hub.tsx");
  assert.match(hub, /embed=\{previewLock\}/);
  assert.match(hub, /embed\?: boolean/);
});

scenario("auth/survey · DesignFrame에 맡기고 중복 뷰포트 없음", () => {
  const auth = read("src/components/design/scenes/auth-scenes.tsx");
  assert.doesNotMatch(auth, /DesignViewportPicker/);
  assert.doesNotMatch(auth, /DesignViewportStage/);
  const survey = read("src/components/design/scenes/survey-legal-scenes.tsx");
  assert.doesNotMatch(survey, /DesignViewportPicker/);
  assert.doesNotMatch(survey, /DesignViewportStage/);
});

console.log("\nall ok — design viewport mobile fidelity");
