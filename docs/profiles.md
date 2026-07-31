# Profile pack

Bundled Stream Deck profiles install with the plugin (Stream Deck prompts on first install).

| File | Device | DeviceType |
|---|---|---|
| `profiles/lightroom-classic-xl.streamDeckProfile` | Stream Deck XL (32 keys) | 2 |
| `profiles/lightroom-classic.streamDeckProfile` | Stream Deck / MK.2 (15 keys) | 0 |
| `profiles/lightroom-classic-plus.streamDeckProfile` | Stream Deck + (keys + dials) | 7 |

## XL layout

**Page 1 — Cull & Develop**
- Row 1: Pick / Reject / ★1–5 / Unflag
- Row 2: Color labels / Prev / Next / Connection
- Row 3: Exposure, Highlights, Shadows nudges / Auto Tone / Reset
- Row 4: Crop, Mask, AI Subject/Sky, Copy/Paste, Undo/Redo

**Page 2 — Presets & Tone**
- Row 1: Folder/page browser controls + Temp nudges
- Row 2: 8 live preset slots (press to apply)
- Row 3: Contrast / Whites / Blacks / Clarity / Vibrance
- Row 4: Module/view helpers + AI Background/People

Rebuild after layout edits:

```bash
cd streamdeck
npm run profiles
```
