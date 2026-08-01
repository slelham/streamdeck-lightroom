# Stream Deck XL layout (32 keys)

Two workspaces, inspired by pro Lightroom profile packs.

## Page 1 — Library

| Pick | Reject | ★1 | ★2 | ★3 | ★4 | ★5 | Unflag |
|---|---|---|---|---|---|---|---|
| Red | Yellow | Green | Blue | Purple | Prev | Next | Connection |
| Exp − | Exp + | Hi − | Hi + | Sh − | Sh + | Auto Tone | Auto WB |
| Crop | Mask | Subject | Sky | Copy | Paste | Undo | Redo |

- Flag actions: **Toggle pick** / **Toggle reject** (auto-advance on). Keys light when the photo matches.
- Rating: **Set rating** 1–5 (active state when live rating matches).
- Tone row uses **Develop Slider** (hold to repeat).

## Page 2 — Develop

| Folder − | Presets | Folder + | Page − | Page + | Temp − | Temp + | Connection |
|---|---|---|---|---|---|---|---|
| P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 |
| PSh + | PHi + | MtHue | MtSat | Objects | Land | Snap | Sync |
| Blue+Green | Flagged | P / R | Before | Zoom | Denoise | Bg | People |

- Preset slots update live from Lightroom when the bridge is online.
- Tone Curve / Color Grading sliders + extra AI masks, snapshot, sync, AI Denoise.

## Icons

Action icons are dark rounded tiles with crisp glyphs (amber develop, green pick, red reject, gold ratings, purple presets/masks). Live flag/rating/label keys use brighter **active** variants. Regenerate with `npm run icons`.
