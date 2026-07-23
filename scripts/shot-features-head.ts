import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.locator("#features .w-fit").first().screenshot({
    path: "/tmp/features-head.png",
  });
  await browser.close();
  console.log("ok");
}
main();
