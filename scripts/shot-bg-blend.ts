import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const y = await page.locator("#features").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, window.scrollY + r.top - 160);
  });
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(200);
  await page.screenshot({
    path: "/tmp/bg-blend-seam.png",
    clip: { x: 0, y: 0, width: 1440, height: 360 },
  });
  // sample colors across seam
  const colors = await page.evaluate(async () => {
    const feat = document.querySelector("#features") as HTMLElement;
    const top = feat.getBoundingClientRect().top;
    const canvas = document.createElement("canvas");
    // use elements behind points via elementFromPoint isn't color
    // read computed bg of sections
    const hero = document.querySelector("main section") as HTMLElement;
    return {
      heroBg: getComputedStyle(hero).backgroundColor,
      featBg: getComputedStyle(feat).backgroundImage.slice(0, 120),
      featTop: Math.round(top),
    };
  });
  console.log(JSON.stringify(colors));
  await browser.close();
}
main();
