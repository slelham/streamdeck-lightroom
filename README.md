# Stream Deck ↔ Lightroom Classic

A free, open-source two-way plugin pair for **Adobe Lightroom Classic** and **Elgato Stream Deck** (XL, MK.2, Plus, and friends).

Live slider values, culling feedback, dials, AI masks, a **live Develop preset browser**, and **polished profile packs** — over a local bridge. Nothing leaves your machine.

> Not affiliated with Adobe or Elgato. Requires **Lightroom Classic** (not cloud-only Lightroom).

## Features

| Feature | Notes |
|---|---|
| Live Develop sliders | Exposure, Contrast, Highlights/Shadows, Whites/Blacks, Temp/Tint, Texture, Clarity, Dehaze, Vibrance, Saturation |
| Dial support | Stream Deck+ : rotate to adjust, press to reset, live LCD value |
| Culling | Ratings, pick/reject, color labels, optional auto-advance |
| **Live preset browser** | Folder/page navigation + 8 live slots; apply any Develop preset |
| **Apply Preset action** | Property Inspector dropdown filled live from Lightroom |
| **Profile pack** | Auto-install layouts for XL, MK.2, and Plus |
| Develop helpers | Auto Tone, reset, undo/redo, copy/paste, tools, before/after |
| AI masks | Subject / Sky / Background / People |

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

On first launch, Stream Deck should offer the bundled profiles (XL / standard / Plus). You can also import `streamdeck/com.cursor.lightroom.sdPlugin/profiles/*.streamDeckProfile` manually.

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
- **AI masks fail** — Needs newer Lightroom Classic; run Subject/Sky once inside LrC first.
- **After editing Lua** — Quit and reopen Lightroom (reload often leaves sockets stuck).

## Protocol

Newline-delimited JSON on localhost:

- **→ Lightroom** `:59837` — commands like `nudge`, `applyPreset`, `presetBrowser`, `listPresets`
- **← Stream Deck** `:59838` — `state` / `ack` messages including `presetBrowser` slots

## License

MIT
