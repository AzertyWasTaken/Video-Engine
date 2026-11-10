import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import os from "os";
import {splitFrames, parseSegmentEnv, buildConcatList, resolveWorkers} from "../Engine/record.js";

const recordUrl = new URL("../Engine/record.js", import.meta.url).href;

function runChild(segment) {
    const script = `
        import {splitFrames} from ${JSON.stringify(recordUrl)};
        console.log("LOUD");
        console.warn("LOUD WARN");
        console.error("parts:" + splitFrames(4, 2).length);
    `;
    const env = {...process.env};

    if (segment === undefined) delete env.ANIM_SEGMENT;
    else env.ANIM_SEGMENT = segment;

    return spawnSync(process.execPath, ["--input-type=module", "-e", script], {env, encoding: "utf8"});
}

function cores() {
    return os.availableParallelism?.() ?? os.cpus().length;
}

test("splitFrames keeps the total frame count", () => {
    assert.deepEqual(splitFrames(10, 3), [4, 3, 3]);
    assert.deepEqual(splitFrames(9, 3), [3, 3, 3]);
    assert.deepEqual(splitFrames(3, 4), [1, 1, 1, 0]);
    assert.equal(splitFrames(1801, 4).reduce((sum, size) => sum + size, 0), 1801);
});

test("parseSegmentEnv reads worker slices", () => {
    assert.deepEqual(parseSegmentEnv("1/4"), {index: 1, count: 4});
    assert.deepEqual(parseSegmentEnv(" 0/2 "), {index: 0, count: 2});

    assert.equal(parseSegmentEnv("4/4"), null);   // index out of range
    assert.equal(parseSegmentEnv("0/1"), null);   // never a worker
    assert.equal(parseSegmentEnv("nope"), null);
    assert.equal(parseSegmentEnv(undefined), null);
});

test("buildConcatList writes concat demuxer entries", () => {
    assert.equal(buildConcatList(["a.mp4", "b c.mp4"]), "file 'a.mp4'\nfile 'b c.mp4'\n");
    assert.equal(buildConcatList(["C:\\video\\part 1.mp4"]), "file 'C:/video/part 1.mp4'\n");
    assert.equal(buildConcatList(["it's.mp4"]), "file 'it'\\''s.mp4'\n");
});

test("resolveWorkers keeps short windows single-process", () => {
    assert.equal(resolveWorkers("auto", 120, 4), 1);
    assert.equal(resolveWorkers(4, 30, 1), 1);
});

test("resolveWorkers keeps chapter and edit renders single-process", () => {
    assert.equal(resolveWorkers("auto", 1200, 40, true), 1);
    assert.equal(resolveWorkers(4, 1200, 40, true), 1);
});

test("resolveWorkers honours an explicit worker count", () => {
    assert.equal(resolveWorkers(1, 1200, 40), 1);

    const expected = Math.min(2, Math.max(1, cores()));
    assert.equal(resolveWorkers(2, 1200, 40), expected);
});

test("resolveWorkers rejects invalid counts", () => {
    assert.throws(() => resolveWorkers(0, 1200, 40), /positive integer/);
    assert.throws(() => resolveWorkers(2.5, 1200, 40), /positive integer/);
    assert.throws(() => resolveWorkers("two", 1200, 40), /positive integer/);
});

test("worker children mute the script's own output", () => {
    const worker = runChild("1/2");

    assert.equal(worker.stdout, "");
    assert.ok(!worker.stderr.includes("LOUD"), `expected muted output, got: ${worker.stderr}`);
    assert.match(worker.stderr, /parts:2/); // console.error still reaches the parent
});

test("the parent process keeps its output", () => {
    const parent = runChild(undefined);

    assert.match(parent.stdout, /LOUD/);
    assert.match(parent.stderr, /parts:2/);
});
