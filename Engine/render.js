"use strict";
import {createCanvas} from "@napi-rs/canvas";

let ctx, width, height;

export function setCanvas(WIDTH, HEIGHT) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    ctx = canvas.getContext("2d");
    width = WIDTH;
    height = HEIGHT;
}

export function render(visual, t) {
    if (!width || !height || !ctx)
        throw new Error("Missing canvas property");

    const objects = visual.filter((obj) =>
        t >= obj.start && t < (obj.end ?? Infinity)
    );

    const background = visual.findLast((obj) =>
        obj.type === "background" && t >= obj.start
    );

    ctx.fillStyle = background ? background.color : "#000000";
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const obj of objects) {
        if (obj.type === "text") {
            if (obj.effect && t - obj.start < 0.5) {
                ctx.fillStyle = "#FFFF40";
            } else {
                ctx.fillStyle = obj.fontColor;
            }

            ctx.font = `${obj.fontWeight} ${obj.fontSize}px ${obj.fontFamily}`;
            ctx.fillText(obj.text, width / 2 + obj.posX, height / 2 + obj.posY);
        }
        else if (obj.type === "circle") {
            ctx.beginPath();
            ctx.arc(width / 2 + obj.posX, height / 2 + obj.posY, 40, 0, 2 * Math.PI);
            ctx.fillStyle = "#FFFFFF";
            ctx.fill();
        }
    }

    return ctx.getImageData(0, 0, width, height);
}
