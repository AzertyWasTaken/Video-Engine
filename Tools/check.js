"use strict";

import {spawnSync} from "child_process";
import path from "path";
import fs from "fs";

const targets = process.argv.slice(2);

// Default: every animation script at the project root plus the Templates/ demos.
const files = targets.length ? targets : [
    ...fs.readdirSync(".").filter((name) => name.endsWith(".js")),
    ...(fs.existsSync("Templates")
        ? fs.readdirSync("Templates").filter((name) => name.endsWith(".js")).map((name) => path.join("Templates", name))
        : []),
];

if (files.length === 0) {
    console.log("No animation scripts found.");
    process.exit(0);
}

let failed = 0;
for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", path.resolve(file)], {encoding: "utf8"});
    if (result.status === 0) {
        console.log(`OK   ${file}`);
    } else {
        failed++;
        console.log(`FAIL ${file}`);
        if (result.stderr) console.log(result.stderr.trim());
    }
}

process.exit(failed === 0 ? 0 : 1);