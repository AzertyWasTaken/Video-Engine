"use strict";
import path from "path";
import {fileURLToPath} from "url";
import {spawn} from "child_process";
import {render} from "./render.js";
import {WIDTH, HEIGHT, FPS, duration} from "./anim.js";

const ffmpegPath = "C:/ffmpeg/bin/ffmpeg.exe";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputFile = path.join(scriptDir, "anim.mp4");

const totalFrames = FPS * duration;

const ffmpeg = spawn(ffmpegPath, [
    "-y",
    "-f", "rawvideo",
    "-pixel_format", "rgba", 
    "-video_size", `${WIDTH}x${HEIGHT}`,
    "-r", String(FPS),
    "-i", "-",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-threads", "0",
    outputFile
]);

(async () => {
    for (let f = 0; f < totalFrames; f++) {
        const t = f / FPS;

        const frame = render(t);
        const buffer = Buffer.from(frame.data.buffer);

        if (!ffmpeg.stdin.write(buffer)) {
            await new Promise(resolve => ffmpeg.stdin.once("drain", resolve));
        }
    }

    ffmpeg.stdin.end();
})();

ffmpeg.on("close", () => {
    console.log("Duration:", duration);
    console.log("Video complete");
});
