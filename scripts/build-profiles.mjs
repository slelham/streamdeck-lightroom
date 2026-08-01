#!/usr/bin/env node
/**
 * Build polished .streamDeckProfile packs for XL / MK.2 / Mini / Neo / Plus / +XL.
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
  mini: { model: "20GAI9901", deviceType: 1, cols: 3, rows: 2, name: "Lightroom Classic Mini" },
  neo: { model: "20GDJ9901", deviceType: 9, cols: 4, rows: 2, name: "Lightroom Classic Neo" },
  plus: { model: "20GBA9901", deviceType: 7, cols: 4, rows: 2, name: "Lightroom Classic Plus", encoders: 4 },
  plusXl: {
    model: "20GEA9901",
    deviceType: 13,
    cols: 6,
    rows: 6,
    name: "Lightroom Classic + XL",
    encoders: 6,
  },
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
  return action("com.cursor.lightroom.connection", "Connection", {}, "v1.4.3", "connection");
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
function cullDial(title = "Cull") {
  return action(
    "com.cursor.lightroom.cull-dial",
    "Cull Dial",
    { rotateMode: "rating", pressAction: "next", tapAction: "zoomOneToOne" },
    title,
    "cull-dial",
  );
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
  // Page 1 — Library / Cull
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
  cull["7,2"] = cmd("autoWhiteBalance", "Auto\nWB", {}, "auto");
  cull["0,3"] = cmd("selectTool", "Crop", { tool: "crop" }, "crop");
  cull["1,3"] = cmd("selectTool", "Mask", { tool: "masking" }, "mask");
  cull["2,3"] = cmd("selectSubject", "Subject", {}, "mask");
  cull["3,3"] = cmd("selectSky", "Sky", {}, "mask");
  cull["4,3"] = cmd("copySettings", "Copy");
  cull["5,3"] = cmd("pasteSettings", "Paste");
  cull["6,3"] = cmd("undo", "Undo", {}, "undo");
  cull["7,3"] = cmd("redo", "Redo", {}, "undo");

  // Page 2 — Develop / Presets + AI / grading
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

  develop["0,2"] = slider("ParametricShadows", "up", "PSh +");
  develop["1,2"] = slider("ParametricHighlights", "up", "PHi +");
  develop["2,2"] = slider("ColorGradeMidtoneHue", "up", "MtHue");
  develop["3,2"] = slider("ColorGradeMidtoneSat", "up", "MtSat");
  develop["4,2"] = cmd("selectObjects", "Objects", {}, "mask");
  develop["5,2"] = cmd("selectLandscape", "Land", {}, "mask");
  develop["6,2"] = cmd("createSnapshot", "Snap", {}, "snapshot");
  develop["7,2"] = cmd("syncSettings", "Sync");

  develop["0,3"] = labelFilter("blue-green", "Blue+\nGreen");
  develop["1,3"] = flagCount("pick", "filter-pick", "Flagged");
  develop["2,3"] = flagCount("both", "refresh", "P / R");
  develop["3,3"] = cmd("showView", "Before", { view: "develop_before_after_horiz" });
  develop["4,3"] = cmd("zoomToggle", "Zoom");
  develop["5,3"] = cmd("aiEnhance", "Denoise", { enhance: "denoise" }, "enhance");
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

function buildMiniPages() {
  const page = {};
  page["0,0"] = flag("toggle-pick", "Pick", "flag");
  page["1,0"] = flag("toggle-reject", "Reject", "reject");
  page["2,0"] = connection();
  page["0,1"] = nav("previous", "Prev");
  page["1,1"] = nav("next", "Next");
  page["2,1"] = rating(5);
  return [{ name: "Cull", actions: page }];
}

function buildNeoPages() {
  const page = {};
  page["0,0"] = flag("toggle-pick", "Pick", "flag");
  page["1,0"] = flag("toggle-reject", "Reject", "reject");
  page["2,0"] = rating(3);
  page["3,0"] = rating(5);
  page["0,1"] = nav("previous", "Prev");
  page["1,1"] = nav("next", "Next");
  page["2,1"] = cmd("autoTone", "Auto", {}, "auto");
  page["3,1"] = connection();
  return [{ name: "Cull", actions: page }];
}

function buildPlus() {
  const library = {};
  library["0,0"] = flag("toggle-pick", "Pick", "flag");
  library["1,0"] = flag("toggle-reject", "Reject", "reject");
  library["2,0"] = nav("previous", "Prev");
  library["3,0"] = nav("next", "Next");
  library["0,1"] = rating(3);
  library["1,1"] = rating(5);
  library["2,1"] = cmd("autoTone", "Auto", {}, "auto");
  library["3,1"] = connection();

  const develop = {};
  develop["0,0"] = cmd("selectTool", "Crop", { tool: "crop" }, "crop");
  develop["1,0"] = cmd("selectTool", "Mask", { tool: "masking" }, "mask");
  develop["2,0"] = cmd("selectSubject", "Subject", {}, "mask");
  develop["3,0"] = cmd("selectSky", "Sky", {}, "mask");
  develop["0,1"] = cmd("undo", "Undo", {}, "undo");
  develop["1,1"] = cmd("showView", "Before", { view: "develop_before_after_horiz" });
  develop["2,1"] = cmd("createSnapshot", "Snap", {}, "snapshot");
  develop["3,1"] = cmd("syncSettings", "Sync");

  // Dial 0 = cull (rating / advance / zoom); 1–3 = develop
  const encoders = {};
  encoders["0,0"] = cullDial("Cull");
  encoders["1,0"] = dial("Exposure", "Exposure");
  encoders["2,0"] = dial("Temperature", "Temp");
  encoders["3,0"] = dial("Highlights", "Highlights");

  return {
    pages: [
      { name: "Library", actions: library },
      { name: "Develop", actions: develop },
    ],
    encoders,
  };
}

function buildPlusXl() {
  // 6×6 keypad + 6 encoders
  const library = {};
  library["0,0"] = flag("toggle-pick", "Pick", "flag");
  library["1,0"] = flag("toggle-reject", "Reject", "reject");
  for (let i = 1; i <= 5; i++) library[`${i + 1},0`] = rating(i);
  ["red", "yellow", "green", "blue", "purple"].forEach((c, i) => {
    if (i < 6) library[`${i},1`] = label(c);
  });
  library["0,2"] = nav("previous", "Prev");
  library["1,2"] = nav("next", "Next");
  library["2,2"] = flagCount("pick", "filter-pick", "Flagged");
  library["3,2"] = flagCount("both", "refresh", "P / R");
  library["4,2"] = cmd("zoomOneToOne", "1:1");
  library["5,2"] = connection();
  library["0,3"] = slider("Exposure", "down", "Exp −");
  library["1,3"] = slider("Exposure", "up", "Exp +");
  library["2,3"] = slider("Highlights", "down", "Hi −");
  library["3,3"] = slider("Highlights", "up", "Hi +");
  library["4,3"] = slider("Shadows", "down", "Sh −");
  library["5,3"] = slider("Shadows", "up", "Sh +");
  library["0,4"] = cmd("autoTone", "Auto", {}, "auto");
  library["1,4"] = cmd("autoWhiteBalance", "WB", {}, "auto");
  library["2,4"] = cmd("showClipping", "Clip");
  library["3,4"] = cmd("convertToGrayscale", "B&W");
  library["4,4"] = cmd("undo", "Undo", {}, "undo");
  library["5,4"] = cmd("redo", "Redo", {}, "undo");
  library["0,5"] = cmd("selectSubject", "Subject", {}, "mask");
  library["1,5"] = cmd("selectSky", "Sky", {}, "mask");
  library["2,5"] = cmd("selectObjects", "Objects", {}, "mask");
  library["3,5"] = cmd("copySettings", "Copy");
  library["4,5"] = cmd("pasteSettings", "Paste");
  library["5,5"] = cmd("syncSettings", "Sync");

  const develop = {};
  develop["0,0"] = presetNav("prevFolder", "Folder −");
  develop["1,0"] = presetNav("refresh", "Presets");
  develop["2,0"] = presetNav("nextFolder", "Folder +");
  develop["3,0"] = presetNav("prevPage", "Page −");
  develop["4,0"] = presetNav("nextPage", "Page +");
  develop["5,0"] = connection();
  for (let i = 0; i < 6; i++) develop[`${i},1`] = presetSlot(i + 1);
  develop["0,2"] = presetSlot(7);
  develop["1,2"] = presetSlot(8);
  develop["2,2"] = cmd("selectLandscape", "Land", {}, "mask");
  develop["3,2"] = cmd("selectPeople", "People", {}, "mask");
  develop["4,2"] = cmd("maskLinear", "Linear", {}, "mask");
  develop["5,2"] = cmd("maskRadial", "Radial", {}, "mask");
  develop["0,3"] = slider("ParametricShadows", "up", "PSh");
  develop["1,3"] = slider("ParametricDarks", "up", "PDk");
  develop["2,3"] = slider("ParametricLights", "up", "PLt");
  develop["3,3"] = slider("ParametricHighlights", "up", "PHi");
  develop["4,3"] = slider("ColorGradeMidtoneHue", "up", "MtHue");
  develop["5,3"] = slider("ColorGradeMidtoneSat", "up", "MtSat");
  develop["0,4"] = cmd("createSnapshot", "Snap", {}, "snapshot");
  develop["1,4"] = cmd("applySnapshot", "Apply\nSnap", {}, "snapshot");
  develop["2,4"] = cmd("aiEnhance", "Denoise", { enhance: "denoise" }, "enhance");
  develop["3,4"] = cmd("aiEnhance", "Raw Det", { enhance: "rawDetails" }, "enhance");
  develop["4,4"] = cmd("showView", "Before", { view: "develop_before_after_horiz" });
  develop["5,4"] = cmd("resetAll", "Reset");
  develop["0,5"] = cmd("selectTool", "Crop", { tool: "crop" }, "crop");
  develop["1,5"] = cmd("maskBrush", "Brush", {}, "mask");
  develop["2,5"] = cmd("maskRangeColor", "Range\nColor", {}, "mask");
  develop["3,5"] = cmd("maskRangeLuminance", "Range\nLum", {}, "mask");
  develop["4,5"] = labelFilter("blue-green", "Blue+\nGreen");
  develop["5,5"] = cmd("zoomToggle", "Zoom");

  const encoders = {};
  encoders["0,0"] = cullDial("Cull");
  encoders["1,0"] = dial("Exposure", "Exposure");
  encoders["2,0"] = dial("Temperature", "Temp");
  encoders["3,0"] = dial("Highlights", "Highlights");
  encoders["4,0"] = dial("Shadows", "Shadows");
  encoders["5,0"] = dial("ColorGradeMidtoneHue", "Mt Hue");

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

function pagesFor(deviceKey) {
  if (deviceKey === "xl") return { pages: buildXlPages(), encoders: null };
  if (deviceKey === "mk2") return { pages: buildMk2Pages(), encoders: null };
  if (deviceKey === "mini") return { pages: buildMiniPages(), encoders: null };
  if (deviceKey === "neo") return { pages: buildNeoPages(), encoders: null };
  if (deviceKey === "plusXl") return buildPlusXl();
  return buildPlus();
}

function fileNameFor(deviceKey) {
  const map = {
    xl: "lightroom-classic-xl",
    mk2: "lightroom-classic",
    mini: "lightroom-classic-mini",
    neo: "lightroom-classic-neo",
    plus: "lightroom-classic-plus",
    plusXl: "lightroom-classic-plus-xl",
  };
  return map[deviceKey];
}

function buildProfile(deviceKey) {
  const device = DEVICES[deviceKey];
  const profileId = uuid();
  const files = [];
  const pageIds = [];

  const { pages, encoders } = pagesFor(deviceKey);

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

  const iconNames = [
    "flag",
    "reject",
    "rating",
    "label",
    "navigate",
    "navigate-left",
    "slider",
    "slider-dial",
    "cull-dial",
    "command",
    "connection",
    "preset",
    "crop",
    "mask",
    "undo",
    "auto",
    "snapshot",
    "enhance",
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
  const fileName = fileNameFor(deviceKey);
  const outPath = path.join(outDir, `${fileName}.streamDeckProfile`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, zip);
  console.log("wrote", outPath, `(${zip.length} bytes, ${pageIds.length} page(s))`);
  return { fileName, deviceType: device.deviceType, name: device.name };
}

const built = ["xl", "mk2", "mini", "neo", "plus", "plusXl"].map(buildProfile);
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(built, null, 2));
console.log("done");
