"use strict";
import {Canvas, loadImage} from "skia-canvas";
import {fontString} from "./textParser.js";

let canvas, width, height, pixelWidth, pixelHeight;
const imageCache = new Map();

// Cache for sorted events to avoid re-sorting every frame.
// Invalidated when the visual array reference or length changes
// (events are only pushed, so the length check catches new events).
let cachedVisualRef = null;
let cachedVisualLength = -1;
let cachedSortedEvents = null;

// True while any cached event carries a non-zero layoutOrder:
// only then does render() reorder the active set (stable sort,
// so equal values keep their creation/start order). Tween and
// background events never carry the key, so they fall back to 0.
let sortedHasLayoutOrder = false;

// Stacking comparator: higher layoutOrder draws on top.
const byLayoutOrder = (a, b) => (a.layoutOrder ?? 0) - (b.layoutOrder ?? 0);

// Reused per-frame tween buffers (cleared at the start of every frame).
const tweenOffsets = new Map(); // target event -> {key: offset value}
const tweenColors = new Map();  // drawable event -> css color string

// `WIDTH`/`HEIGHT` are the logical design space every event is positioned in,
// while the canvas (and the encoded video) is `SCALE` times larger in pixels.
// The context transform maps the logical space onto the larger buffer, so a
// bigger SCALE only sharpens the output - nothing moves.
export function setCanvas(WIDTH, HEIGHT, SCALE = 1) {
    pixelWidth = Math.round(WIDTH * SCALE);
    pixelHeight = Math.round(HEIGHT * SCALE);

    canvas = new Canvas(pixelWidth, pixelHeight);
    canvas.gpu = true;
    width = WIDTH;
    height = HEIGHT;

    // Derived from the rounded pixel size, not from SCALE, so a fractional
    // SCALE (1.5) still tiles the logical frame onto the buffer exactly.
    // The transform persists across frames, so it is set once here.
    canvas.getContext("2d").setTransform(pixelWidth / WIDTH, 0, 0, pixelHeight / HEIGHT, 0, 0);
}

// Encoded resolution in pixels - what FFmpeg's -video_size and the frame
// readback must use (they work in device pixels, unaffected by the transform).
export function getPixelSize() {return {WIDTH: pixelWidth, HEIGHT: pixelHeight};}

// Sort events by start time once, cache the result.
// Invalidated automatically when the visual array reference or length changes.
function getSortedEvents(visual) {
    if (cachedVisualRef !== visual || visual.length !== cachedVisualLength) {
        cachedSortedEvents = [...visual]
        .sort((a, b) =>(a.start ?? 0) - (b.start ?? 0));
        cachedVisualRef = visual;
        cachedVisualLength = visual.length;
        sortedHasLayoutOrder = cachedSortedEvents.some((event) => (event.layoutOrder ?? 0) !== 0);
    }
    return cachedSortedEvents;
}

// Binary search for the first event with start > t.
// All events before this index have `start <= t` and are candidates for being active.
function findFirstActive(sortedEvents, t) {
    let lo = 0;
    let hi = sortedEvents.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (sortedEvents[mid].start <= t) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

function pushRelevantObjects(objects, t, visual) {
    // Use cached sorted events + binary search to skip events that start after t.
    // This reduces per-frame cost from O(n) filter to O(log n + k) where k = active events.
    const sortedEvents = getSortedEvents(visual);
    const firstActiveIdx = findFirstActive(sortedEvents, t);

    for (let i = 0; i < firstActiveIdx; i++) {
        const obj = sortedEvents[i];
        if (t < (obj.end ?? Infinity)) {
            objects.push(obj);
        }
    }
}

// Collect active tween contributions into the reused per-frame maps.
// Tween events carry a property override (target + key), a color override
// (target + color), or an orbit override (target + orbit), all addressing
// one drawable event.
function collectTweens(objects, t) {
    tweenOffsets.clear();
    tweenColors.clear();

    for (const obj of objects) {
        if (obj.type !== "tween") continue;

        const span = obj.tweenEnd - obj.start;
        const p = span <= 0 ? 1 : Math.min(Math.max((t - obj.start) / span, 0), 1);
        const e = obj.easing(p);

        if (obj.color) {
            const from = obj.color.from;
            const to = obj.color.to;
            const r = Math.round(from[0] + (to[0] - from[0]) * e);
            const g = Math.round(from[1] + (to[1] - from[1]) * e);
            const b = Math.round(from[2] + (to[2] - from[2]) * e);
            tweenColors.set(obj.target, `rgb(${r},${g},${b})`);
        } else if (obj.orbit) {
            // Sweep the captured pivot-relative vector by the eased angle and
            // spin the object by the same sweep, so the group turns rigidly
            // around the pivot. No allocation beyond the offset entry.
            const swept = obj.orbit.fromAngle + (obj.orbit.toAngle - obj.orbit.fromAngle) * e;
            const rad = swept * Math.PI / 180;
            const {cx, cy, dx, dy} = obj.orbit;

            let entry = tweenOffsets.get(obj.target);
            if (entry === undefined) {
                entry = {};
                tweenOffsets.set(obj.target, entry);
            }

            entry.posX = cx + dx * Math.cos(rad) - dy * Math.sin(rad) - obj.target.posX;
            entry.posY = cy + dx * Math.sin(rad) + dy * Math.cos(rad) - obj.target.posY;
            entry.rotation = obj.orbit.r0 + swept;
        } else {
            const value = obj.from + (obj.to - obj.from) * e;

            let entry = tweenOffsets.get(obj.target);
            if (entry === undefined) {
                entry = {};
                tweenOffsets.set(obj.target, entry);
            }
            entry[obj.key] = value;
        }
    }
}

// Object opacity: base value plus its tween offset, clamped to 0..1 and scaled
// by fade progress. The clamp is required: `globalAlpha` ignores out-of-range
// values, so an overshooting easing would otherwise leak the previous alpha.
function getObjectOpacity(obj, t, tweenOpacity) {
    const opacityIn = obj.fadeIn <= 0 ? 1
    : Math.min((t - (obj.start ?? 0)) / obj.fadeIn, 1);

    const opacityOut = obj.fadeOut <= 0 ? 1
    : Math.min(((obj.end ?? Infinity) - t) / obj.fadeOut, 1);

    const base = Math.min(Math.max(obj.opacity + tweenOpacity, 0), 1);

    return base * Math.min(opacityIn, opacityOut);
}

export function render(visual, t) {
    if (!width || !height || !canvas)
        throw new Error("Missing canvas property");

    const ctx = canvas.getContext("2d");
    const objects = [];
    pushRelevantObjects(objects, t, visual);

    // Stack overlapping objects by layoutOrder (higher draws on top).
    // Skipped unless some event sets a non-zero order, so the default
    // path stays untouched; the start-sorted cache above keeps feeding
    // the binary search regardless.
    if (sortedHasLayoutOrder) objects.sort(byLayoutOrder);

    // Find the active background plus the previous one (crossfade underlay).
    let background = null;
    let prevBackground = null;
    for (let i = visual.length - 1; i >= 0; i--) {
        const obj = visual[i];
        if (obj.type !== "background" || t < (obj.start ?? 0)) continue;

        if (background !== null) {
            prevBackground = obj;
            break;
        }

        if (t < (obj.end ?? Infinity)) background = obj;
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    if (background) {
        // Fade the color in over the previous background (fadeOut reverses it).
        const opacity = Math.min(
            background.fadeIn <= 0 ? 1 : Math.min((t - background.start) / background.fadeIn, 1),
            background.fadeOut <= 0 ? 1 : Math.min(((background.end ?? Infinity) - t) / background.fadeOut, 1)
        );

        if (opacity < 1) {
            if (prevBackground) {
                ctx.fillStyle = prevBackground.color;
                ctx.fillRect(0, 0, width, height);
            }

            ctx.globalAlpha = opacity;
            ctx.fillStyle = background.color;
            ctx.fillRect(0, 0, width, height);
            ctx.globalAlpha = 1;
        }
        else {
            ctx.fillStyle = background.color;
            ctx.fillRect(0, 0, width, height);
        }
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    collectTweens(objects, t);

    for (const obj of objects) {
        if (obj.type === "tween" || obj.type === "background") continue;

        // Tween offsets apply per object (one entry per tweened property)
        const tw = tweenOffsets.get(obj);

        // Combine the object's base opacity with its fadeIn / fadeOut progress.
        const opacity = getObjectOpacity(obj, t, tw?.opacity ?? 0);
        if (opacity <= 0) continue;
        ctx.globalAlpha = opacity;

        const posX = width / 2 + obj.posX + (tw?.posX ?? 0);
        const posY = height / 2 + obj.posY + (tw?.posY ?? 0);
        const colorOverride = tweenColors.get(obj);

        // Rotation pivots on the layout anchor for text (so a multi-segment or
        // multi-line block turns as one unit) and on posX/posY for every other
        // type, which is the bounding-box center. Unrotated objects skip the
        // transform entirely so the common path stays untouched.
        const rotation = (obj.rotation ?? 0) + (tw?.rotation ?? 0);
        if (rotation !== 0) {
            const pivotX = obj.anchorX === undefined ? posX : width / 2 + obj.anchorX + (tw?.posX ?? 0);
            const pivotY = obj.anchorY === undefined ? posY : height / 2 + obj.anchorY + (tw?.posY ?? 0);

            ctx.save();
            ctx.translate(pivotX, pivotY);
            ctx.rotate(rotation * Math.PI / 180);
            ctx.translate(-pivotX, -pivotY);
        }

        if (obj.type === "text") {
            if (colorOverride) {
                ctx.fillStyle = colorOverride;
            } else if (t - obj.start < obj.flashDuration) {
                ctx.fillStyle = obj.flashColor;
            } else {
                ctx.fillStyle = obj.fontColor;
            }

            const fontSize = obj.fontSize + (tw?.fontSize ?? 0);
            let textX = posX;
            let textY = posY;

            // Segment offsets and line spacing are baked in pixels at build
            // time, so a tweened font size scales the whole layout about the
            // text anchor instead of leaving segments at their old spacing.
            if (obj.fontSize > 0 && fontSize !== obj.fontSize) {
                const scale = fontSize / obj.fontSize;
                textX = width / 2 + obj.anchorX + (obj.posX - obj.anchorX) * scale + (tw?.posX ?? 0);
                textY = height / 2 + obj.anchorY + (obj.posY - obj.anchorY) * scale + (tw?.posY ?? 0);
            }

            ctx.font = fontString(obj.italic, obj.fontWeight, fontSize, obj.fontFamily);
            ctx.fillText(obj.text, textX, textY);
        }
        else if (obj.type === "rect") {
            const rectWidth = obj.width + (tw?.width ?? 0);
            const rectHeight = obj.height + (tw?.height ?? 0);

            // beginPath is required: the canvas path persists across frames.
            ctx.beginPath();
            ctx.rect(
                (width - rectWidth) / 2 + obj.posX + (tw?.posX ?? 0),
                (height - rectHeight) / 2 + obj.posY + (tw?.posY ?? 0),
                rectWidth, rectHeight
            );
            ctx.fillStyle = colorOverride ?? obj.color;
            ctx.fill();

            if (obj.strokeColor) {
                ctx.lineWidth = obj.strokeWidth;
                ctx.strokeStyle = obj.strokeColor;
                ctx.stroke();
            }
        }
        else if (obj.type === "circle") {
            const radius = Math.max(0, (obj.diameter + (tw?.diameter ?? 0)) / 2);
            // Arc sweep in clockwise degrees from 12 o'clock; 360 (default) is a full circle.
            const sweep = Math.min(Math.max(obj.arc + (tw?.arc ?? 0), 0), 360) * Math.PI / 180;
            const startAngle = -Math.PI / 2;

            // A partial arc fills as a pie wedge to the center; at 360 this is the same disc as before.
            ctx.beginPath();
            ctx.moveTo(posX, posY);
            ctx.arc(posX, posY, radius, startAngle, startAngle + sweep);
            ctx.fillStyle = colorOverride ?? obj.color;
            ctx.fill();

            // The stroke follows only the arc rim, never the radius edges.
            if (obj.strokeColor) {
                ctx.beginPath();
                ctx.arc(posX, posY, radius, startAngle, startAngle + sweep);
                ctx.lineWidth = obj.strokeWidth;
                ctx.strokeStyle = obj.strokeColor;
                ctx.stroke();
            }
        }
        else if (obj.type === "line") {
            const positions = obj.positions;
            if (positions.length >= 2) {
                const scaleX = obj.scaleX + (tw?.scaleX ?? 0);
                const scaleY = obj.scaleY + (tw?.scaleY ?? 0);

                ctx.beginPath();
                ctx.moveTo(posX + positions[0].x * scaleX, posY + positions[0].y * scaleY);
                for (let i = 1; i < positions.length; i++)
                    ctx.lineTo(posX + positions[i].x * scaleX, posY + positions[i].y * scaleY);
                // loop closes the path: one extra segment back to the first vertex
                if (obj.loop) ctx.closePath();
                ctx.lineWidth = obj.lineWidth + (tw?.lineWidth ?? 0);
                ctx.strokeStyle = colorOverride ?? obj.color;
                ctx.stroke();
            }
        }
        else if (obj.type === "image") {
            const img = imageCache.get(obj.src);
            if (img) {
                const imgWidth = obj.width + (tw?.width ?? 0);
                const imgHeight = obj.height + (tw?.height ?? 0);
                ctx.drawImage(
                    img,
                    (width - imgWidth) / 2 + obj.posX + (tw?.posX ?? 0),
                    (height - imgHeight) / 2 + obj.posY + (tw?.posY ?? 0),
                    imgWidth, imgHeight
                );
            }
        }

        ctx.globalAlpha = 1;
        if (rotation !== 0) ctx.restore();
    }

    return canvas;
}

// Preload an image so it's available during rendering.
// `cacheKey` defaults to `src` but can be set to a different value so that
// the key used during preloading matches the key used during rendering.
export async function loadImageAsset(src, cacheKey = src) {
    if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);
    const img = await loadImage(src);
    imageCache.set(cacheKey, img);
    return img;
}
