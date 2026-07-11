"use strict";
import {log} from "console";
import {createCanvas} from "@napi-rs/canvas";
import {WIDTH, HEIGHT, visual} from "./anim.js";

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext("2d");

export function render(t) {
    const objects = visual.filter((obj) =>
        t >= obj.start && t < (obj.end ?? Infinity)
    );

    const background = visual.findLast((obj) =>
        obj.type === "background" && t >= obj.start
    );

    ctx.fillStyle = background ? background.color : "#000000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

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
            ctx.fillText(obj.text, WIDTH / 2 + obj.posX, HEIGHT / 2 + obj.posY);
        }
        else if (obj.type === "circle") {
            ctx.beginPath();
            ctx.arc(WIDTH / 2 + obj.posX, HEIGHT / 2 + obj.posY, 40, 0, 2 * Math.PI);
            ctx.fillStyle = "#FFFFFF";
            ctx.fill();
        }
    }

    return ctx.getImageData(0, 0, WIDTH, HEIGHT);
}