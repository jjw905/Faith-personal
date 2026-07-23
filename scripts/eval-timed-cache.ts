import { readFileSync } from "node:fs";
import { mapTimelineByTimedSegments } from "../src/lib/stt/timed-segments";

const timed = JSON.parse(
  readFileSync(".data/tmp-timed-cache.json", "utf8"),
) as Array<{ startSec: number; endSec: number; text: string }>;
const row = JSON.parse(
  readFileSync(".data/user-meetings/mtg-up-8031660d.json", "utf8"),
) as {
  semantic: {
    timeline: Array<{ title: string; summary?: string; speakers?: string[] }>;
  };
};

const dur = 420;
const mapped = mapTimelineByTimedSegments({
  items: row.semantic.timeline,
  timed,
  durationSec: dur,
});

for (const s of mapped) console.log(`${s.start}-${s.end}  ${s.title}`);

const gold = [
  ["의석", "정돈"],
  ["소위원회", "심사", "듣겠"],
  ["먼저", "환경부"],
  ["다음으로", "고용노동부"],
  ["의결하도록"],
].map(
  (needles) =>
    timed.find((s) => needles.every((n) => s.text.includes(n)))?.startSec ?? 0,
);

function clock(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
function parse(c: string) {
  const [mm, ss] = c.split(":").map(Number);
  return (mm || 0) * 60 + (ss || 0);
}

console.log(
  "gold",
  gold.map((s) => clock(s)).join(", "),
);

const starts = mapped.map((s) => parse(s.start));
let mae = 0;
for (let i = 0; i < gold.length; i++) mae += Math.abs(starts[i]! - gold[i]!);
console.log("A MAE", (mae / gold.length).toFixed(1));

let hit = 0;
for (let i = 0; i < gold.length; i++) {
  const a = parse(mapped[i]!.start);
  const b = parse(mapped[i]!.end);
  if (gold[i]! >= a - 3 && gold[i]! <= b + 3) hit += 1;
}
console.log("A hit", (hit / gold.length).toFixed(2));

const n = row.semantic.timeline.length;
let maeE = 0;
let hitE = 0;
for (let i = 0; i < gold.length; i++) {
  const start = (i * dur) / n;
  const end = ((i + 1) * dur) / n;
  maeE += Math.abs(start - gold[i]!);
  if (gold[i]! >= start - 3 && gold[i]! <= end + 3) hitE += 1;
}
console.log("even MAE", (maeE / gold.length).toFixed(1));
console.log("even hit", (hitE / gold.length).toFixed(2));
