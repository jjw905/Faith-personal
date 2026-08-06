/**
 * 문서형 페이지(약관·도움말·소개) 모바일 가로 스크롤 회귀.
 * 긴 URL·미개행 문자열이 본문 폭을 밀어 overflow-x 가 생기지 않게 한다.
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

const DOC_VIEWS = [
  "src/components/legal/legal-docs-view.tsx",
  "src/components/help/help-docs-view.tsx",
  "src/components/marketing/about-docs-view.tsx",
] as const;

scenario("문서 스크롤 · overflow-x-hidden", () => {
  for (const f of DOC_VIEWS) {
    const src = read(f);
    assert.match(
      src,
      /overflow-x-hidden overflow-y-auto/,
      `${f} missing overflow-x-hidden`,
    );
  }
});

scenario("문서 본문 · break-words / overflow-wrap", () => {
  for (const f of DOC_VIEWS) {
    const src = read(f);
    assert.match(src, /break-words/, `${f} missing break-words`);
    assert.match(
      src,
      /\[overflow-wrap:anywhere\]/,
      `${f} missing overflow-wrap:anywhere`,
    );
  }
});

scenario("모바일 목차 · scrollIntoView 본문 가로 스크롤 방지", () => {
  const rail = read("src/components/docs/docs-mobile-toc-rail.tsx");
  assert.match(rail, /scroller\.scrollTo/);
  assert.doesNotMatch(rail, /\.scrollIntoView\(/);
});

console.log("\nall ok — docs mobile horizontal overflow");
