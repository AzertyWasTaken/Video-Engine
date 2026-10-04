"use strict";
// Easing functions map progress t (0..1) to an eased value in 0..1.
// Every curve is the "in" variant; `direction` shapes it into out / inOut.
export const Easing = {
    linear: (t) => t,
    quad: (t) => t**2,
    cubic: (t) => t**3,
    back: (t) => 2 * t**2 - t,
    circ: (t) => 1 - Math.sqrt(1 - t**2),
    sin: (t) => 1 - Math.cos(t * Math.PI / 2),
    elastic: (t) => t**2 * Math.sin((t - 1/6) * Math.PI * 3),
    expo: (t) => (2**t - Math.log(2) - 1) * 1 / (1 - Math.log(2)),
};

// Resolve an easing option: a name from Easing or a custom (t) => eased function.
// `direction` shapes the base "in" curve: "in" (default) as-is, "out" mirrored,
// "inOut" as the two halves of the curve scaled to 0..0.5 and 0.5..1.
export function getEasing(easing, direction = "in") {
    const fn = typeof easing === "function" ? easing : Easing[easing];
    if (!fn)
        throw new Error(`Unknown easing "${easing}". Available: ${Object.keys(Easing).join(", ")}.`);

    if (direction === "in") return fn;
    if (direction === "out") return (t) => 1 - fn(1 - t);
    if (direction === "inOut") return (t) => (t < 0.5 ? fn(2 * t) / 2 : 1 - fn(2 - 2 * t) / 2);

    throw new Error(`Unknown easing direction ${JSON.stringify(direction)}. Available: in, out, inOut.`);
}
