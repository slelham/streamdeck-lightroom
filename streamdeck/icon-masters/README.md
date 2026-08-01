# Icon masters

AI-generated source artwork for the Stream Deck plugin icons. A cohesive flat darkroom set: charcoal tiles, category-colored glyphs, no neon glow.

Rebuild shipping assets (72px + `@2x`) from these masters:

```bash
cd streamdeck
npm run icons          # runs scripts/process-ai-icons.py
npm run profiles       # embeds icons into .streamDeckProfile packs
```

Version badges on Connection / plugin icons are stamped from `package.json` at process time (not baked into the masters).

Legacy procedural icons: `npm run icons:legacy`.
