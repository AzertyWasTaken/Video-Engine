"use strict";

import fs from "fs";
import path from "path";

const dir = process.argv.slice(2).find((arg) => !arg.startsWith("--")) || "Templates";
const apply = process.argv.includes("--apply");
const patterns = [/^visual.*\.mp4$/, /^audio.*\.mp4$/, /^preview.*\.png$/, /^visual_parts\.txt$/];

const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
const targets = entries.filter((name) => patterns.some((pattern) => pattern.test(name)));

if (targets.length === 0) {
    console.log(`No generated outputs found in ${dir}.`);
    process.exit(0);
}

console.log(`${apply ? "Deleting" : "Would delete"} ${targets.length} file(s) in ${dir}:`);
for (const name of targets) console.log(`  ${name}`);

if (!apply) {
    console.log("Re-run with --apply to delete.");
    process.exit(0);
}

for (const name of targets) {
    fs.rmSync(path.join(dir, name), {force: true});
}
console.log("Done.");