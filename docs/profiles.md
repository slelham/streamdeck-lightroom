# Profile pack

Bundled Stream Deck profiles install with the plugin (Stream Deck prompts on first install). Layouts take cues from pro Lightroom workspace packs: separate **Library** (cull) and **Develop** pages, plus dedicated dials on Stream Deck +.

| File | Device | DeviceType |
|---|---|---|
| `profiles/lightroom-classic-xl.streamDeckProfile` | Stream Deck XL (32 keys) | 2 |
| `profiles/lightroom-classic.streamDeckProfile` | Stream Deck / MK.2 (15 keys) | 0 |
| `profiles/lightroom-classic-plus.streamDeckProfile` | Stream Deck + (keys + dials) | 7 |

## Stream Deck +

**Page 1 — Library**
- Pick / Reject / Prev / Next
- ★3 / ★5 / Auto Tone / Connection
- Dials: Exposure · Temp · Highlights · Shadows (press dial to reset)

**Page 2 — Develop**
- Crop / Mask / AI Subject / AI Sky
- Undo / Before-After / Preset folder / Reset All
- Same four develop dials stay mapped

## XL layout

See [`xl-layout.md`](xl-layout.md).

Rebuild after layout or icon edits:

```bash
cd streamdeck
npm run build:all
```
