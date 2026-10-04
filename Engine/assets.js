"use strict";
import path from "path";
import {assetMap} from "./state.js";

// Register shorthand -> full path pairs, replacing the whole map.
// Every sound and image path is looked up here, so `setAssets()` replaces
// instead of merging: the map is always the current one.
export function setAssets(newMap) {
    if (!newMap || typeof newMap !== "object" || Array.isArray(newMap))
        throw new Error(`setAssets() expects an object of shorthand / path pairs, got ${JSON.stringify(newMap)}.`);

    const entries = new Map();

    for (const [shorthand, fullPath] of Object.entries(newMap)) {
        if (shorthand.length === 0)
            throw new Error("setAssets() shorthand keys must be non-empty strings.");

        if (typeof fullPath !== "string" || fullPath.length === 0)
            throw new Error(
                `setAssets() path for shorthand ${JSON.stringify(shorthand)} must be a non-empty string, got ${JSON.stringify(fullPath)}.`
            );

        entries.set(shorthand, fullPath);
    }

    assetMap.clear();
    for (const [shorthand, fullPath] of entries)
        assetMap.set(shorthand, fullPath);
}

export function getAssets() {return assetMap;}

// Turn a stored shorthand into a full path, in precedence order:
// registered shorthand, then an absolute path, then a path relative to the
// calling script (so plain "Sounds/click.wav" keeps working).
export function resolveAsset(src, baseDir) {
    if (typeof src !== "string" || src.length === 0)
        throw new TypeError(
            `resolveAsset(): Invalid asset path - expected a non-empty string, got ${JSON.stringify(src)}`
        );

    const mapped = assetMap.get(src);
    if (mapped !== undefined) return mapped;

    if (path.isAbsolute(src) || !baseDir) return src;

    return path.join(baseDir, src);
}