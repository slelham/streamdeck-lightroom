# Stream Deck ↔ Lightroom Classic

A free, open-source two-way plugin pair for **Adobe Lightroom Classic** and **Elgato Stream Deck** (XL, MK.2, Mini, Neo, Plus, + XL).

**Current version: 1.4.0** — after install, the Connection key icon shows `v1.4.0` at the bottom. Run `./scripts/verify-install.sh` to confirm.

Live slider values, culling feedback, dials, AI masks, Tone Curve / Color Grading, snapshots, sync, AI Enhance, a **live Develop preset browser**, and **polished profile packs** — over a local bridge. Nothing leaves your machine.

> Not affiliated with Adobe or Elgato. Requires **Lightroom Classic** (not cloud-only Lightroom).

## Features

| Feature | Notes |
|---|---|
| Live Develop sliders | Basic + Tone Curve + Color Grading + Detail |
| Dial support | Stream Deck+ / +XL: develop dials + **Cull dial** (rotate rating, press advance, tap zoom 1:1) |
| Culling | Ratings, pick/reject, color labels, auto-advance; **live active key states** |
| **Live preset browser** | Folder/page navigation + 8 live slots; apply any Develop preset |
| **Apply Preset action** | Property Inspector dropdown filled live from Lightroom |
| **Label filter** | One-tap Library filter for blue+green (or other label sets) |
| **Flag count** | Live pick/reject counts; optional filter to flagged photos |
| **Profile pack** | XL / MK.2 / Mini / Neo / Plus / +XL |
| Develop helpers | Auto Tone, Auto WB, clipping, B&W, reset, undo/redo, copy/paste/**sync**, snapshots |
| AI masks | Subject / Sky / Background / People / Objects / Landscape + brush / linear / radial / range |
| AI Enhance | Denoise / Raw Details / Super Res (Lightroom Classic 15.3+) |

## Install

### 1. Lightroom companion

```bash
./scripts/install-lightroom-plugin.sh
```

Then in Lightroom Classic: **File → Plug-in Manager → enable “Stream Deck Lightroom”**.

### 2. Stream Deck plugin

```bash
cd streamdeck
npm install
npm run build:all
cd ..
./scripts/install-streamdeck-plugin.sh
```

On first launch, Stream Deck should offer the bundled profiles. You can also import `streamdeck/com.cursor.lightroom.sdPlugin/profiles/*.streamDeckProfile` manually.

### 3. Use the preset browser

1. Put **Preset Browser Nav** + **Preset Slot** keys on a page (or install the XL profile page 2).
2. With Lightroom online, folder/page keys update the 8 slots live.
3. Press a slot to apply that Develop preset to the selected photo.
4. Or use **Apply Preset** and pick from the live dropdown in the property inspector.

## Profile pack

See [`docs/profiles.md`](docs/profiles.md) and [`docs/xl-layout.md`](docs/xl-layout.md).

## Architecture

```
┌─────────────────────┐     TCP localhost      ┌──────────────────────────┐
│ Stream Deck plugin  │ ───────────────────►  │ Lightroom .lrplugin      │
│ (Node / Elgato SDK) │   :59837 commands     │ (Lua + LrSocket)         │
│                     │ ◄───────────────────  │ LrDevelopController /    │
│                     │   :59838 state        │ LrSelection / presets    │
└─────────────────────┘                       └──────────────────────────┘
```

## Requirements

- Adobe Lightroom Classic
- Elgato Stream Deck software 6.9+ (7.1+ recommended)
- Node.js 20+ to build
- macOS or Windows

## Development

```bash
cd streamdeck
npm install
npm run check          # build + tests + profile validation
npm run watch          # rebuild + restart plugin
```

## Troubleshooting

- **LR Offline** — Enable the Lightroom plug-in, quit and reopen Lightroom, press Connection. Ports: `59837` / `59838`.
- **Sliders do nothing** — Needs Develop module + a selected photo.
- **Preset slots show "—"** — Press Preset Browser → Refresh; confirm you have Develop presets.
- **AI masks / Enhance fail** — Needs newer Lightroom Classic; run Subject/Sky / Denoise once inside LrC first.
- **After editing Lua** — Quit and reopen Lightroom (reload often leaves sockets stuck).

## Protocol

Newline-delimited JSON on localhost:

- **→ Lightroom** `:59837` — commands like `nudge`, `applyPreset`, `presetBrowser`, `listPresets`, `setEnhance`, `syncSettings`
- **← Stream Deck** `:59838` — `state` / `ack` messages including `presetBrowser` slots

## License

See repository license file.
