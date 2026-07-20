import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";

const TRUST = [0x25, 0x63, 0xeb];
const NAVY = [0x1b, 0x3a, 0x5c];
const TEAL = [0x0d, 0x94, 0x88];
const SOFT = [0x60, 0xa5, 0xfa];

async function load(p) {
  return sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function inkStrength(r, g, b) {
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return Math.min(1, Math.max(0, 1 - L));
}

function components(data, w, h, threshold = 0.35) {
  const visited = new Uint8Array(w * h);
  const comps = [];
  const isInk = (x, y) => {
    const o = (y * w + x) * 4;
    return inkStrength(data[o], data[o + 1], data[o + 2]) >= threshold;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx] || !isInk(x, y)) continue;
      const stack = [[x, y]];
      visited[idx] = 1;
      let minX = x,
        maxX = x,
        minY = y,
        maxY = y;
      const pixels = [];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        pixels.push([cx, cy]);
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (const [nx, ny] of [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ]) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nidx = ny * w + nx;
          if (visited[nidx] || !isInk(nx, ny)) continue;
          visited[nidx] = 1;
          stack.push([nx, ny]);
        }
      }
      if (pixels.length > 20) {
        comps.push({ minX, maxX, minY, maxY, pixels, count: pixels.length });
      }
    }
  }
  return comps.sort((a, b) => a.minX - b.minX || a.minY - b.minY);
}

function paint({ data, info }, mode) {
  const w = info.width;
  const h = info.height;
  const comps = components(data, w, h);
  // 읽기 순: 왼쪽 위(점) → 왼쪽 줄기 → 오른쪽 가로 → 오른쪽 줄기
  const withCenter = comps.map((c) => ({
    ...c,
    cx: (c.minX + c.maxX) / 2,
    cy: (c.minY + c.maxY) / 2,
  }));
  const midX =
    withCenter.reduce((s, c) => s + c.cx, 0) / Math.max(1, withCenter.length);
  const left = withCenter.filter((c) => c.cx < midX).sort((a, b) => a.cy - b.cy);
  const right = withCenter
    .filter((c) => c.cx >= midX)
    .sort((a, b) => a.cy - b.cy);
  // 오른쪽: 가로막대가 더 위, 짧은 줄기가 아래. cy로 정렬되면 bar → stemR
  // 가로가 stem보다 넓고 위쪽이면 cy 작은 것이 bar
  const ordered = [...left, ...right];

  console.log(
    mode,
    ordered.map((c) => ({
      cx: Math.round(c.cx),
      cy: Math.round(c.cy),
      n: c.count,
    })),
  );

  let colors;
  if (mode === "solid") {
    colors = ordered.map(() => TRUST);
  } else if (mode === "duo") {
    colors = [
      ...left.map(() => TRUST),
      ...right.map(() => TEAL),
    ];
  } else {
    // 점 soft, 왼줄기 trust, 가로 navy, 오른줄기 teal
    const palette = [SOFT, TRUST, NAVY, TEAL];
    colors = ordered.map((_, i) => palette[i] || TRUST);
  }

  const out = Buffer.alloc(w * h * 4, 0);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = 255;
  }

  // 부품 픽셀만 해당 색으로 (근접색 번짐 방지)
  const owner = new Int16Array(w * h).fill(-1);
  for (let i = 0; i < ordered.length; i++) {
    for (const [x, y] of ordered[i].pixels) {
      owner[y * w + x] = i;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const s = inkStrength(data[o], data[o + 1], data[o + 2]);
      if (s < 0.08) continue;
      let best = owner[y * w + x];
      if (best < 0) {
        // 안티앨리어싱 가장자리만 최근접 부품
        let bestD = Infinity;
        for (let i = 0; i < ordered.length; i++) {
          const c = ordered[i];
          const d = (x - c.cx) ** 2 + (y - c.cy) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
      const rgb = colors[best] || TRUST;
      out[o] = Math.round(rgb[0] * s + 255 * (1 - s));
      out[o + 1] = Math.round(rgb[1] * s + 255 * (1 - s));
      out[o + 2] = Math.round(rgb[2] * s + 255 * (1 - s));
      out[o + 3] = 255;
    }
  }
  return { out, w, h };
}

async function makeTransparentFromOriginal(origData, coloredData, w, h) {
  const out = Buffer.alloc(w * h * 4, 0);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const s = inkStrength(origData[o], origData[o + 1], origData[o + 2]);
    if (s < 0.05) {
      out[o + 3] = 0;
      continue;
    }
    out[o] = Math.min(
      255,
      Math.max(0, Math.round((coloredData[o] - 255 * (1 - s)) / s)),
    );
    out[o + 1] = Math.min(
      255,
      Math.max(0, Math.round((coloredData[o + 1] - 255 * (1 - s)) / s)),
    );
    out[o + 2] = Math.min(
      255,
      Math.max(0, Math.round((coloredData[o + 2] - 255 * (1 - s)) / s)),
    );
    out[o + 3] = Math.round(Math.min(255, s * 255));
  }
  return out;
}

async function process(src, modes) {
  const { data, info } = await load(src);
  const base = path.basename(src, ".png");
  const outs = [];
  for (const mode of modes) {
    const { out, w, h } = paint({ data, info }, mode);
    const fillName = `public/brand/${base}-${mode}.png`;
    await sharp(out, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(fillName);
    const tr = await makeTransparentFromOriginal(data, out, w, h);
    const trName = `public/brand/${base}-${mode}-alpha.png`;
    await sharp(tr, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(trName);
    outs.push(fillName, trName);
  }
  return outs;
}

const files = await process("public/brand/faith-logo-140-fill.png", [
  "solid",
  "duo",
  "quad",
]);
if (fs.existsSync("public/brand/faith-logo-512-fill.png")) {
  await process("public/brand/faith-logo-512-fill.png", ["solid", "duo"]);
}

const download = path.join(os.homedir(), "Downloads");
for (const f of [
  "faith-logo-140-fill-solid.png",
  "faith-logo-140-fill-duo.png",
  "faith-logo-140-fill-quad.png",
  "faith-logo-140-fill-solid-alpha.png",
  "faith-logo-140-fill-duo-alpha.png",
]) {
  fs.copyFileSync(`public/brand/${f}`, path.join(download, f));
}
console.log("done", files);
