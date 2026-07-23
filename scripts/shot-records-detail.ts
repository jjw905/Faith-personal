import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:3000/dev/records-preview", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(800);
  await page.locator("#meetings .space-y-3").first().screenshot({
    path: "/tmp/records-header-only.png",
  });
  const item = page.locator("#meetings li").first();
  await item.screenshot({ path: "/tmp/records-item-only.png" });
  const styles = await item.evaluate((el) => {
    const row = el.firstElementChild as HTMLElement;
    const kids = [...row.children].map((c) => {
      const r = (c as HTMLElement).getBoundingClientRect();
      return {
        cls: (c as HTMLElement).className.slice(0, 100),
        w: Math.round(r.width),
        x: Math.round(r.x),
      };
    });
    return { rowW: Math.round(row.getBoundingClientRect().width), kids };
  });
  console.log(JSON.stringify(styles, null, 2));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await page.locator("#meetings .space-y-3").first().screenshot({
    path: "/tmp/records-header-mobile-only.png",
  });
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
