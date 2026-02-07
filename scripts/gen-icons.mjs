import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

const OUT_DIR = path.resolve('public/icons');

const COLORS = {
  bg: hexToRgb('#0b1020'),
  fg: hexToRgb('#ffffff'),
  accent: hexToRgb('#7dd3fc'), // sky-300-ish
};

function hexToRgb(hex) {
  const h = hex.replace('#', '').trim();
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function setPx(png, x, y, { r, g, b }, a = 255) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx + 0] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function fill(png, color) {
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) setPx(png, x, y, color, 255);
  }
}

function drawCircle(png, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPx(png, x, y, color);
    }
  }
}

function drawRing(png, cx, cy, outerR, innerR, color) {
  const o2 = outerR * outerR;
  const i2 = innerR * innerR;
  for (let y = Math.floor(cy - outerR); y <= Math.ceil(cy + outerR); y++) {
    for (let x = Math.floor(cx - outerR); x <= Math.ceil(cx + outerR); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= o2 && d2 >= i2) setPx(png, x, y, color);
    }
  }
}

function drawStaff(png, yMid, widthPad, color) {
  // 5-line staff (music) with slight alpha to feel softer
  const lines = 5;
  const gap = Math.max(2, Math.round(png.height * 0.035));
  const x0 = widthPad;
  const x1 = png.width - widthPad - 1;
  const y0 = yMid - Math.floor(((lines - 1) * gap) / 2);
  for (let i = 0; i < lines; i++) {
    const y = y0 + i * gap;
    for (let x = x0; x <= x1; x++) setPx(png, x, y, color, 190);
  }
}

async function writePng(filePath, png) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const buf = PNG.sync.write(png);
  await fs.writeFile(filePath, buf);
}

function makeIcon(size) {
  const png = new PNG({ width: size, height: size });
  fill(png, COLORS.bg);

  const cx = size / 2;
  const cy = size / 2;

  // Big ring
  const outer = Math.round(size * 0.34);
  const inner = Math.round(size * 0.26);
  drawRing(png, cx, cy, outer, inner, COLORS.fg);

  // Accent dot (like a note head)
  drawCircle(png, Math.round(cx + size * 0.16), Math.round(cy - size * 0.08), Math.round(size * 0.06), COLORS.accent);

  // Staff lines
  drawStaff(png, Math.round(cy + size * 0.08), Math.round(size * 0.18), COLORS.fg);

  return png;
}

async function main() {
  const targets = [
    { name: 'pwa-192x192.png', size: 192 },
    { name: 'pwa-512x512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ];

  for (const t of targets) {
    const png = makeIcon(t.size);
    const out = path.join(OUT_DIR, t.name);
    await writePng(out, png);
    console.log('Wrote', out);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
