// Record shaping shared by tools and resources. Tool results carry absolute
// URLs: an agent has no page origin to resolve "/fonts/x.ttf" against.
import { fontFileUrl, selectFields } from "../fonts.js";
import { FORMATS } from "./constants.js";

export function absolute(font) {
    return { ...font, url: fontFileUrl(font) };
}

export function summarise(font) {
    return selectFields([absolute(font)], ["name", "type", "format", "url", "sizeBytes", "isNew"])[0];
}

export function formatCounts(fonts) {
    const counts = {};
    for (const format of FORMATS) counts[format] = 0;
    for (const font of fonts) counts[font.type] = (counts[font.type] || 0) + 1;
    return counts;
}

export function clamp(value, fallback, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(1, Math.trunc(number)));
}
