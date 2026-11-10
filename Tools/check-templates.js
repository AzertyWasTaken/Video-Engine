"use strict";

import {spawnSync} from "child_process";
import path from "path";
import fs from "fs";

const dir = process.argv[2] || "Templates";
const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(dir, name));

let failed = 0;
for (const file of files) {
    const result = spawnSync(process.execPath, [path.resolve(file)], {
        encoding: "utf8",
        env: {...process.env, ANIM_DRY_RUN: "1"},
        cwd: process.cwd(),
    });

    if (result.status === 0) {
        console.log(`OK   ${file}`);
    } else {
        failed++;
        console.log(`FAIL ${file}`);
        const output = (result.stderr || result.stdout || "").trim();
        if (output) console.log(output.split("\n").slice(-20).join("\n"));
    }
}

process.exit(failed === 0 ? 0 : 1);