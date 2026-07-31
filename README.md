# Stream Deck ↔ Lightroom Classic

A free, open-source two-way plugin pair for **Adobe Lightroom Classic** and **Elgato Stream Deck** (including XL / Plus dials).

Inspired by the paid Marketplace Lightroom plugins: live slider values on keys/dials, culling feedback (rating / flag / label), AI masks, and Develop commands — over a local bridge. Nothing leaves your machine.

> Not affiliated with Adobe or Elgato. Requires **Lightroom Classic** (not cloud-only Lightroom).

## What you get

| Feature | Notes |
|---|---|
| Live Develop sliders | Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Temp/Tint, Texture, Clarity, Dehaze, Vibrance, Saturation |
| Dial support | Stream Deck+ / +XL: rotate to adjust, press to reset, live LCD value |
| Culling | Ratings, pick/reject, color labels, optional auto-advance |
| Navigation | Next/previous photo (key or dial) |
| Develop helpers | Auto Tone, reset, undo/redo, copy/paste settings, tools, before/after views |
| AI masks | Select Subject / Sky / Background / People (LrC with masking SDK) |
| Connection key | Online/offline status for the bridge |

### Honest gaps vs the $20 Marketplace plugin

- No bundled polished icon pack / auto-installed XL profiles (see `docs/xl-layout.md`)
- Preset browser (live list from Lightroom) not included yet
- Not every Develop panel parameter is exposed (Basic panel first)
- You install the Lightroom companion plug-in once manually

## Architecture

```
┌─────────────────────┐     TCP localhost      ┌──────────────────────────┐
│ Stream Deck plugin  │ ───────────────────►  │ Lightroom .lrplugin      │
│ (Node / Elgato SDK) │   :59837 commands     │ (Lua + LrSocket)         │
│                     │ ◄───────────────────  │ LrDevelopController /    │
│                     │   :59838 state        │ LrSelection / …          │
└─────────────────────┘                       └──────────────────────────┘
```

## Requirements

- Adobe Lightroom Classic (SDK 6+ features; masking needs newer LrC)
- Elgato Stream Deck software 6.9+ (7.1+ recommended)
- Node.js 20+ (to build the Stream Deck plugin)
- macOS or Windows

## Install

### 1. Lightroom companion

```bash
./scripts/install-lightroom-plugin.sh
```

Or copy `lightroom/StreamDeckLightroom.lrplugin` into:

- **macOS:** `~/Library/Application Support/Adobe/Lightroom/Modules/`
- **Windows:** `%APPDATA%\Adobe\Lightroom\Modules\`

Then in Lightroom Classic: **File → Plug-in Manager → enable “Stream Deck Lightroom”**.

Confirm with **File → Plug-in Extras → Stream Deck Bridge: Status**.

### 2. Stream Deck plugin

```bash
cd streamdeck
npm install
npm run build
cd ..
./scripts/install-streamdeck-plugin.sh
```

Or during development:

```bash
cd streamdeck
npm install
npx streamdeck link com.cursor.lightroom.sdPlugin
npm run watch
```

Restart the Stream Deck app if actions don’t show under **Lightroom Classic**.

### 3. Build a layout

Drag actions onto your XL (or any deck). A starter map is in [`docs/xl-layout.md`](docs/xl-layout.md).

## Protocol (for hackers)

Newline-delimited JSON on localhost:

- **→ Lightroom** `:59837` — `{"id":"1","cmd":"nudge","param":"Exposure","delta":0.1}`
- **← Stream Deck** `:59838` — `{"type":"state","rating":3,"flag":1,"label":"red","module":"develop","params":{"Exposure":0.45,…}}`

Useful commands: `setRating`, `flag`, `label`, `nextPhoto`, `previousPhoto`, `nudge`, `increment`, `decrement`, `setParam`, `resetParam`, `resetAll`, `autoTone`, `undo`, `redo`, `showModule`, `showView`, `selectTool`, `selectSubject`, `selectSky`, `getState`, `ping`.

## Project layout

```
lightroom/StreamDeckLightroom.lrplugin/   # Adobe companion
streamdeck/                               # Elgato plugin (TypeScript)
docs/xl-layout.md                         # XL key suggestions
scripts/                                  # install + icon helpers
```

## Troubleshooting

- **LR Offline on the Connection key** — Enable the Lightroom plug-in, restart Lightroom, then press the Connection key. Ports must be free (`59837` / `59838`). Quit MIDI2LR-style tools if they conflict on nearby ports.
- **Sliders do nothing** — Switch to the Develop module (or use a command key that does). Some params only exist for certain process versions.
- **AI masks fail** — Needs a Lightroom Classic build with masking APIs; run Subject/Sky once inside LrC to ensure AI components are installed.
- **After editing Lua** — Quit and reopen Lightroom (reload does not always release sockets).

## License

MIT. Use and modify freely.
