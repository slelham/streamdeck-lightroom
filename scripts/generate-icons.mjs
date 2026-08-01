#!/usr/bin/env node
/**
 * Distinct Stream Deck action icons — unique glyphs per action, not a shared
 * generic tile chrome. Soft AA, category colors, large readable symbols.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../streamdeck/com.cursor.lightroom.sdPlugin/imgs");
const HI = 144;
const LO = 72;

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

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function mix(a, b, t) {
  t = clamp(t, 0, 1);
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

function sdfCircle(x, y, cx, cy, r) {
  return dist(x, y, cx, cy) - r;
}

function sdfBox(x, y, cx, cy, hw, hh) {
  const dx = Math.abs(x - cx) - hw;
  const dy = Math.abs(y - cy) - hh;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
}

function sdfRoundBox(x, y, cx, cy, hw, hh, r) {
  return sdfBox(x, y, cx, cy, hw - r, hh - r) - r;
}

function sdfLine(x, y, x1, y1, x2, y2, thick) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((x - x1) * dx + (y - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist(x, y, x1 + t * dx, y1 + t * dy) - thick;
}

function sdfCapsule(x, y, x1, y1, x2, y2, r) {
  return sdfLine(x, y, x1, y1, x2, y2, 0) - r;
}

function opUnion(a, b) {
  return Math.min(a, b);
}

function opSub(a, b) {
  return Math.max(a, -b);
}

function cover(sdf, feather = 1.35) {
  if (sdf <= -feather) return 1;
  if (sdf >= feather) return 0;
  return 1 - (sdf + feather) / (2 * feather);
}

function fillPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi) inside = !inside;
  }
  return inside ? -1 : 1;
}

function starSdf(x, y, cx, cy, rOuter, rInner, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
  }
  // Approximate SDF: negative inside, distance outside via edge samples
  const inside = fillPoly(x, y, pts) < 0;
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    d = Math.min(d, Math.abs(sdfLine(x, y, a[0], a[1], b[0], b[1], 0)));
  }
  return inside ? -d : d;
}

function paint(size, draw) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x + 0.5, y + 0.5, size);
      const i = (y * size + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
  return buf;
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

/** Icon canvas: deep black, subtle vignette, NO shared footer chrome */
function backdrop(x, y, s, tint) {
  const m = s * 0.06;
  const rr = s * 0.22;
  const sdf = sdfRoundBox(x, y, s / 2, s / 2, s / 2 - m, s / 2 - m, rr);
  const a = cover(sdf, 1.2);
  if (a <= 0) return [0, 0, 0, 0];
  const nx = (x / s - 0.5) * 2;
  const ny = (y / s - 0.5) * 2;
  const vignette = clamp(1 - (nx * nx + ny * ny) * 0.22, 0.75, 1);
  const base = mix([18, 19, 22, 255], tint, 0.14);
  const top = mix(base, [38, 40, 48, 255], clamp(1 - y / (s * 0.55), 0, 1) * 0.35);
  const c = mix(top, [8, 8, 10, 255], 1 - vignette);
  c[3] = Math.round(255 * a);
  return c;
}

function layer(dst, cov, color, strength = 1) {
  if (cov <= 0) return dst;
  return mix(dst, [...color.slice(0, 3), 255], clamp(cov * strength, 0, 1) * ((color[3] ?? 255) / 255));
}

function glow(dst, sdf, color, radius = 10) {
  if (sdf >= radius) return dst;
  const g = clamp(1 - sdf / radius, 0, 1);
  return mix(dst, [...color.slice(0, 3), 255], g * g * 0.28);
}

// —— Unique glyphs ——
function drawFlag(x, y, s) {
  const cx = s * 0.42;
  const top = s * 0.26;
  const bot = s * 0.78;
  let d = sdfCapsule(x, y, cx, top, cx, bot, s * 0.028);
  const flag = fillPoly(x, y, [
    [cx + s * 0.02, top + s * 0.02],
    [cx + s * 0.36, top + s * 0.12],
    [cx + s * 0.02, top + s * 0.28],
  ]);
  d = opUnion(d, flag);
  return d;
}

function drawReject(x, y, s) {
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.26;
  let d = Math.abs(sdfCircle(x, y, cx, cy, r)) - s * 0.045;
  d = opUnion(d, sdfCapsule(x, y, cx - r * 0.55, cy + r * 0.55, cx + r * 0.55, cy - r * 0.55, s * 0.04));
  return d;
}

function drawStar(x, y, s) {
  return starSdf(x, y, s / 2, s / 2 + s * 0.02, s * 0.3, s * 0.13, 5);
}

function drawChevron(x, y, s, dir) {
  const cx = s / 2;
  const cy = s / 2;
  const a = s * 0.16;
  if (dir < 0) {
    return opUnion(
      sdfCapsule(x, y, cx + a, cy - a * 1.35, cx - a * 0.85, cy, s * 0.042),
      sdfCapsule(x, y, cx - a * 0.85, cy, cx + a, cy + a * 1.35, s * 0.042),
    );
  }
  return opUnion(
    sdfCapsule(x, y, cx - a, cy - a * 1.35, cx + a * 0.85, cy, s * 0.042),
    sdfCapsule(x, y, cx + a * 0.85, cy, cx - a, cy + a * 1.35, s * 0.042),
  );
}

function drawSlider(x, y, s) {
  const cy = s * 0.52;
  let d = sdfCapsule(x, y, s * 0.2, cy, s * 0.8, cy, s * 0.035);
  d = opUnion(d, sdfCircle(x, y, s * 0.62, cy, s * 0.11));
  d = opUnion(d, sdfCircle(x, y, s * 0.2, cy, s * 0.045));
  d = opUnion(d, sdfCircle(x, y, s * 0.8, cy, s * 0.045));
  return d;
}

function drawDial(x, y, s) {
  const cx = s / 2;
  const cy = s / 2 + s * 0.02;
  const r = s * 0.26;
  let d = Math.abs(sdfCircle(x, y, cx, cy, r)) - s * 0.05;
  d = opUnion(d, sdfCapsule(x, y, cx, cy, cx + r * 0.62, cy - r * 0.55, s * 0.04));
  d = opUnion(d, sdfCircle(x, y, cx, cy, s * 0.055));
  // tick marks
  for (let i = 0; i < 14; i++) {
    const ang = -Math.PI * 0.75 + (i / 13) * Math.PI * 1.5;
    const x1 = cx + Math.cos(ang) * (r + s * 0.02);
    const y1 = cy + Math.sin(ang) * (r + s * 0.02);
    const x2 = cx + Math.cos(ang) * (r + s * 0.08);
    const y2 = cy + Math.sin(ang) * (r + s * 0.08);
    d = opUnion(d, sdfCapsule(x, y, x1, y1, x2, y2, s * 0.018));
  }
  return d;
}

function drawLink(x, y, s) {
  const y0 = s / 2;
  const left = sdfCircle(x, y, s * 0.36, y0, s * 0.14);
  const right = sdfCircle(x, y, s * 0.64, y0, s * 0.14);
  let d = Math.abs(left) - s * 0.045;
  d = opUnion(d, Math.abs(right) - s * 0.045);
  d = opUnion(d, sdfCapsule(x, y, s * 0.4, y0, s * 0.6, y0, s * 0.04));
  return d;
}

function drawLinkOff(x, y, s) {
  let d = drawLink(x, y, s);
  d = opUnion(d, sdfCapsule(x, y, s * 0.28, s * 0.72, s * 0.72, s * 0.28, s * 0.045));
  return d;
}

function drawSwatches(x, y, s) {
  // three overlapping color dots — label metaphor
  const c1 = sdfCircle(x, y, s * 0.36, s * 0.42, s * 0.14);
  const c2 = sdfCircle(x, y, s * 0.58, s * 0.4, s * 0.13);
  const c3 = sdfCircle(x, y, s * 0.48, s * 0.6, s * 0.135);
  return { c1, c2, c3 };
}

function drawBolt(x, y, s) {
  return fillPoly(x, y, [
    [s * 0.58, s * 0.2],
    [s * 0.34, s * 0.52],
    [s * 0.5, s * 0.52],
    [s * 0.4, s * 0.8],
    [s * 0.68, s * 0.46],
    [s * 0.52, s * 0.46],
  ]);
}

function drawLayers(x, y, s) {
  let d = sdfRoundBox(x, y, s / 2, s * 0.38, s * 0.26, s * 0.07, s * 0.04);
  d = opUnion(d, sdfRoundBox(x, y, s / 2, s * 0.52, s * 0.26, s * 0.07, s * 0.04));
  d = opUnion(d, sdfRoundBox(x, y, s / 2, s * 0.66, s * 0.26, s * 0.07, s * 0.04));
  return d;
}

function drawCrop(x, y, s) {
  const m = s * 0.26;
  const e = s * 0.74;
  let d = sdfCapsule(x, y, m, m, e, m, s * 0.035);
  d = opUnion(d, sdfCapsule(x, y, m, m, m, e, s * 0.035));
  d = opUnion(d, sdfCapsule(x, y, e, m + s * 0.18, e, e, s * 0.035));
  d = opUnion(d, sdfCapsule(x, y, m + s * 0.18, e, e, e, s * 0.035));
  // corner ticks
  d = opUnion(d, sdfCapsule(x, y, m - s * 0.06, m, m + s * 0.12, m, s * 0.03));
  d = opUnion(d, sdfCapsule(x, y, m, m - s * 0.06, m, m + s * 0.12, s * 0.03));
  return d;
}

function drawMask(x, y, s) {
  const cx = s / 2;
  const cy = s / 2;
  const outer = sdfCircle(x, y, cx, cy, s * 0.28);
  const cut = sdfCircle(x, y, cx + s * 0.1, cy, s * 0.22);
  return opSub(outer, cut);
}

function drawUndo(x, y, s) {
  const cx = s * 0.54;
  const cy = s * 0.52;
  const r = s * 0.22;
  let d = Infinity;
  for (let a = 0.35; a < Math.PI * 1.45; a += 0.06) {
    const ang = 0.2 + a;
    const x1 = cx + Math.cos(ang) * r;
    const y1 = cy + Math.sin(ang) * r;
    const x2 = cx + Math.cos(ang + 0.08) * r;
    const y2 = cy + Math.sin(ang + 0.08) * r;
    d = Math.min(d, sdfCapsule(x, y, x1, y1, x2, y2, s * 0.038));
  }
  const tipX = cx + Math.cos(0.55) * r;
  const tipY = cy + Math.sin(0.55) * r;
  d = opUnion(d, sdfCapsule(x, y, tipX, tipY, tipX + s * 0.12, tipY - s * 0.02, s * 0.035));
  d = opUnion(d, sdfCapsule(x, y, tipX, tipY, tipX + s * 0.02, tipY + s * 0.12, s * 0.035));
  return d;
}

function drawSun(x, y, s) {
  const cx = s / 2;
  const cy = s / 2;
  let d = sdfCircle(x, y, cx, cy, s * 0.14);
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4 + Math.PI / 8;
    d = opUnion(
      d,
      sdfCapsule(
        x,
        y,
        cx + Math.cos(ang) * s * 0.22,
        cy + Math.sin(ang) * s * 0.22,
        cx + Math.cos(ang) * s * 0.34,
        cy + Math.sin(ang) * s * 0.34,
        s * 0.032,
      ),
    );
  }
  return d;
}

/** Tiny 3×5 bitmap font for version stamp on Connection icons */
const FONT3X5 = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  ".": ["000", "000", "000", "000", "010"],
  v: ["000", "101", "101", "101", "011"],
  " ": ["000", "000", "000", "000", "000"],
};

function textSdf(x, y, text, ox, oy, scale) {
  // scale = pixel size of each font cell
  let d = Infinity;
  let cursor = 0;
  for (const ch of text) {
    const glyph = FONT3X5[ch] || FONT3X5[" "];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (glyph[row][col] !== "1") continue;
        const cx = ox + (cursor * 4 + col + 0.5) * scale;
        const cy = oy + (row + 0.5) * scale;
        d = Math.min(d, sdfBox(x, y, cx, cy, scale * 0.55, scale * 0.55));
      }
    }
    cursor += 1;
  }
  return d;
}

function makeIcon(tint, ink, sdfFn, multi, badgeText) {
  return (x, y, s) => {
    let px = backdrop(x, y, s, tint);
    if (px[3] === 0) return px;

    // Shift glyph up when a version badge occupies the lower third
    const gy = badgeText ? y + s * 0.16 : y;

    if (multi) {
      const parts = multi(x, gy, s);
      for (const { sdf, color } of parts) {
        px = glow(px, sdf, color, s * 0.12);
        px = layer(px, cover(sdf), color);
      }
    } else {
      const sdf = sdfFn(x, gy, s);
      px = glow(px, sdf, ink, s * 0.14);
      px = layer(px, cover(sdf), ink);
    }

    if (badgeText) {
      // Fit version stamp inside the tile (3×5 font, 4 cells per char incl. gap)
      const maxW = s * 0.78;
      const scale = Math.max(3, Math.floor(maxW / (badgeText.length * 4)));
      const textW = badgeText.length * 4 * scale - scale; // last gap unused
      const textH = 5 * scale;
      const ox = (s - textW) / 2;
      const oy = s * 0.68;
      const plate = sdfRoundBox(
        x,
        y,
        s / 2,
        oy + textH / 2,
        textW / 2 + scale * 0.7,
        textH / 2 + scale * 0.5,
        scale * 0.4,
      );
      px = layer(px, cover(plate, 1.0), [0, 0, 0, 255], 0.75);
      const td = textSdf(x, y, badgeText, ox, oy, scale);
      px = layer(px, cover(td, 0.7), [255, 255, 255, 255], 1);
    }
    return px;
  };
}

const GREEN = [64, 214, 140, 255];
const RED = [245, 88, 88, 255];
const GOLD = [255, 196, 64, 255];
const AMBER = [255, 168, 56, 255];
const BLUE = [88, 168, 255, 255];
const PURPLE = [186, 140, 255, 255];
const SLATE = [210, 218, 230, 255];
const ROSE = [255, 120, 140, 255];
const CYAN = [80, 220, 230, 255];

// Keep in sync with streamdeck/src/version.ts + package.json
const VERSION_BADGE = "v1.3.1";

const icons = {
  "plugin.png": makeIcon(AMBER, AMBER, drawSun, null, VERSION_BADGE),
  "category.png": makeIcon(AMBER, AMBER, drawSun, null, VERSION_BADGE),
  "actions/connection.png": makeIcon([40, 90, 60, 255], GREEN, drawLink, null, VERSION_BADGE),
  "actions/connection-on.png": makeIcon([40, 90, 60, 255], GREEN, drawLink, null, VERSION_BADGE),
  "actions/connection-off.png": makeIcon([90, 40, 40, 255], RED, drawLinkOff, null, VERSION_BADGE),
  "actions/rating.png": makeIcon([90, 70, 20, 255], GOLD, drawStar),
  "actions/flag.png": makeIcon([30, 80, 50, 255], GREEN, drawFlag),
  "actions/reject.png": makeIcon([90, 35, 35, 255], RED, drawReject),
  "actions/label.png": makeIcon([80, 40, 50, 255], ROSE, null, (x, y, s) => {
    const { c1, c2, c3 } = drawSwatches(x, y, s);
    return [
      { sdf: c1, color: [255, 90, 90, 255] },
      { sdf: c2, color: [255, 210, 70, 255] },
      { sdf: c3, color: [90, 160, 255, 255] },
    ];
  }),
  "actions/navigate.png": makeIcon([30, 50, 90, 255], BLUE, (x, y, s) => drawChevron(x, y, s, 1)),
  "actions/navigate-left.png": makeIcon([30, 50, 90, 255], BLUE, (x, y, s) => drawChevron(x, y, s, -1)),
  "actions/slider.png": makeIcon([90, 60, 20, 255], AMBER, drawSlider),
  "actions/slider-dial.png": makeIcon([90, 60, 20, 255], AMBER, drawDial),
  "actions/command.png": makeIcon([50, 55, 70, 255], SLATE, drawBolt),
  "actions/preset.png": makeIcon([60, 40, 90, 255], PURPLE, drawLayers),
  "actions/crop.png": makeIcon([55, 60, 70, 255], SLATE, drawCrop),
  "actions/mask.png": makeIcon([60, 40, 90, 255], PURPLE, drawMask),
  "actions/undo.png": makeIcon([50, 55, 70, 255], CYAN, drawUndo),
  "actions/auto.png": makeIcon([90, 60, 20, 255], AMBER, drawSun),
};

fs.mkdirSync(path.join(outDir, "actions"), { recursive: true });

for (const [rel, fn] of Object.entries(icons)) {
  const file72 = path.join(outDir, rel);
  const file144 = file72.replace(/\.png$/, "@2x.png");
  const hi = paint(HI, fn);
  fs.writeFileSync(file144, pngFromRgba(HI, hi));
  fs.writeFileSync(file72, pngFromRgba(LO, boxDownscale(hi, HI, LO)));
  console.log("wrote", rel);
}
