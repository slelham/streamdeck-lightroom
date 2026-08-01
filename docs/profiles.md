# Profile pack

Bundled Stream Deck profiles install with the plugin (Stream Deck prompts on first install). Layouts take cues from pro Lightroom workspace packs: separate **Library** (cull) and **Develop** pages, plus dedicated dials on Stream Deck + / + XL.

| File | Device | DeviceType |
|---|---|---|
| `profiles/lightroom-classic-xl.streamDeckProfile` | Stream Deck XL (32 keys) | 2 |
| `profiles/lightroom-classic.streamDeckProfile` | Stream Deck / MK.2 (15 keys) | 0 |
| `profiles/lightroom-classic-mini.streamDeckProfile` | Stream Deck Mini (6 keys) | 1 |
| `profiles/lightroom-classic-neo.streamDeckProfile` | Stream Deck Neo (8 keys) | 9 |
| `profiles/lightroom-classic-plus.streamDeckProfile` | Stream Deck + (keys + dials) | 7 |
| `profiles/lightroom-classic-plus-xl.streamDeckProfile` | Stream Deck + XL (keys + dials) | 13 |

## Stream Deck +

**Page 1 — Library**
- Pick / Reject / Prev / Next
- ★3 / ★5 / Auto Tone / Connection

**Page 2 — Develop**
- Crop / Mask / AI Subject / AI Sky
- Undo / Before-After / Snapshot / Sync

**Dials**
- Dial 1: **Cull dial** — rotate rating, press next, tap zoom 1:1
- Dials 2–4: Exposure · Temp · Highlights (press to reset)

## Stream Deck + XL

Two pages (Library + Develop) on a 6×6 grid with six dials: cull + Exposure / Temp / Highlights / Shadows / Midtone Hue.

## Mini / Neo

Compact cull boards (pick/reject/nav/rating + Connection).

## XL layout

See [`xl-layout.md`](xl-layout.md).

Rebuild after layout or icon edits:

```bash
cd streamdeck
npm run build:all
```
