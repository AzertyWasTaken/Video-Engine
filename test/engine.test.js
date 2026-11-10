import {test} from "node:test";
import assert from "node:assert/strict";
import {Engine as _} from "../Engine/engine.js";

const BACKSLASH = "\\";

// Run fn() with console.warn captured; returns the warning strings.
function captureWarnings(fn) {
    const warnings = [];
    const original = console.warn;
    console.warn = (message) => warnings.push(String(message));
    try {
        fn();
    } finally {
        console.warn = original;
    }
    return warnings;
}

test("engine builds timeline and summary", () => {
    _.reset();
    const id = _.newText({text: "Hi", duration: 1});
    _.wait(2);
    assert.equal(_.getDuration(), 2);
    const events = _.getEvents(id);
    assert.ok(events.length >= 1);
    const summary = _.getTimelineSummary();
    assert.equal(summary.visualEvents, events.length);
    assert.equal(summary.duration, 2);
    const validation = _.validateTimeline();
    assert.equal(validation.ok, true);
});

test("setText does not grow the font size of a reversed tween", () => {
    _.reset();
    _.newText({id: "t", text: "A", fontSize: 80});
    _.animate("t", {fontSize: 40}, 1, {reverse: true});
    _.wait(3);

    _.setText("t", "B");
    _.setText("t", "C");

    const sizes = _.getVisualTimeline()
        .filter((event) => event.type === "text")
        .map((event) => event.fontSize);

    assert.deepEqual(sizes, [80, 80, 80]);
});

test("escape characters never reach text events", () => {
    _.reset();
    _.newText({
        text: String.raw`Use \\ to escape \* here.`,
        escapeSymbol: BACKSLASH,
        styleSymbol: [{openSymbol: "*", fontWeight: 700}]
    });
    _.wait(1);

    const texts = _.getVisualTimeline()
        .filter((event) => event.type === "text")
        .map((event) => event.text);

    assert.equal(texts.join(""), String.raw`Use \ to escape * here.`);
});

test("validateTimeline catches zero duration", () => {
    _.reset();
    _.newText({text: "Hi"});
    const result = _.validateTimeline();
    assert.equal(result.ok, false);
    assert.ok(result.warnings.some((w) => /0 seconds/.test(w)));
});
test("wait() without an argument advances nothing", () => {
    _.reset();
    _.wait();
    assert.equal(_.getDuration(), 0);
});

test("getAutoId() peeks while getNextId() consumes", () => {
    _.reset();
    const peeked = _.getAutoId();
    assert.equal(_.getAutoId(), peeked);
    assert.equal(_.getNextId(), peeked);
    assert.notEqual(_.getAutoId(), peeked);
});

test("a getAutoId() id never collides with the next auto id", () => {
    _.reset();
    const pre = _.getAutoId();
    _.newText({id: pre, text: "pre"});
    _.newText({text: "auto"});
    _.wait(1);
    _.clear(pre);
    const ends = _.getVisualTimeline()
        .filter((event) => event.type === "text")
        .map((event) => event.end);
    assert.deepEqual(ends, [1, undefined]);
});

test("repeat() and repeatGrid() count iterations, not seconds", () => {
    _.reset();
    let count = 0;
    _.repeat(2.7, () => count++);
    assert.equal(count, 2);
    assert.equal(_.getDuration(), 0);

    const cells = [];
    _.repeatGrid(2, 3, (row, column) => cells.push(`${row}:${column}`));
    assert.deepEqual(cells, ["0:0", "0:1", "0:2", "1:0", "1:1", "1:2"]);

    assert.throws(() => _.repeatGrid(-1, 1, () => {}), /repeatGrid\(\) expects a non-negative integer rows/);
});

test("withProp() accepts an explicit type", () => {
    _.reset();
    _.withProp({fontSize: 40}, "text", () => {
        assert.equal(_.getProp("fontSize", "text"), 40);
    });
    assert.equal(_.getProp("fontSize", "text"), 80);
    assert.throws(() => _.withProp({fontSize: 40}, () => {}), /It is a "text" property/);
});

test("playSound() accepts a volume number or an options object", () => {
    _.reset();
    _.playSound("click");
    _.playSound("click", 0.5);
    _.playSound("click", {volume: 0.25});
    assert.deepEqual(_.getAudioTimeline().map((event) => event.volume), [1, 0.5, 0.25]);
});

test("changeProp() rejects non-numeric deltas", () => {
    _.reset();
    assert.throws(() => _.changeProp({posX: "10"}, "text"), /changeProp\(\)/);
    _.changeProp({posY: 20}, "text");
    assert.equal(_.getProp("posY", "text"), 20);
});

test("tween duration defaults to 0", () => {
    _.reset();
    const id = _.newCircle({id: "c"});
    _.moveTo(id, {posX: 100});
    const [tween] = _.getVisualTimeline().filter((event) => event.type === "tween");
    assert.equal(tween.tweenEnd - tween.start, 0);
});

test("scene() works when destructured from Engine", () => {
    _.reset();
    const {scene} = _;
    const chapter = scene("intro", () => {
        _.newText({text: "Hi", duration: 1});
    });
    assert.equal(chapter.name, "intro");
});

test("creator return values work as id arguments", () => {
    _.reset();
    const result = _.newText({id: "t", text: "one; two", segmentSymbol: ";"});
    const events = _.getEvents(result);
    assert.ok(events.length >= 2);

    _.recolor(result, "#FF4040");
    _.clear(result);
    assert.ok(_.getEvents(result).every((event) => event.end !== undefined));
});

test("nested id arrays flatten", () => {
    _.reset();
    _.newText({id: "a", text: "a"});
    _.newCircle({id: "b"});
    _.clear([["a"], "b"]);
    assert.ok(_.getEvents("a").every((event) => event.end !== undefined));
    assert.ok(_.getEvents("b").every((event) => event.end !== undefined));
});

test("getCenter() ignores events that already ended", () => {
    _.reset();
    _.newCircle({id: "g", posX: -400, diameter: 100, duration: 1});
    _.wait(2);
    _.newCircle({id: "g", posX: 400, diameter: 100});
    assert.equal(_.getCenter("g").x, 400);
});

test("getSize() and getCenter() warn on an unknown id", () => {
    _.reset();
    _.newText({id: "title", text: "x"});

    const sizeWarnings = captureWarnings(() => _.getSize("tittle"));
    assert.equal(sizeWarnings.length, 1);
    assert.match(sizeWarnings[0], /getSize\(\): no visual events with id "tittle"/);
    assert.match(sizeWarnings[0], /Did you mean "title"\?/);

    const centerWarnings = captureWarnings(() => _.getCenter("typo"));
    assert.match(centerWarnings[0], /getCenter\(\): no visual events with id "typo"/);
});

test("centerText() skips ended events and warns when all have ended", () => {
    _.reset();
    _.newText({id: "t", text: "gone", posX: -50, duration: 1});
    _.wait(2);

    const warnings = captureWarnings(() => _.centerText("t", 100));
    assert.ok(warnings.some((message) => /already ended/.test(message)));
    assert.equal(_.getEvents("t")[0].posX, -50);
});

test("clearAll() warns when the keep id matches nothing", () => {
    _.reset();
    _.newText({id: "keep", text: "x"});

    const warnings = captureWarnings(() => _.clearAll("kep"));
    assert.match(warnings[0], /clearAll\(\): no visual events with id "kep"/);
});

test("getIds() lists every id in use", () => {
    _.reset();
    _.newText({id: "a", text: "x"});
    const seg = _.newText({id: "b", text: "one; two", segmentSymbol: ";"});

    const ids = _.getIds();
    assert.equal(ids[0], "a");
    assert.ok(ids.includes("b"));
    for (const id of seg.seg) assert.ok(ids.includes(id));
});
