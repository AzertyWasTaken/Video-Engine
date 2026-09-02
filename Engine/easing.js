"use strict";

// Easing functions map progress t (0..1) to an eased value in 0..1.
export const Easing = {
    linear: (t) => t,
    quadIn: (t) => t * t,
    quadOut: (t) => 1 - (1 - t) * (1 - t),
    quadInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
    cubicIn: (t) => t * t * t,
    cubicOut: (t) => 1 - (1 - t) ** 3,
    cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
};

// Resolve an easing option: a name from Easing or a custom (t) => eased function.
export function getEasing(easing) {
    if (typeof easing === "function") return easing;

    const fn = Easing[easing];
    if (!fn)
        throw new Error(`Unknown easing "${easing}". Available: ${Object.keys(Easing).join(", ")}.`);

    return fn;
}
