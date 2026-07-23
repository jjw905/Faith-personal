import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
  });

  const shots: { name: string; width: number; height: number }[] = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ];

  for (const s of shots) {
    const page = await browser.newPage({
      viewport: { width: s.width, height: s.height },
      reducedMotion: "reduce",
    });
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
    await page.waitForTimeout(900);

    // Hero CTA block
    const intro = page.locator("main section").first().locator(".max-w-2xl");
    await intro.screenshot({ path: `/tmp/check-hero-${s.name}.png` });

    const ctas = await page.locator(".max-w-2xl a").evaluateAll((els) =>
      els.slice(0, 2).map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          text: (el.textContent || "").trim(),
          w: Math.round(r.width),
          h: Math.round(r.height),
          font: cs.fontSize,
          visible: r.width > 0 && cs.opacity !== "0",
        };
      }),
    );

    // Features head (copy + bubbles)
    await page.locator("#features").evaluate((el) =>
      el.scrollIntoView({ block: "start" }),
    );
    await page.waitForTimeout(300);
    await page.locator("#features .w-fit").first().screenshot({
      path: `/tmp/check-features-head-${s.name}.png`,
    });

    const head = await page.locator("#features .w-fit").first().evaluate((row) => {
      const kids = [...row.children] as HTMLElement[];
      const rr = row.getBoundingClientRect();
      if (kids.length < 2) return { err: "kids" };
      const a = kids[0].getBoundingClientRect();
      const b = kids[1].getBoundingClientRect();
      const gap =
        getComputedStyle(row).flexDirection === "column"
          ? Math.round(b.top - a.bottom)
          : Math.round(b.left - a.right);
      return {
        dir: getComputedStyle(row).flexDirection,
        gap,
        groupCenter: Math.round((a.left + b.right) / 2),
        rowCenter: Math.round(rr.left + rr.width / 2),
        viewCenter: Math.round(window.innerWidth / 2),
      };
    });

    // Seam: hero bottom → features top
    const seamY = await page.evaluate(() => {
      const feat = document.querySelector("#features") as HTMLElement;
      return Math.max(0, window.scrollY + feat.getBoundingClientRect().top - 140);
    });
    await page.evaluate((y) => window.scrollTo(0, y), seamY);
    await page.waitForTimeout(200);
    await page.screenshot({
      path: `/tmp/check-seam-${s.name}.png`,
      clip: { x: 0, y: 0, width: s.width, height: 320 },
    });

    const featBg = await page.locator("#features").evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        image: cs.backgroundImage.slice(0, 140),
        color: cs.backgroundColor,
      };
    });

    console.log(
      JSON.stringify({
        viewport: s.name,
        ctas,
        head,
        featBg,
      }),
    );

    await page.close();
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
