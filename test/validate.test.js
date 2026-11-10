import {test} from "node:test";
import assert from "node:assert/strict";
import {normalizeIds, matchesIds, resolveDuration, validateDuration, toIdArray, unknownIdMessage} from "../Engine/validate.js";
import {Engine as _} from "../Engine/engine.js";

test("normalizeIds handles single, array, auto", () => {
    assert.deepEqual(normalizeIds(undefined), null);
    assert.deepEqual(normalizeIds("a"), ["a"]);
    assert.deepEqual(normalizeIds([1, "a", 1]), [1, "a"]);
    assert.throws(() => normalizeIds([]));
    assert.throws(() => normalizeIds([NaN]));
});

test("toIdArray flattens nested arrays and creator results", () => {
    assert.deepEqual(toIdArray("a"), ["a"]);
    assert.deepEqual(toIdArray(["a", ["b", ["c"]]]), ["a", "b", "c"]);
    assert.deepEqual(toIdArray({id: ["a"], seg: ["b", "c"]}), ["a", "b", "c"]);
    assert.deepEqual(toIdArray(undefined), [undefined]);
    assert.deepEqual(toIdArray(null), [null]);
});

test("normalizeIds flattens nested ids and rejects junk", () => {
    assert.deepEqual(normalizeIds([["a", "b"], {id: "c", seg: ["d"]}]), ["a", "b", "c", "d"]);
    assert.throws(() => normalizeIds([{}]), /Invalid id/);
    assert.throws(() => normalizeIds([]), /must not be empty/);
});

test("unknownIdMessage suggests similar known ids", () => {
    _.reset();
    _.newText({id: "title", text: "x"});
    assert.match(unknownIdMessage("clear()", "tittle"), /Did you mean "title"\?/);
    assert.match(unknownIdMessage("clear()", "title"), /no visual events with id "title"/);
});

test("matchesIds only matches events with ids", () => {
    const event = {type: "text", ids: ["a", "b"]};
    assert.equal(matchesIds(event, ["b"]), true);
    assert.equal(matchesIds(event, ["c"]), false);
    assert.equal(matchesIds({type: "tween"}, ["a"]), false);
});

test("resolveDuration uses current time", () => {
    _.reset();
    _.wait(3);
    assert.equal(resolveDuration(2), 5);
    assert.equal(resolveDuration(null), null);
    assert.throws(() => validateDuration(-1));
});