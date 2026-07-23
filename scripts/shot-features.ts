import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.locator("#features").screenshot({ path: "/tmp/features-section.png" });
  const gap = await page.locator("#features").evaluate((sec) => {
    const row = sec.querySelector(".w-fit") as HTMLElement | null;
    if (!row) return { err: "no row" };
    const kids = [...row.children] as HTMLElement[];
    if (kids.length < 2) return { err: "kids", n: kids.length };
    const a = kids[0].getBoundingClientRect();
    const b = kids[1].getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    return {
      gap: Math.round(b.left - a.right),
      aW: Math.round(a.width),
      bW: Math.round(b.width),
      groupCenter: Math.round((a.left + b.right) / 2),
      rowCenter: Math.round(rr.left + rr.width / 2),
    };
  });
  console.log(JSON.stringify(gap));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.locator("#features").screenshot({
    path: "/tmp/features-section-mobile.png",
  });
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
