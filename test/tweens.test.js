import {test} from "node:test";
import assert from "node:assert/strict";
import {Engine as _} from "../Engine/engine.js";

function textEvents() {
    return _.getVisualTimeline().filter((event) => event.type === "text");
}

function fontSizes() {
    return textEvents().map((event) => event.fontSize);
}

test("setText keeps the size of a plain tween without compounding", () => {
    _.reset();
    _.newText({id: "t", text: "A", fontSize: 80});
    _.animate("t", {fontSize: 40}, 1);
    _.wait(2);

    _.setText("t", "B");
    _.setText("t", "C");

    assert.deepEqual(fontSizes(), [80, 120, 120]);
});

test("setText keeps the size a reversed tween played back to", () => {
    _.reset();
    _.newText({id: "t", text: "A", fontSize: 80});
    _.animate("t", {fontSize: 40}, 1, {reverse: true});
    _.wait(3);

    _.setText("t", "B");
    _.setText("t", "C");

    assert.deepEqual(fontSizes(), [80, 80, 80]);
});

test("setText bakes the size painted in the middle of a reverse leg", () => {
    _.reset();
    _.newText({id: "t", text: "A", fontSize: 80});
    _.animate("t", {fontSize: 40}, 1, {reverse: true});
    _.wait(1.25);

    _.setText("t", "B");

    assert.deepEqual(fontSizes(), [80, 110]);
});

test("a superseded reverse leg stops painting over the newer tween", () => {
    _.reset();
    _.newText({id: "t", text: "A", fontSize: 80});
    _.animate("t", {fontSize: 40}, 1, {reverse: true});
    _.wait(0.5);
    _.animate("t", {fontSize: 10}, 1);

    const mirror = _.getVisualTimeline()
        .find((event) => event.type === "tween" && event.from === 40 && event.to === 0);

    assert.ok(mirror, "the reverse leg exists");
    assert.equal(mirror.end, 0.5, "the reverse leg closes with the leg it mirrors");
});

test("a new tween anchors to the value the reverse leg painted", () => {
    _.reset();
    _.newText({id: "t", text: "A", fontSize: 80});
    _.animate("t", {fontSize: 40}, 1, {reverse: true});
    _.wait(1.25);
    _.animate("t", {fontSize: 10}, 1);

    const legs = _.getVisualTimeline()
        .filter((event) => event.type === "tween" && event.key === "fontSize");
    const newer = legs[legs.length - 1];

    assert.ok(newer, "the newer tween exists");
    assert.equal(newer.from, 30, "it starts where the reverse leg left the value");
});

test("recolor() separates unknown ids from colorless events", () => {
    _.reset();
    _.newImage({id: "img", width: 10, height: 10});

    assert.throws(() => _.recolor("img", "#FF4040"), /have a color to recolor/);
    assert.throws(() => _.recolor("missing", "#FF4040"), /no visual events with id "missing"/);
});

test("moveTo() unknown key error lists known ids", () => {
    _.reset();
    _.newText({id: "t", text: "x"});

    assert.throws(() => _.moveTo("t", {diameter: 10}), /define "diameter".*Known ids/);
});
