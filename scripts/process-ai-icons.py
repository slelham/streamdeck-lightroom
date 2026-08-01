#!/usr/bin/env python3
"""Process AI-generated master icons into Stream Deck 72 / @2x assets."""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps
except ImportError as e:
    raise SystemExit(
        "Pillow is required to regenerate icons.\n"
        "  pip3 install pillow\n"
        "Or skip icons (committed PNGs are already in the plugin):\n"
        "  cd streamdeck && npm run build && npm run profiles"
    ) from e

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "streamdeck/com.cursor.lightroom.sdPlugin/imgs"
MASTERS_KEEP = ROOT / "streamdeck/icon-masters"
# Optional staging dir for freshly generated masters (never /opt/cursor — that is agent-only)
ASSETS = Path(os.environ["SDLR_ICON_ASSETS"]) if "SDLR_ICON_ASSETS" in os.environ else MASTERS_KEEP
PREVIEW = ROOT / "streamdeck/icon-masters/.preview"

LO = 72
MID = 144
HI = 256


def plugin_version_badge() -> str:
    pkg = json.loads((ROOT / "streamdeck/package.json").read_text())
    return f"v{pkg.get('version', '0.0.0')}"


def stamp_version(im: Image.Image, text: str) -> Image.Image:
    """Bake a crisp version plate onto the bottom of connection/plugin icons."""
    im = im.copy().convert("RGBA")
    w, h = im.size
    draw = ImageDraw.Draw(im)
    # Cover any model-baked caption ("Offline", version, etc.)
    band_top = int(h * 0.62)
    m = int(w * 0.07)
    draw.rounded_rectangle(
        [m, band_top, w - m, h - int(h * 0.07)],
        radius=max(6, h // 28),
        fill=(16, 16, 18, 255),
    )
    try:
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            size=max(16, h // 10),
        )
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pad_x, pad_y = max(8, w // 28), max(5, h // 40)
    plate_w, plate_h = tw + pad_x * 2, th + pad_y * 2
    x0 = (w - plate_w) // 2
    y0 = band_top + (h - int(h * 0.08) - band_top - plate_h) // 2
    x1, y1 = x0 + plate_w, y0 + plate_h
    draw.rounded_rectangle([x0, y0, x1, y1], radius=max(4, h // 36), fill=(0, 0, 0, 235))
    draw.text((x0 + pad_x, y0 + pad_y - 1), text, font=font, fill=(255, 255, 255, 255))
    return im


def find_tile_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    """Find the dark rounded tile, ignoring light/black letterbox backgrounds."""
    rgba = im.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()

    # Score pixels that look like the charcoal tile or colored glyph on it
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            mx = max(r, g, b)
            mn = min(r, g, b)
            # Skip near-white studio backdrop
            if mx > 235 and mn > 220:
                continue
            # Skip pure black letterbox far from content (keep dark charcoal tile ~18)
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            sat = mx - mn
            # Tile charcoal OR saturated glyph accents
            if (10 <= lum <= 55) or sat > 35 or (lum > 55 and sat > 18):
                mp[x, y] = 255

    # Tighten with a light blur + threshold to ignore speckles
    mask = mask.filter(ImageFilter.MaxFilter(5))
    mask = mask.filter(ImageFilter.MinFilter(3))
    bbox = mask.getbbox()
    if not bbox:
        return (0, 0, w, h)

    # Pad slightly then square-crop centered on bbox
    x0, y0, x1, y1 = bbox
    pad = int(0.02 * max(x1 - x0, y1 - y0))
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(w, x1 + pad)
    y1 = min(h, y1 + pad)
    bw, bh = x1 - x0, y1 - y0
    side = max(bw, bh)
    cx = (x0 + x1) // 2
    cy = (y0 + y1) // 2
    half = side // 2
    sx0 = max(0, cx - half)
    sy0 = max(0, cy - half)
    sx1 = min(w, sx0 + side)
    sy1 = min(h, sy0 + side)
    # Re-anchor if clipped
    sx0 = max(0, sx1 - side)
    sy0 = max(0, sy1 - side)
    return (sx0, sy0, sx1, sy1)


def make_transparent_outside_roundrect(im: Image.Image, radius_ratio: float = 0.20) -> Image.Image:
    """Keep rounded-rect tile; transparent corners for Stream Deck polish."""
    im = im.convert("RGBA")
    w, h = im.size
    m = int(w * 0.04)
    radius = int(w * radius_ratio)
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([m, m, w - 1 - m, h - 1 - m], radius=radius, fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(im, mask=mask)
    return out


def normalize_master(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    bbox = find_tile_bbox(im)
    cropped = im.crop(bbox)
    # Resize tile to HI square
    tile = cropped.resize((HI, HI), Image.Resampling.LANCZOS)
    # Soft unify: slight contrast for glyph punch
    tile = ImageEnhance.Contrast(tile).enhance(1.06)
    tile = ImageEnhance.Color(tile).enhance(1.05)
    return make_transparent_outside_roundrect(tile)


def active_variant(im: Image.Image) -> Image.Image:
    """Lit state: slightly brighter + warmer lift without glow bloom."""
    base = im.copy()
    bright = ImageEnhance.Brightness(base).enhance(1.14)
    color = ImageEnhance.Color(bright).enhance(1.12)
    wash = Image.new("RGBA", color.size, (255, 220, 160, 0))
    d = ImageDraw.Draw(wash)
    m = int(color.size[0] * 0.18)
    d.rounded_rectangle(
        [m, m, color.size[0] - m, color.size[1] - m],
        radius=int(color.size[0] * 0.16),
        fill=(255, 210, 140, 28),
    )
    return Image.alpha_composite(color, wash)


def save_pair(im: Image.Image, rel: str) -> None:
    """Write 72 and @2x under imgs/."""
    path72 = OUT / rel
    path72.parent.mkdir(parents=True, exist_ok=True)
    mid = im.resize((MID, MID), Image.Resampling.LANCZOS)
    lo = im.resize((LO, LO), Image.Resampling.LANCZOS)
    # Re-apply round mask after downscale for clean corners
    mid = make_transparent_outside_roundrect(mid, 0.20)
    lo = make_transparent_outside_roundrect(lo, 0.20)
    mid.save(str(path72).replace(".png", "@2x.png"), "PNG", optimize=True)
    lo.save(path72, "PNG", optimize=True)
    # Preview strip
    PREVIEW.mkdir(parents=True, exist_ok=True)
    lo.resize((96, 96), Image.Resampling.NEAREST).save(PREVIEW / path72.name)


def mirror_h(im: Image.Image) -> Image.Image:
    return ImageOps.mirror(im)


MAP = {
    "master-plugin.png": ["plugin.png", "category.png"],
    "master-connection-on.png": ["actions/connection.png", "actions/connection-on.png"],
    "master-connection-off.png": ["actions/connection-off.png"],
    "master-rating.png": ["actions/rating.png"],
    "master-flag.png": ["actions/flag.png"],
    "master-reject.png": ["actions/reject.png"],
    "master-label.png": ["actions/label.png"],
    "master-navigate.png": ["actions/navigate.png"],
    "master-slider.png": ["actions/slider.png"],
    "master-slider-dial.png": ["actions/slider-dial.png"],
    "master-cull-dial.png": ["actions/cull-dial.png"],
    "master-command.png": ["actions/command.png"],
    "master-preset.png": ["actions/preset.png"],
    "master-crop.png": ["actions/crop.png"],
    "master-mask.png": ["actions/mask.png"],
    "master-undo.png": ["actions/undo.png"],
    "master-auto.png": ["actions/auto.png"],
    "master-snapshot.png": ["actions/snapshot.png"],
    "master-enhance.png": ["actions/enhance.png"],
}

ACTIVE_FROM = {
    "actions/rating.png": "actions/rating-active.png",
    "actions/flag.png": "actions/flag-active.png",
    "actions/reject.png": "actions/reject-active.png",
    "actions/label.png": "actions/label-active.png",
}


VERSIONED = {
    "master-plugin.png",
    "master-connection-on.png",
    "master-connection-off.png",
}


def main() -> None:
    MASTERS_KEEP.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    badge = plugin_version_badge()
    print("version badge", badge)

    normalized: dict[str, Image.Image] = {}
    for master_name, targets in MAP.items():
        src = ASSETS / master_name
        if not src.exists():
            # Prefer masters already committed in the repo
            src = MASTERS_KEEP / master_name
        if not src.exists():
            raise SystemExit(f"missing {master_name}")
        if src.parent != MASTERS_KEEP:
            shutil.copy2(src, MASTERS_KEEP / master_name)
        im = normalize_master(src)
        # Cover any baked-in model version text with our authoritative badge
        if master_name in VERSIONED:
            im = stamp_version(im, badge)
        normalized[master_name] = im
        for rel in targets:
            save_pair(im, rel)
            print("wrote", rel)

    # Navigate left = mirror
    nav = normalized["master-navigate.png"]
    save_pair(mirror_h(nav), "actions/navigate-left.png")
    print("wrote actions/navigate-left.png")

    # Active variants
    for base_rel, active_rel in ACTIVE_FROM.items():
        # Reload from what we just wrote at HI by re-normalizing source
        key = next(k for k, v in MAP.items() if base_rel in v)
        save_pair(active_variant(normalized[key]), active_rel)
        print("wrote", active_rel)

    # Contact sheet preview
    thumbs = sorted(PREVIEW.glob("*.png"))
    if thumbs:
        cols = 6
        rows = (len(thumbs) + cols - 1) // cols
        sheet = Image.new("RGBA", (cols * 104 + 16, rows * 104 + 16), (24, 24, 28, 255))
        for i, t in enumerate(thumbs):
            im = Image.open(t).convert("RGBA").resize((96, 96), Image.Resampling.LANCZOS)
            x = 16 + (i % cols) * 104
            y = 16 + (i // cols) * 104
            sheet.paste(im, (x, y), im)
        sheet_path = PREVIEW / "icon-sheet.png"
        sheet.save(sheet_path)
        print("preview sheet", sheet_path)


if __name__ == "__main__":
    main()
