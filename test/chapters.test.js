import {test} from "node:test";
import assert from "node:assert/strict";
import {formatTimestamp, findChapter, addChapter, getChapters} from "../Engine/chapters.js";
import {Engine as _} from "../Engine/engine.js";

test("formatTimestamp formats seconds", () => {
    assert.equal(formatTimestamp(0), "0:00");
    assert.equal(formatTimestamp(65), "1:05");
    assert.equal(formatTimestamp(3661), "1:01:01");
});

test("chapters close previous and find works", () => {
    _.reset();
    _.wait(1);
    const c1 = addChapter("intro");
    _.wait(2);
    addChapter("outro");
    _.wait(1);
    assert.equal(c1.end, 3);
    const found = findChapter("intro", _.getDuration());
    assert.equal(found.start, 1);
    assert.equal(found.end, 3);
    assert.throws(() => addChapter("intro"));
});