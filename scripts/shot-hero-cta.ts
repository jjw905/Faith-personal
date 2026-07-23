import { chromium } from "playwright";

async function main() {
  const b = await chromium.launch({ headless: true, channel: "chrome" });
  const p = await b.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await p.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  await p.screenshot({ path: "/tmp/branding-center.png" });

  const geo = await p.evaluate(() => {
    const intro = document.querySelector("main section .max-w-2xl") as HTMLElement;
    const chat = document.querySelector("main section [data-chat-mock], main section .relative.w-full") as HTMLElement;
    const lineHero = document.querySelector("main > section > div.w-px, main > section > div[aria-hidden]") as HTMLElement | null;
    const lines = [...document.querySelectorAll("main [aria-hidden].w-px, main div.w-px")].map((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), x: Math.round(r.left) };
    });
    const ir = intro.getBoundingClientRect();
    const cr = chat.getBoundingClientRect();
    const blockTop = Math.min(ir.top, cr.top);
    const blockBottom = Math.max(ir.bottom, cr.bottom);
    const blockMid = (blockTop + blockBottom) / 2;
    const h2 = document.querySelector("#features h2") as HTMLElement;
    const h2r = h2.getBoundingClientRect();
    return {
      blockMid: Math.round(blockMid),
      viewMid: 450,
      introTop: Math.round(ir.top),
      lines,
      h2TopDoc: Math.round(window.scrollY + h2r.top),
    };
  });
  console.log(JSON.stringify(geo, null, 2));

  // scroll so features headline top is visible with line above
  await p.locator("#features h2").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await p.waitForTimeout(300);
  await p.screenshot({ path: "/tmp/branding-line.png" });
  await b.close();
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
