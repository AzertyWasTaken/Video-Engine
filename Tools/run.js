"use strict";

import {spawn} from "child_process";
import path from "path";

const args = process.argv.slice(2);
const script = args.find((arg) => !arg.startsWith("--"));
const flags = {};

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--inspect") flags.inspect = true;
    else if (arg === "--preview") flags.preview = args[++i];
    else if (arg === "--frames") flags.frames = args[++i];
    else if (arg === "--grid") flags.grid = args[++i];
    else if (arg === "--out") flags.out = args[++i];
}

if (!script) {
    console.error("Usage: node Tools/run.js <script.js> [--inspect] [--preview t] [--frames a,b] [--grid n] [--out name]");
    process.exit(1);
}

const env = {...process.env};
if (flags.inspect) env.ANIM_DRY_RUN = "1";
if (flags.preview !== undefined) env.ANIM_PREVIEW = String(flags.preview);
if (flags.frames !== undefined) env.ANIM_PREVIEW_FRAMES = String(flags.frames);
if (flags.grid !== undefined) env.ANIM_PREVIEW_GRID = String(flags.grid);
if (flags.out !== undefined) env.ANIM_PREVIEW_OUT = String(flags.out);

const child = spawn(process.execPath, [path.resolve(script)], {
    stdio: "inherit",
    env,
});

child.on("exit", (code) => process.exit(code ?? 0));