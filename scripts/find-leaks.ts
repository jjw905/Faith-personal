import { maskPii } from "@/lib/masking";
import { generateRandomText } from "@/lib/masking/random-conversation";

// 마스킹 후에도 남아있으면 누수 의심: 한글숫자 5+연속 또는 아라비아 6+연속
const HANGUL_RUN = /(?:제로|공백|하나|다섯|여섯|일곱|여덟|아홉|[공영일이원둘두삼셋세사넷네오육륙칠팔구]){5,}/;
const ARABIC_RUN = /(?<![*\-])\d{6,}(?![*\-])/;

let leaks = 0;
const N = Number(process.env.N ?? 4000);
for (let i = 0; i < N; i++) {
  const text = generateRandomText();
  const out = maskPii(text).masked;
  const h = out.match(HANGUL_RUN);
  const a = out.match(ARABIC_RUN);
  if (h || a) {
    leaks++;
    if (leaks <= 30) {
      console.log(`LEAK(${h ? "한글:" + h[0] : ""}${a ? " 아라:" + a[0] : ""})`);
      console.log(`  in : ${text}`);
      console.log(`  out: ${out}`);
      console.log("  " + "─".repeat(70));
    }
  }
}
console.log(`\n누수 의심 ${leaks} / ${N}`);
