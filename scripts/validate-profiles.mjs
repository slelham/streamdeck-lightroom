#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profilesDir = path.join(
  __dirname,
  "../streamdeck/com.cursor.lightroom.sdPlugin/profiles",
);

function unzipList(file) {
  // Use Python for reliable zip listing
  const out = execFileSync(
    "python3",
    [
      "-c",
      `
import zipfile, json, sys
z=zipfile.ZipFile(sys.argv[1])
names=z.namelist()
print(json.dumps(names))
root=[n for n in names if n.endswith('.sdProfile/manifest.json')]
assert root, 'missing root manifest'
manifest=json.loads(z.read(root[0]))
assert 'Device' in manifest and 'Pages' in manifest
pages=manifest['Pages']['Pages']
assert pages, 'no pages'
for p in pages:
    pm=f"{root[0].split('/')[0]}/Profiles/{p}/manifest.json"
    assert pm in names, pm
    page=json.loads(z.read(pm))
    assert 'Controllers' in page
    keys=page['Controllers'][0]['Actions']
    assert keys, 'empty keypad'
print('OK', sys.argv[1], 'pages', len(pages), 'keys', len(keys))
`,
      file,
    ],
    { encoding: "utf8" },
  );
  return out;
}

const files = fs
  .readdirSync(profilesDir)
  .filter((f) => f.endsWith(".streamDeckProfile"))
  .map((f) => path.join(profilesDir, f));

if (!files.length) {
  console.error("No profiles found. Run: npm run profiles");
  process.exit(1);
}

for (const file of files) {
  process.stdout.write(unzipList(file));
}
console.log("All profiles valid.");
