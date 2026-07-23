import { chromium } from "playwright";

async function main() {
  const b = await chromium.launch({ headless: true, channel: "chrome" });
  for (const [name, w, h] of [["tall", 1440, 819], ["std", 1440, 900]] as const) {
    const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    await p.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
    await p.waitForTimeout(700);
    const featTop = await p.locator("#features").evaluate((el) => window.scrollY + el.getBoundingClientRect().top);
    await p.evaluate(({ y, vh }) => window.scrollTo(0, Math.max(0, y - vh + 120)), { y: featTop, vh: h });
    await p.waitForTimeout(200);
    await p.screenshot({ path: `/tmp/hero-band-${name}.png`, clip: { x: 0, y: h - 360, width: w, height: 360 } });
    await p.close();
  }
  console.log("ok");
  await b.close();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
