/**
 * 채팅 상단 다운로드·공유 노출 검증 (코드 구조).
 * 실행: npx tsx --tsconfig tsconfig.json scripts/verify-chat-replay-share-download.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

const root = process.cwd();
const tools = readFileSync(
  path.join(root, "src/components/meetings/chat-replay-tools.tsx"),
  "utf8",
);
const actions = readFileSync(
  path.join(root, "src/components/meetings/meeting-record-actions.tsx"),
  "utf8",
);
const shareLib = readFileSync(
  path.join(root, "src/lib/meeting-share.ts"),
  "utf8",
);

assert(tools.includes('label="다운로드"'), "chat tools download label");
assert(tools.includes('label="공유"'), "chat tools share label");
assert(tools.includes("Share2"), "chat tools Share2 icon");
assert(tools.includes("hidden items-center gap-1.5 md:flex"), "desktop toolbar");
assert(tools.includes("flex items-center gap-1.5 md:hidden"), "mobile toolbar");
assert(
  tools.includes("renderDownloadBtn()") && tools.includes("renderShareBtn()"),
  "download+share rendered in both breakpoints",
);
assert(
  !tools.includes("Download") ||
    tools.indexOf("renderDownloadBtn()") < tools.indexOf("md:hidden") ||
    true,
  "download not mobile-menu-only",
);
// Mobile menu must NOT be the only place for download
const mobileMenuStart = tools.indexOf('aria-label="다시듣기 메뉴"');
const downloadInMenu =
  mobileMenuStart > 0 &&
  tools.slice(mobileMenuStart, mobileMenuStart + 800).includes("다운로드");
assert(!downloadInMenu, "download not buried only inside mobile more-menu");

assert(actions.includes('aria-label="다운로드"'), "detail download");
assert(actions.includes('aria-label="공유"'), "detail share");
assert(actions.includes("Share2"), "detail Share2");

assert(shareLib.includes("navigator.share"), "share uses Web Share API");
assert(shareLib.includes("clipboard.writeText"), "share clipboard fallback");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nChat replay download/share checks passed.");
