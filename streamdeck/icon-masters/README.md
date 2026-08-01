# Icon masters

AI-generated source artwork for the Stream Deck plugin icons. A cohesive flat darkroom set: charcoal tiles, category-colored glyphs, no neon glow.

Shipping PNGs under `com.cursor.lightroom.sdPlugin/imgs/` are already committed — **install does not regenerate icons**.

To rebuild from masters (optional, needs Pillow):

```bash
pip3 install pillow
cd streamdeck
npm run icons          # writes imgs/ + icon-masters/.preview/
npm run profiles       # embeds icons into .streamDeckProfile packs
```

Version badges on Connection / plugin icons are stamped from `package.json` at process time.

Legacy procedural icons: `npm run icons:legacy`.
