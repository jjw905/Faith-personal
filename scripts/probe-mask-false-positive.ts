/**
 * 오탐으로 의심되는 값이 어떤 문장에서 걸렸는지 본다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/probe-mask-false-positive.ts 이어서 한눈에
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { maskPii } from "../src/lib/masking/mask";

const TARGETS = process.argv.slice(2);
const SOURCES = [
  "ktv-briefing-20251231 (1).txt",
  "brief-startup.txt",
  "brief-ailab.txt",
  "brief-mou.txt",
];

function main() {
  for (const name of SOURCES) {
    const path = join(homedir(), "Downloads", name);
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const hits = maskPii(line, { style: "label" }).matches.filter(
        (match) => TARGETS.length === 0 || TARGETS.includes(match.value),
      );
      if (hits.length === 0) continue;
      console.log(`[${hits.map((h) => `${h.type}:${h.value}`).join(", ")}]`);
      console.log(`   ${line.slice(0, 140)}`);
    }
  }
}

main();
