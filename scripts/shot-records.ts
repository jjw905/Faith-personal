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
  await page.waitForTimeout(1200);
  await page.locator("#meetings").screenshot({ path: "/tmp/records-section.png" });
  // mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.locator("#meetings").screenshot({ path: "/tmp/records-section-mobile.png" });
  console.log("ok", page.url());
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
