#!/usr/bin/env node
/**
 * Clean Stream Deck icons — crisp filled glyphs, no glow/blur.
 * Rendered at 256px then box-filtered down for sharp 72/@2x assets.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../streamdeck/com.cursor.lightroom.sdPlugin/imgs");
const HI = 256;
const LO = 72;
const MID = 144;

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

function sdfLine(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((x - x1) * dx + (y - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist(x, y, x1 + t * dx, y1 + t * dy);
}

function sdfCapsule(x, y, x1, y1, x2, y2, r) {
  return sdfLine(x, y, x1, y1, x2, y2) - r;
}

function opUnion(a, b) {
  return Math.min(a, b);
}
function opSub(a, b) {
  return Math.max(a, -b);
}

/** Smooth AA at hi-res (downscale cleans further). No outer glow. */
function cover(sdf, feather = 1.05) {
  if (sdf <= -feather) return 1;
  if (sdf >= feather) return 0;
  const t = 1 - (sdf + feather) / (2 * feather);
  return t * t * (3 - 2 * t);
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
  const inside = fillPoly(x, y, pts) < 0;
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    d = Math.min(d, sdfLine(x, y, a[0], a[1], b[0], b[1]));
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

function backdrop(x, y, s) {
  const m = s * 0.08;
  const rr = s * 0.2;
  const sdf = sdfRoundBox(x, y, s / 2, s / 2, s / 2 - m, s / 2 - m, rr);
  const a = cover(sdf, 0.7);
  if (a <= 0) return [0, 0, 0, 0];
  // Flat near-black — no vignette banding
  return [16, 16, 18, Math.round(255 * a)];
}

function layer(dst, cov, color) {
  if (cov <= 0.001) return dst;
  return mix(dst, [...color.slice(0, 3), 255], cov * ((color[3] ?? 255) / 255));
}

// Glyphs — solid, simple, readable at 72px
function drawFlag(x, y, s) {
  const cx = s * 0.4;
  const top = s * 0.28;
  const bot = s * 0.72;
  let d = sdfCapsule(x, y, cx, top, cx, bot, s * 0.032);
  d = opUnion(
    d,
    fillPoly(x, y, [
      [cx + s * 0.02, top + s * 0.02],
      [cx + s * 0.34, top + s * 0.14],
      [cx + s * 0.02, top + s * 0.3],
    ]),
  );
  return d;
}

function drawReject(x, y, s) {
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.24;
  let d = Math.abs(sdfCircle(x, y, cx, cy, r)) - s * 0.048;
  d = opUnion(d, sdfCapsule(x, y, cx - r * 0.52, cy + r * 0.52, cx + r * 0.52, cy - r * 0.52, s * 0.042));
  return d;
}

function drawStar(x, y, s) {
  return starSdf(x, y, s / 2, s / 2, s * 0.28, s * 0.12, 5);
}

function drawChevron(x, y, s, dir) {
  const cx = s / 2;
  const cy = s / 2;
  const a = s * 0.14;
  if (dir < 0) {
    return opUnion(
      sdfCapsule(x, y, cx + a, cy - a * 1.25, cx - a * 0.75, cy, s * 0.048),
      sdfCapsule(x, y, cx - a * 0.75, cy, cx + a, cy + a * 1.25, s * 0.048),
    );
  }
  return opUnion(
    sdfCapsule(x, y, cx - a, cy - a * 1.25, cx + a * 0.75, cy, s * 0.048),
    sdfCapsule(x, y, cx + a * 0.75, cy, cx - a, cy + a * 1.25, s * 0.048),
  );
}

function drawSlider(x, y, s) {
  const cy = s * 0.5;
  let d = sdfCapsule(x, y, s * 0.22, cy, s * 0.78, cy, s * 0.038);
  d = opUnion(d, sdfCircle(x, y, s * 0.6, cy, s * 0.1));
  return d;
}

function drawDial(x, y, s) {
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.24;
  let d = Math.abs(sdfCircle(x, y, cx, cy, r)) - s * 0.05;
  d = opUnion(d, sdfCapsule(x, y, cx, cy, cx + r * 0.55, cy - r * 0.5, s * 0.042));
  d = opUnion(d, sdfCircle(x, y, cx, cy, s * 0.05));
  return d;
}

function drawLink(x, y, s) {
  const y0 = s / 2;
  let d = Math.abs(sdfCircle(x, y, s * 0.38, y0, s * 0.13)) - s * 0.045;
  d = opUnion(d, Math.abs(sdfCircle(x, y, s * 0.62, y0, s * 0.13)) - s * 0.045);
  d = opUnion(d, sdfCapsule(x, y, s * 0.42, y0, s * 0.58, y0, s * 0.04));
  return d;
}

function drawLinkOff(x, y, s) {
  let d = drawLink(x, y, s);
  d = opUnion(d, sdfCapsule(x, y, s * 0.3, s * 0.7, s * 0.7, s * 0.3, s * 0.045));
  return d;
}

function drawBolt(x, y, s) {
  return fillPoly(x, y, [
    [s * 0.56, s * 0.22],
    [s * 0.36, s * 0.52],
    [s * 0.5, s * 0.52],
    [s * 0.42, s * 0.78],
    [s * 0.66, s * 0.46],
    [s * 0.52, s * 0.46],
  ]);
}

function drawLayers(x, y, s) {
  let d = sdfRoundBox(x, y, s / 2, s * 0.38, s * 0.24, s * 0.065, s * 0.035);
  d = opUnion(d, sdfRoundBox(x, y, s / 2, s * 0.52, s * 0.24, s * 0.065, s * 0.035));
  d = opUnion(d, sdfRoundBox(x, y, s / 2, s * 0.66, s * 0.24, s * 0.065, s * 0.035));
  return d;
}

function drawCrop(x, y, s) {
  const m = s * 0.28;
  const e = s * 0.72;
  let d = sdfCapsule(x, y, m, m, e, m, s * 0.038);
  d = opUnion(d, sdfCapsule(x, y, m, m, m, e, s * 0.038));
  d = opUnion(d, sdfCapsule(x, y, e, m + s * 0.16, e, e, s * 0.038));
  d = opUnion(d, sdfCapsule(x, y, m + s * 0.16, e, e, e, s * 0.038));
  return d;
}

function drawMask(x, y, s) {
  const outer = sdfCircle(x, y, s / 2, s / 2, s * 0.26);
  const cut = sdfCircle(x, y, s / 2 + s * 0.1, s / 2, s * 0.2);
  return opSub(outer, cut);
}

function drawUndo(x, y, s) {
  const cx = s * 0.54;
  const cy = s * 0.52;
  const r = s * 0.2;
  let d = Infinity;
  for (let a = 0.4; a < Math.PI * 1.4; a += 0.05) {
    const ang = 0.25 + a;
    d = Math.min(
      d,
      sdfCapsule(
        x,
        y,
        cx + Math.cos(ang) * r,
        cy + Math.sin(ang) * r,
        cx + Math.cos(ang + 0.07) * r,
        cy + Math.sin(ang + 0.07) * r,
        s * 0.04,
      ),
    );
  }
  const tipX = cx + Math.cos(0.6) * r;
  const tipY = cy + Math.sin(0.6) * r;
  d = opUnion(d, sdfCapsule(x, y, tipX, tipY, tipX + s * 0.1, tipY, s * 0.038));
  d = opUnion(d, sdfCapsule(x, y, tipX, tipY, tipX, tipY + s * 0.1, s * 0.038));
  return d;
}

function drawSun(x, y, s) {
  const cx = s / 2;
  const cy = s / 2;
  let d = sdfCircle(x, y, cx, cy, s * 0.13);
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4;
    d = opUnion(
      d,
      sdfCapsule(
        x,
        y,
        cx + Math.cos(ang) * s * 0.2,
        cy + Math.sin(ang) * s * 0.2,
        cx + Math.cos(ang) * s * 0.3,
        cy + Math.sin(ang) * s * 0.3,
        s * 0.032,
      ),
    );
  }
  return d;
}

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
  let d = Infinity;
  let cursor = 0;
  for (const ch of text) {
    const glyph = FONT3X5[ch] || FONT3X5[" "];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (glyph[row][col] !== "1") continue;
        const cx = ox + (cursor * 4 + col + 0.5) * scale;
        const cy = oy + (row + 0.5) * scale;
        d = Math.min(d, sdfBox(x, y, cx, cy, scale * 0.48, scale * 0.48));
      }
    }
    cursor += 1;
  }
  return d;
}

function makeIcon(ink, sdfFn, multi, badgeText) {
  return (x, y, s) => {
    let px = backdrop(x, y, s);
    if (px[3] === 0) return px;

    const gy = badgeText ? y + s * 0.12 : y;

    if (multi) {
      for (const { sdf, color } of multi(x, gy, s)) {
        px = layer(px, cover(sdf), color);
      }
    } else {
      px = layer(px, cover(sdfFn(x, gy, s)), ink);
    }

    if (badgeText) {
      const maxW = s * 0.78;
      const scale = Math.max(3, Math.floor(maxW / (badgeText.length * 4)));
      const textW = badgeText.length * 4 * scale - scale;
      const textH = 5 * scale;
      const ox = (s - textW) / 2;
      const oy = s * 0.7;
      const plate = sdfRoundBox(x, y, s / 2, oy + textH / 2, textW / 2 + scale * 0.6, textH / 2 + scale * 0.4, scale * 0.35);
      px = layer(px, cover(plate, 0.7), [0, 0, 0, 255]);
      px = layer(px, cover(textSdf(x, y, badgeText, ox, oy, scale), 0.65), [255, 255, 255, 255]);
    }
    return px;
  };
}

const GREEN = [72, 210, 130, 255];
const RED = [240, 80, 80, 255];
const GOLD = [255, 196, 64, 255];
const AMBER = [255, 170, 48, 255];
const BLUE = [90, 170, 255, 255];
const PURPLE = [180, 140, 255, 255];
const SLATE = [220, 225, 235, 255];
const CYAN = [80, 210, 220, 255];

const VERSION_BADGE = "v1.4.1";

/** Active-state backdrop: slightly brighter rim so live keys pop */
function makeActiveIcon(ink, sdfFn, multi) {
  return (x, y, s) => {
    let px = backdrop(x, y, s);
    if (px[3] === 0) return px;
    // Soft inner wash for “lit” state (no glow glow-stack)
    const wash = cover(sdfRoundBox(x, y, s / 2, s / 2, s * 0.38, s * 0.38, s * 0.14), 1.2) * 0.22;
    px = layer(px, wash, ink);
    if (multi) {
      for (const { sdf, color } of multi(x, y, s)) {
        px = layer(px, cover(sdf), color);
      }
    } else {
      px = layer(px, cover(sdfFn(x, y, s)), ink);
    }
    return px;
  };
}

const icons = {
  "plugin.png": makeIcon(AMBER, drawSun, null, VERSION_BADGE),
  "category.png": makeIcon(AMBER, drawSun, null, VERSION_BADGE),
  "actions/connection.png": makeIcon(GREEN, drawLink, null, VERSION_BADGE),
  "actions/connection-on.png": makeIcon(GREEN, drawLink, null, VERSION_BADGE),
  "actions/connection-off.png": makeIcon(RED, drawLinkOff, null, VERSION_BADGE),
  "actions/rating.png": makeIcon(GOLD, drawStar),
  "actions/rating-active.png": makeActiveIcon(GOLD, drawStar),
  "actions/flag.png": makeIcon(GREEN, drawFlag),
  "actions/flag-active.png": makeActiveIcon(GREEN, drawFlag),
  "actions/reject.png": makeIcon(RED, drawReject),
  "actions/reject-active.png": makeActiveIcon(RED, drawReject),
  "actions/label.png": makeIcon(SLATE, null, (x, y, s) => [
    { sdf: sdfCircle(x, y, s * 0.36, s * 0.42, s * 0.12), color: [255, 90, 90, 255] },
    { sdf: sdfCircle(x, y, s * 0.56, s * 0.4, s * 0.11), color: [255, 210, 70, 255] },
    { sdf: sdfCircle(x, y, s * 0.47, s * 0.58, s * 0.115), color: [90, 160, 255, 255] },
  ]),
  "actions/label-active.png": makeActiveIcon(BLUE, null, (x, y, s) => [
    { sdf: sdfCircle(x, y, s / 2, s / 2, s * 0.22), color: [90, 170, 255, 255] },
  ]),
  "actions/navigate.png": makeIcon(BLUE, (x, y, s) => drawChevron(x, y, s, 1)),
  "actions/navigate-left.png": makeIcon(BLUE, (x, y, s) => drawChevron(x, y, s, -1)),
  "actions/slider.png": makeIcon(AMBER, drawSlider),
  "actions/slider-dial.png": makeIcon(AMBER, drawDial),
  "actions/cull-dial.png": makeIcon(GOLD, null, (x, y, s) => [
    { sdf: drawDial(x, y, s), color: GOLD },
    { sdf: starSdf(x, y, s * 0.72, s * 0.3, s * 0.1, s * 0.04, 5), color: [255, 230, 140, 255] },
  ]),
  "actions/command.png": makeIcon(SLATE, drawBolt),
  "actions/preset.png": makeIcon(PURPLE, drawLayers),
  "actions/crop.png": makeIcon(SLATE, drawCrop),
  "actions/mask.png": makeIcon(PURPLE, drawMask),
  "actions/undo.png": makeIcon(CYAN, drawUndo),
  "actions/auto.png": makeIcon(AMBER, drawSun),
  "actions/snapshot.png": makeIcon(CYAN, drawLayers),
  "actions/enhance.png": makeIcon(GREEN, drawBolt),
};

fs.mkdirSync(path.join(outDir, "actions"), { recursive: true });

for (const [rel, fn] of Object.entries(icons)) {
  const file72 = path.join(outDir, rel);
  const file144 = file72.replace(/\.png$/, "@2x.png");
  const hi = paint(HI, fn);
  fs.writeFileSync(file144, pngFromRgba(MID, boxDownscale(hi, HI, MID)));
  fs.writeFileSync(file72, pngFromRgba(LO, boxDownscale(hi, HI, LO)));
  console.log("wrote", rel);
}
