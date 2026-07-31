import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../streamdeck/com.cursor.lightroom.sdPlugin/imgs");

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(width, height, rgbaFn) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = rgbaFn(x, y, width, height);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function circleIcon(bg, fg) {
  return (x, y, w, h) => {
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    const dx = x - cx;
    const dy = y - cy;
    const r = Math.min(w, h) * 0.38;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= r) return fg;
    if (d <= r + 1.2) return [...bg.slice(0, 3), 180];
    return [0, 0, 0, 0];
  };
}

function roundedRectIcon(bg, accent) {
  return (x, y, w, h) => {
    const m = Math.floor(w * 0.12);
    const rr = Math.floor(w * 0.16);
    const inside =
      x >= m &&
      y >= m &&
      x < w - m &&
      y < h - m &&
      (x >= m + rr && x < w - m - rr || y >= m + rr && y < h - m - rr ||
        (x - (m + rr)) ** 2 + (y - (m + rr)) ** 2 <= rr * rr ||
        (x - (w - m - rr - 1)) ** 2 + (y - (m + rr)) ** 2 <= rr * rr ||
        (x - (m + rr)) ** 2 + (y - (h - m - rr - 1)) ** 2 <= rr * rr ||
        (x - (w - m - rr - 1)) ** 2 + (y - (h - m - rr - 1)) ** 2 <= rr * rr);
    if (!inside) return [0, 0, 0, 0];
    const band = y > h * 0.62;
    return band ? accent : bg;
  };
}

const icons = {
  "plugin.png": circleIcon([30, 30, 30, 255], [240, 180, 60, 255]),
  "category.png": circleIcon([30, 30, 30, 255], [240, 180, 60, 255]),
  "actions/connection.png": circleIcon([40, 40, 40, 255], [80, 200, 120, 255]),
  "actions/connection-on.png": circleIcon([30, 40, 35, 255], [80, 200, 120, 255]),
  "actions/connection-off.png": circleIcon([40, 30, 30, 255], [200, 80, 80, 255]),
  "actions/rating.png": roundedRectIcon([45, 38, 20, 255], [240, 190, 60, 255]),
  "actions/flag.png": roundedRectIcon([30, 50, 40, 255], [70, 190, 110, 255]),
  "actions/label.png": roundedRectIcon([50, 30, 40, 255], [220, 70, 70, 255]),
  "actions/navigate.png": roundedRectIcon([35, 40, 55, 255], [100, 160, 230, 255]),
  "actions/slider.png": roundedRectIcon([40, 40, 45, 255], [240, 180, 60, 255]),
  "actions/slider-dial.png": circleIcon([40, 40, 45, 255], [240, 180, 60, 255]),
  "actions/command.png": roundedRectIcon([45, 45, 50, 255], [180, 180, 190, 255]),
};

fs.mkdirSync(path.join(outDir, "actions"), { recursive: true });

for (const [rel, fn] of Object.entries(icons)) {
  const file = path.join(outDir, rel);
  fs.writeFileSync(file, png(72, 72, fn));
  const base = file.replace(/\.png$/, "");
  // Stream Deck resolves icons without extension; keep .png copies only.
  fs.copyFileSync(file, `${base}@2x.png`);
  console.log("wrote", rel);
}
