#!/usr/bin/env node
/**
 * Build polished .streamDeckProfile packs for XL / MK.2 / Plus.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "streamdeck/com.cursor.lightroom.sdPlugin/profiles");

const DEVICES = {
  xl: { model: "20GAV9901", deviceType: 2, cols: 8, rows: 4, name: "Lightroom Classic XL" },
  mk2: { model: "20GBD9901", deviceType: 0, cols: 5, rows: 3, name: "Lightroom Classic" },
  plus: { model: "20GBA9901", deviceType: 7, cols: 4, rows: 2, name: "Lightroom Classic Plus", encoders: 4 },
};

function uuid() {
  return crypto.randomUUID().toUpperCase();
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

/** Minimal STORED (no compression) zip writer */
function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(Buffer.concat([local, data]));
    centrals.push(central);
    offset += local.length + data.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralDir, end]);
}

function action(uuid, name, settings, title, imageKey) {
  return {
    ActionID: crypto.randomUUID(),
    LinkedTitle: false,
    Name: name,
    Settings: settings,
    State: 0,
    States: [
      {
        Image: `Images/${imageKey}`,
        Title: title,
        FontSize: 11,
        FontStyle: "",
        FontUnderline: false,
        OutlineThickness: 2,
        ShowTitle: true,
        TitleAlignment: "middle",
        TitleColor: "#ffffff",
      },
    ],
    UUID: uuid,
  };
}

function flag(mode, title, imageKey = "flag") {
  return action("com.cursor.lightroom.flag", "Flag", { flag: mode, autoAdvance: true }, title, imageKey);
}
function rating(stars) {
  return action(
    "com.cursor.lightroom.rating",
    "Rating",
    { mode: "set", rating: stars, autoAdvance: false },
    `${stars}★`,
    "rating",
  );
}
function label(color) {
  return action("com.cursor.lightroom.label", "Color Label", { label: color, autoAdvance: false }, color, "label");
}
function nav(direction, title) {
  const imageKey = direction === "previous" ? "navigate-left" : "navigate";
  return action("com.cursor.lightroom.navigate", "Navigate", { direction }, title, imageKey);
}
function slider(param, direction, title) {
  return action("com.cursor.lightroom.slider", "Develop Slider", { param, direction }, title, "slider");
}
function cmd(command, title, extra = {}, imageKey = "command") {
  return action(
    "com.cursor.lightroom.command",
    "Lightroom Command",
    { command, title, ...extra },
    title,
    imageKey,
  );
}
function connection() {
  return action("com.cursor.lightroom.connection", "Connection", {}, "LR", "connection");
}
function presetNav(navAction, title) {
  return action("com.cursor.lightroom.preset-nav", "Preset Browser Nav", { action: navAction }, title, "preset");
}
function presetSlot(slot) {
  return action("com.cursor.lightroom.preset-slot", "Preset Slot", { slot, pageSize: 8 }, `P${slot}`, "preset");
}
function dial(param, title) {
  return action("com.cursor.lightroom.slider-dial", "Develop Dial", { param }, title, "slider-dial");
}
function labelFilter(labels, title) {
  return action(
    "com.cursor.lightroom.label-filter",
    "Label Filter",
    { labels, title },
    title,
    "label",
  );
}
function flagCount(display, onPress, title) {
  return action(
    "com.cursor.lightroom.flag-count",
    "Flag Count",
    { display, onPress },
    title,
    "flag",
  );
}

function buildXlPages() {
  // Page 1 — Library / Cull (pro-pack style workspace)
  const cull = {};
  cull["0,0"] = flag("toggle-pick", "Pick", "flag");
  cull["1,0"] = flag("toggle-reject", "Reject", "reject");
  for (let i = 1; i <= 5; i++) cull[`${i + 1},0`] = rating(i);
  cull["7,0"] = flag("none", "Unflag", "reject");
  ["red", "yellow", "green", "blue", "purple"].forEach((c, i) => {
    cull[`${i},1`] = label(c);
  });
  cull["5,1"] = nav("previous", "Prev");
  cull["6,1"] = nav("next", "Next");
  cull["7,1"] = connection();
  cull["0,2"] = slider("Exposure", "down", "Exp −");
  cull["1,2"] = slider("Exposure", "up", "Exp +");
  cull["2,2"] = slider("Highlights", "down", "Hi −");
  cull["3,2"] = slider("Highlights", "up", "Hi +");
  cull["4,2"] = slider("Shadows", "down", "Sh −");
  cull["5,2"] = slider("Shadows", "up", "Sh +");
  cull["6,2"] = cmd("autoTone", "Auto\nTone", {}, "auto");
  cull["7,2"] = cmd("resetAll", "Reset\nAll");
  cull["0,3"] = cmd("selectTool", "Crop", { tool: "crop" }, "crop");
  cull["1,3"] = cmd("selectTool", "Mask", { tool: "masking" }, "mask");
  cull["2,3"] = cmd("selectSubject", "Subject", {}, "mask");
  cull["3,3"] = cmd("selectSky", "Sky", {}, "mask");
  cull["4,3"] = cmd("copySettings", "Copy");
  cull["5,3"] = cmd("pasteSettings", "Paste");
  cull["6,3"] = cmd("undo", "Undo", {}, "undo");
  cull["7,3"] = cmd("redo", "Redo", {}, "undo");

  // Page 2 — Develop / Presets (basic tone + live preset browser)
  const develop = {};
  develop["0,0"] = presetNav("prevFolder", "Folder −");
  develop["1,0"] = presetNav("refresh", "Presets");
  develop["2,0"] = presetNav("nextFolder", "Folder +");
  develop["3,0"] = presetNav("prevPage", "Page −");
  develop["4,0"] = presetNav("nextPage", "Page +");
  develop["5,0"] = slider("Temperature", "down", "Temp −");
  develop["6,0"] = slider("Temperature", "up", "Temp +");
  develop["7,0"] = connection();

  for (let i = 0; i < 8; i++) {
    develop[`${i},1`] = presetSlot(i + 1);
  }

  develop["0,2"] = slider("Contrast", "down", "Con −");
  develop["1,2"] = slider("Contrast", "up", "Con +");
  develop["2,2"] = slider("Whites", "down", "Wh −");
  develop["3,2"] = slider("Whites", "up", "Wh +");
  develop["4,2"] = slider("Blacks", "down", "Bk −");
  develop["5,2"] = slider("Blacks", "up", "Bk +");
  develop["6,2"] = slider("Clarity", "up", "Clarity");
  develop["7,2"] = slider("Vibrance", "up", "Vibrance");

  develop["0,3"] = labelFilter("blue-green", "Blue+\nGreen");
  develop["1,3"] = flagCount("pick", "filter-pick", "Flagged");
  develop["2,3"] = flagCount("both", "refresh", "P / R");
  develop["3,3"] = cmd("showView", "Before", { view: "develop_before_after_horiz" });
  develop["4,3"] = cmd("zoomToggle", "Zoom");
  develop["5,3"] = cmd("zoomOneToOne", "1:1");
  develop["6,3"] = cmd("selectBackground", "Bg", {}, "mask");
  develop["7,3"] = cmd("selectPeople", "People", {}, "mask");

  return [
    { name: "Library", actions: cull },
    { name: "Develop", actions: develop },
  ];
}

function buildMk2Pages() {
  const page = {};
  page["0,0"] = flag("toggle-pick", "Pick", "flag");
  page["1,0"] = flag("toggle-reject", "Reject", "reject");
  page["2,0"] = rating(3);
  page["3,0"] = rating(5);
  page["4,0"] = connection();

  page["0,1"] = nav("previous", "Prev");
  page["1,1"] = nav("next", "Next");
  page["2,1"] = slider("Exposure", "down", "Exp −");
  page["3,1"] = slider("Exposure", "up", "Exp +");
  page["4,1"] = cmd("autoTone", "Auto", {}, "auto");

  page["0,2"] = presetNav("prevFolder", "Folder −");
  page["1,2"] = presetSlot(1);
  page["2,2"] = presetSlot(2);
  page["3,2"] = presetNav("nextFolder", "Folder +");
  page["4,2"] = cmd("undo", "Undo", {}, "undo");
  return [{ name: "Lightroom", actions: page }];
}

function buildPlus() {
  // Page 1 — Library / Cull + primary develop dials (Pro Plus style)
  const library = {};
  library["0,0"] = flag("toggle-pick", "Pick", "flag");
  library["1,0"] = flag("toggle-reject", "Reject", "reject");
  library["2,0"] = nav("previous", "Prev");
  library["3,0"] = nav("next", "Next");
  library["0,1"] = rating(3);
  library["1,1"] = rating(5);
  library["2,1"] = cmd("autoTone", "Auto", {}, "auto");
  library["3,1"] = connection();

  // Page 2 — Develop tools + AI masks; same dials stay under fingertips
  const develop = {};
  develop["0,0"] = cmd("selectTool", "Crop", { tool: "crop" }, "crop");
  develop["1,0"] = cmd("selectTool", "Mask", { tool: "masking" }, "mask");
  develop["2,0"] = cmd("selectSubject", "Subject", {}, "mask");
  develop["3,0"] = cmd("selectSky", "Sky", {}, "mask");
  develop["0,1"] = cmd("undo", "Undo", {}, "undo");
  develop["1,1"] = cmd("showView", "Before", { view: "develop_before_after_horiz" });
  develop["2,1"] = presetNav("nextFolder", "Presets");
  develop["3,1"] = cmd("resetAll", "Reset");

  // Dedicated develop dials — turn to adjust, press to reset (live LCD)
  const encoders = {};
  encoders["0,0"] = dial("Exposure", "Exposure");
  encoders["1,0"] = dial("Temperature", "Temp");
  encoders["2,0"] = dial("Highlights", "Highlights");
  encoders["3,0"] = dial("Shadows", "Shadows");

  return {
    pages: [
      { name: "Library", actions: library },
      { name: "Develop", actions: develop },
    ],
    encoders,
  };
}

function loadIcon(name) {
  const candidates = [
    path.join(root, "streamdeck/com.cursor.lightroom.sdPlugin/imgs/actions", `${name}.png`),
    path.join(root, "streamdeck/com.cursor.lightroom.sdPlugin/imgs/actions", "command.png"),
    path.join(root, "streamdeck/com.cursor.lightroom.sdPlugin/imgs/plugin.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  throw new Error(`No icon found for ${name}`);
}

function buildProfile(deviceKey) {
  const device = DEVICES[deviceKey];
  const profileId = uuid();
  const files = [];
  const pageIds = [];

  let pages;
  let encoders = null;
  if (deviceKey === "xl") pages = buildXlPages();
  else if (deviceKey === "mk2") pages = buildMk2Pages();
  else {
    const plus = buildPlus();
    pages = plus.pages;
    encoders = plus.encoders;
  }

  for (const page of pages) {
    const pageId = crypto.randomUUID();
    pageIds.push(pageId);
    const controllers = [
      {
        Type: "Keypad",
        Actions: page.actions,
      },
    ];
    if (encoders) {
      controllers.push({ Type: "Encoder", Actions: encoders });
    }
    const pageManifest = { Controllers: controllers };
    files.push({
      name: `${profileId}.sdProfile/Profiles/${pageId}/manifest.json`,
      data: JSON.stringify(pageManifest),
    });
  }

  const rootManifest = {
    Device: { Model: device.model, UUID: "" },
    Name: device.name,
    Pages: {
      Current: pageIds[0],
      Pages: pageIds,
    },
    Version: "2.0",
  };
  files.push({
    name: `${profileId}.sdProfile/manifest.json`,
    data: JSON.stringify(rootManifest, null, 2),
  });

  // Embed icons next to each page manifest (Stream Deck resolves Images/ relative to the page)
  const iconNames = [
    "flag",
    "reject",
    "rating",
    "label",
    "navigate",
    "navigate-left",
    "slider",
    "slider-dial",
    "command",
    "connection",
    "preset",
    "crop",
    "mask",
    "undo",
    "auto",
  ];
  for (const pageId of pageIds) {
    for (const icon of iconNames) {
      files.push({
        name: `${profileId}.sdProfile/Profiles/${pageId}/Images/${icon}.png`,
        data: loadIcon(icon === "connection" ? "connection-on" : icon),
      });
    }
  }

  const zip = zipStore(files);
  const fileName = deviceKey === "xl" ? "lightroom-classic-xl" : deviceKey === "mk2" ? "lightroom-classic" : "lightroom-classic-plus";
  const outPath = path.join(outDir, `${fileName}.streamDeckProfile`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, zip);
  console.log("wrote", outPath, `(${zip.length} bytes, ${pageIds.length} page(s))`);
  return { fileName, deviceType: device.deviceType, name: device.name };
}

const built = ["xl", "mk2", "plus"].map(buildProfile);
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(built, null, 2));
console.log("done");
