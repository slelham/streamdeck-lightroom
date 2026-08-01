#!/usr/bin/env node
/**
 * Sleek Stream Deck icons — dark rounded tiles + crisp glyphs.
 * Inspired by pro Lightroom profile packs (minimal, high-contrast, color-coded).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../streamdeck/com.cursor.lightroom.sdPlugin/imgs");

const SIZE = 144; // generate @2x, downscale copy for 1x via nearest later (we write both at 144 and 72)

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
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

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round((a[3] ?? 255) + ((b[3] ?? 255) - (a[3] ?? 255)) * t),
  ];
}

function dist(x, y, cx, cy) {
  return Math.hypot(x - cx, y - cy);
}

function softCircle(x, y, cx, cy, r, feather = 1.2) {
  const d = dist(x, y, cx, cy);
  if (d <= r - feather) return 1;
  if (d >= r + feather) return 0;
  return 1 - (d - (r - feather)) / (2 * feather);
}

function roundedRectMask(x, y, w, h, m, rr) {
  const left = m;
  const top = m;
  const right = w - m - 1;
  const bottom = h - m - 1;
  if (x < left || x > right || y < top || y > bottom) return 0;

  const ix = x;
  const iy = y;
  // corner centers
  const corners = [
    [left + rr, top + rr],
    [right - rr, top + rr],
    [left + rr, bottom - rr],
    [right - rr, bottom - rr],
  ];
  if (ix >= left + rr && ix <= right - rr) return 1;
  if (iy >= top + rr && iy <= bottom - rr) return 1;
  let best = 0;
  for (const [cx, cy] of corners) {
    best = Math.max(best, softCircle(ix, iy, cx, cy, rr, 1.1));
  }
  return best;
}

function strokeCircle(x, y, cx, cy, r, thickness) {
  const d = dist(x, y, cx, cy);
  const half = thickness / 2;
  if (Math.abs(d - r) <= half) {
    return 1 - Math.abs(d - r) / (half + 0.001);
  }
  return 0;
}

function strokeLine(x, y, x1, y1, x2, y2, thickness) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((x - x1) * dx + (y - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  const d = Math.hypot(x - px, y - py);
  const half = thickness / 2;
  if (d <= half) return 1 - d / (half + 0.001);
  return 0;
}

function fillPoly(x, y, pts) {
  // ray cast
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0001) + xi;
    if (intersect) inside = !inside;
  }
  return inside ? 1 : 0;
}

function starMask(x, y, cx, cy, rOuter, rInner, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
  }
  return fillPoly(x, y, pts);
}

function tileBackground(x, y, w, h, accent) {
  const m = Math.round(w * 0.1);
  const rr = Math.round(w * 0.2);
  const mask = roundedRectMask(x, y, w, h, m, rr);
  if (mask <= 0) return [0, 0, 0, 0];

  // deep charcoal with subtle vertical gradient + top sheen
  const t = y / (h - 1);
  const base = mix([28, 30, 36, 255], [16, 17, 20, 255], t);
  let color = y < h * 0.42 ? mix(base, [48, 52, 62, 255], (1 - y / (h * 0.42)) * 0.28) : base;

  // thin accent underline (pro-pack style, not a thick footer)
  const accentY0 = h - m - Math.max(2, Math.round(h * 0.035));
  const accentY1 = h - m - 1;
  if (y >= accentY0 && y <= accentY1 && x > m + rr * 0.35 && x < w - m - rr * 0.35) {
    color = mix(color, accent, 0.92);
  }

  // soft accent rim
  const inset = roundedRectMask(x, y, w, h, m + 1.2, Math.max(1, rr - 1));
  if (mask > 0.25 && inset < 0.4) {
    color = mix(color, accent, 0.18);
  }

  color[3] = Math.round(255 * mask);
  return color;
}

function drawGlyph(base, x, y, w, h, glyphFn, color, strength = 1) {
  const g = glyphFn(x, y, w, h) * strength;
  if (g <= 0) return base;
  return mix(base, [...color.slice(0, 3), 255], clamp(g, 0, 1));
}

// —— Glyphs ——
function glyphStar(x, y, w, h) {
  return starMask(x, y, w / 2, h / 2 - h * 0.02, w * 0.22, w * 0.1, 5);
}

function glyphFlag(x, y, w, h) {
  const cx = w * 0.42;
  const top = h * 0.28;
  const bot = h * 0.72;
  const pole = strokeLine(x, y, cx, top, cx, bot, w * 0.045);
  const flag = fillPoly(x, y, [
    [cx + w * 0.02, top],
    [cx + w * 0.28, top + h * 0.08],
    [cx + w * 0.02, top + h * 0.2],
  ]);
  return Math.max(pole, flag);
}

function glyphReject(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const r = w * 0.2;
  const ring = strokeCircle(x, y, cx, cy, r, w * 0.05);
  const bar = strokeLine(x, y, cx - r * 0.55, cy + r * 0.55, cx + r * 0.55, cy - r * 0.55, w * 0.05);
  return Math.max(ring, bar);
}

function glyphChevron(dir) {
  return (x, y, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const s = w * 0.12;
    if (dir === "left") {
      return Math.max(
        strokeLine(x, y, cx + s, cy - s * 1.4, cx - s, cy, w * 0.055),
        strokeLine(x, y, cx - s, cy, cx + s, cy + s * 1.4, w * 0.055),
      );
    }
    return Math.max(
      strokeLine(x, y, cx - s, cy - s * 1.4, cx + s, cy, w * 0.055),
      strokeLine(x, y, cx + s, cy, cx - s, cy + s * 1.4, w * 0.055),
    );
  };
}

function glyphSlider(x, y, w, h) {
  const cy = h * 0.5;
  const x1 = w * 0.24;
  const x2 = w * 0.76;
  const track = strokeLine(x, y, x1, cy, x2, cy, w * 0.045);
  const knob = softCircle(x, y, w * 0.6, cy, w * 0.085, 1.4);
  const capL = softCircle(x, y, x1, cy, w * 0.035, 1);
  const capR = softCircle(x, y, x2, cy, w * 0.035, 1);
  return Math.max(track, knob, capL, capR);
}

function glyphDial(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2 + h * 0.02;
  const r = w * 0.2;
  const ring = strokeCircle(x, y, cx, cy, r, w * 0.05);
  const needle = strokeLine(x, y, cx, cy, cx + r * 0.55, cy - r * 0.55, w * 0.045);
  const hub = softCircle(x, y, cx, cy, w * 0.045, 0.8);
  return Math.max(ring, needle, hub);
}

function glyphLink(x, y, w, h) {
  const a = strokeCircle(x, y, w * 0.38, h * 0.5, w * 0.12, w * 0.045);
  const b = strokeCircle(x, y, w * 0.62, h * 0.5, w * 0.12, w * 0.045);
  const bridge = strokeLine(x, y, w * 0.42, h * 0.5, w * 0.58, h * 0.5, w * 0.045);
  return Math.max(a, b, bridge);
}

function glyphLinkOff(x, y, w, h) {
  const link = glyphLink(x, y, w, h);
  const slash = strokeLine(x, y, w * 0.3, h * 0.7, w * 0.7, h * 0.3, w * 0.05);
  return Math.max(link * 0.55, slash);
}

function glyphLabel(x, y, w, h) {
  // palette / swatch
  const c1 = softCircle(x, y, w * 0.38, h * 0.42, w * 0.1, 1);
  const c2 = softCircle(x, y, w * 0.55, h * 0.38, w * 0.09, 1);
  const c3 = softCircle(x, y, w * 0.48, h * 0.58, w * 0.095, 1);
  return Math.max(c1, c2, c3);
}

function glyphCommand(x, y, w, h) {
  // spark / bolt for commands
  const pts = [
    [w * 0.55, h * 0.26],
    [w * 0.38, h * 0.52],
    [w * 0.5, h * 0.52],
    [w * 0.42, h * 0.74],
    [w * 0.64, h * 0.46],
    [w * 0.52, h * 0.46],
  ];
  return fillPoly(x, y, pts);
}

function glyphPreset(x, y, w, h) {
  // three stacked rows — preset list metaphor
  const bar = (yy, alpha) => {
    const x1 = w * 0.28;
    const x2 = w * 0.72;
    const midY = yy + h * 0.045;
    const onRow = y >= yy && y <= yy + h * 0.09;
    if (!onRow || x < x1 || x > x2) return 0;
    const edge = Math.min(x - x1, x2 - x, 4) / 4;
    return alpha * clamp(edge, 0, 1);
  };
  return Math.max(bar(h * 0.32, 1), bar(h * 0.46, 0.85), bar(h * 0.6, 0.7));
}

function glyphCrop(x, y, w, h) {
  const m = w * 0.3;
  const s = w * 0.4;
  const t = w * 0.045;
  return Math.max(
    strokeLine(x, y, m, m, m + s, m, t),
    strokeLine(x, y, m, m, m, m + s, t),
    strokeLine(x, y, m + s, m + s * 0.35, m + s, m + s, t),
    strokeLine(x, y, m + s * 0.35, m + s, m + s, m + s, t),
  );
}

function glyphMask(x, y, w, h) {
  const left = softCircle(x, y, w * 0.42, h * 0.5, w * 0.16, 1.2);
  const right = softCircle(x, y, w * 0.58, h * 0.5, w * 0.16, 1.2);
  // crescent-ish: left filled, right subtract-ish via ring
  const ring = strokeCircle(x, y, w * 0.5, h * 0.5, w * 0.2, w * 0.05);
  return Math.max(left * (x < w * 0.52 ? 1 : 0.15), ring);
}

function glyphUndo(x, y, w, h) {
  const cx = w * 0.52;
  const cy = h * 0.5;
  const r = w * 0.16;
  // arc approximated by polyline strokes
  let v = 0;
  for (let a = 0.4; a < Math.PI * 1.35; a += 0.08) {
    const ang = Math.PI * 0.15 + a;
    const x1 = cx + Math.cos(ang) * r;
    const y1 = cy + Math.sin(ang) * r;
    const x2 = cx + Math.cos(ang + 0.1) * r;
    const y2 = cy + Math.sin(ang + 0.1) * r;
    v = Math.max(v, strokeLine(x, y, x1, y1, x2, y2, w * 0.045));
  }
  const tipX = cx + Math.cos(0.55) * r;
  const tipY = cy + Math.sin(0.55) * r;
  v = Math.max(
    v,
    strokeLine(x, y, tipX, tipY, tipX + w * 0.08, tipY - w * 0.02, w * 0.04),
    strokeLine(x, y, tipX, tipY, tipX + w * 0.02, tipY + w * 0.08, w * 0.04),
  );
  return v;
}

function glyphSun(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const core = softCircle(x, y, cx, cy, w * 0.1, 1);
  let rays = 0;
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(ang) * w * 0.16;
    const y1 = cy + Math.sin(ang) * w * 0.16;
    const x2 = cx + Math.cos(ang) * w * 0.24;
    const y2 = cy + Math.sin(ang) * w * 0.24;
    rays = Math.max(rays, strokeLine(x, y, x1, y1, x2, y2, w * 0.035));
  }
  return Math.max(core, rays);
}

function makeIcon(accent, glyphFn, glyphColor = null) {
  const ink = glyphColor || [245, 247, 250, 255];
  return (x, y, w, h) => {
    let px = tileBackground(x, y, w, h, accent);
    if (px[3] === 0) return px;
    px = drawGlyph(px, x, y, w, h, glyphFn, ink, 1);
    return px;
  };
}

const AMBER = [240, 176, 64, 255];
const GREEN = [72, 200, 130, 255];
const RED = [230, 84, 84, 255];
const BLUE = [96, 168, 240, 255];
const PURPLE = [180, 140, 255, 255];
const SLATE = [170, 180, 195, 255];
const GOLD = [255, 200, 72, 255];

const icons = {
  "plugin.png": makeIcon(AMBER, glyphSun, AMBER),
  "category.png": makeIcon(AMBER, glyphSun, AMBER),
  "actions/connection.png": makeIcon(GREEN, glyphLink, GREEN),
  "actions/connection-on.png": makeIcon(GREEN, glyphLink, GREEN),
  "actions/connection-off.png": makeIcon(RED, glyphLinkOff, RED),
  "actions/rating.png": makeIcon(GOLD, glyphStar, GOLD),
  "actions/flag.png": makeIcon(GREEN, glyphFlag, GREEN),
  "actions/reject.png": makeIcon(RED, glyphReject, RED),
  "actions/label.png": makeIcon(RED, glyphLabel, [255, 120, 120, 255]),
  "actions/navigate.png": makeIcon(BLUE, glyphChevron("right"), BLUE),
  "actions/navigate-left.png": makeIcon(BLUE, glyphChevron("left"), BLUE),
  "actions/slider.png": makeIcon(AMBER, glyphSlider, AMBER),
  "actions/slider-dial.png": makeIcon(AMBER, glyphDial, AMBER),
  "actions/command.png": makeIcon(SLATE, glyphCommand, SLATE),
  "actions/preset.png": makeIcon(PURPLE, glyphPreset, PURPLE),
  "actions/crop.png": makeIcon(SLATE, glyphCrop, SLATE),
  "actions/mask.png": makeIcon(PURPLE, glyphMask, PURPLE),
  "actions/undo.png": makeIcon(SLATE, glyphUndo, SLATE),
  "actions/auto.png": makeIcon(AMBER, glyphSun, AMBER),
};

function renderBuffer(size, rgbaFn) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a = 255] = rgbaFn(x, y, size, size);
      const i = (y * size + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
  return buf;
}

function boxDownscale(src, srcSize, dstSize) {
  const scale = srcSize / dstSize;
  const out = Buffer.alloc(dstSize * dstSize * 4);
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      const x0 = Math.floor(x * scale);
      const y0 = Math.floor(y * scale);
      const x1 = Math.floor((x + 1) * scale);
      const y1 = Math.floor((y + 1) * scale);
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * srcSize + sx) * 4;
          const alpha = src[i + 3];
          r += src[i] * alpha;
          g += src[i + 1] * alpha;
          b += src[i + 2] * alpha;
          a += alpha;
          n++;
        }
      }
      const o = (y * dstSize + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(a / n);
      }
    }
  }
  return out;
}

function pngFromRgba(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(path.join(outDir, "actions"), { recursive: true });

for (const [rel, fn] of Object.entries(icons)) {
  const file72 = path.join(outDir, rel);
  const file144 = file72.replace(/\.png$/, "@2x.png");
  const hi = renderBuffer(SIZE, fn);
  fs.writeFileSync(file144, pngFromRgba(SIZE, hi));
  fs.writeFileSync(file72, pngFromRgba(72, boxDownscale(hi, SIZE, 72)));
  console.log("wrote", rel);
}
