"use strict";
import {createCanvas, loadImage} from "@napi-rs/canvas";

let canvas, width, height;
const imageCache = new Map();

// Cache for sorted events to avoid re-sorting every frame.
// The cache is invalidated when the visual array reference changes.
let cachedVisualRef = null;
let cachedSortedEvents = null;

export function setCanvas(WIDTH, HEIGHT) {
    canvas = createCanvas(WIDTH, HEIGHT);
    width = WIDTH;
    height = HEIGHT;
}

// Sort events by start time once, cache the result.
// Invalidated automatically when the visual array reference changes.
function getSortedEvents(visual) {
    if (cachedVisualRef !== visual) {
        cachedSortedEvents = [...visual]
        .sort((a, b) =>(a.start ?? 0) - (b.start ?? 0));
        cachedVisualRef = visual;
    }
    return cachedSortedEvents;
}

// Binary search for the first event with start > t (i.e. the first event
// that has NOT yet started at time t). All events before this index have
// `start <= t` and are candidates for being active.
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

function getTextOpacity(obj, t) {
    const opacityIn = obj.fadeIn <= 0 ? 1
    : Math.min((t - (obj.start ?? 0)) / obj.fadeIn, 1);

    const opacityOut = obj.fadeOut <= 0 ? 1
    : Math.min(((obj.end ?? Infinity) - t) / obj.fadeOut, 1);

    return Math.min(opacityIn, opacityOut);
}

export function render(visual, t) {
    if (!width || !height || !canvas)
        throw new Error("Missing canvas property");

    const ctx = canvas.getContext("2d");
    const objects = [];
    pushRelevantObjects(objects, t, visual);

    const background = visual.findLast((obj) =>
        obj.type === "background" && t >= obj.start
    );

    ctx.fillStyle = background ? background.color : "#000000";
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const obj of objects) {
        // Compute opacity for fadeIn / fadeOut
        const opacity = getTextOpacity(obj, t);
        if (opacity <= 0) continue;
        ctx.globalAlpha = opacity;

        if (obj.type === "text") {
            if (t - obj.start < obj.flashDuration) {
                ctx.fillStyle = obj.flashColor;
            } else {
                ctx.fillStyle = obj.fontColor;
            }

            ctx.font = `${obj.fontWeight} ${obj.fontSize}px ${obj.fontFamily}`;
            ctx.fillText(obj.text, width / 2 + obj.posX, height / 2 + obj.posY);
        }
        else if (obj.type === "rect") {
            ctx.rect((width - obj.width) / 2 + obj.posX, (height - obj.height) / 2 + obj.posY, obj.width, obj.height);
            ctx.fillStyle = obj.color;
            ctx.fill();
        }
        else if (obj.type === "circle") {
            ctx.beginPath();
            ctx.arc(width / 2 + obj.posX, height / 2 + obj.posY, obj.diameter, 0, 2 * Math.PI);
            ctx.fillStyle = obj.color;
            ctx.fill();
        }
        else if (obj.type === "line") {
            ctx.beginPath();
            const [posX, posY] = [width / 2 + obj.posX, height / 2 + obj.posY];
            ctx.moveTo(posX - obj.lengthX / 2, posY - obj.lengthY / 2);
            ctx.lineTo(posX + obj.lengthX / 2, posY + obj.lengthY / 2);
            ctx.lineWidth = obj.lineWidth;
            ctx.strokeStyle = obj.color;
            ctx.stroke();
        }
        else if (obj.type === "image") {
            const img = imageCache.get(obj.src);
            if (img) {
                ctx.drawImage(
                    img,
                    (width - obj.width) / 2 + obj.posX, (height - obj.height) / 2 + obj.posY,
                    obj.width, obj.height
                );
            }
        }

        ctx.globalAlpha = 1;
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
