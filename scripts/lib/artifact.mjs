import { readFileSync, writeFileSync } from "node:fs";

export function readPreviousJson(outputPath) {
    try {
        return JSON.parse(readFileSync(outputPath, "utf8"));
    } catch (error) {
        if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
        throw error;
    }
}

/** Write a generated JSON artifact only when its complete serialisation changes. */
export function writeIfChanged({ outputPath, payload, summary }) {
    const previous = readPreviousJson(outputPath);
    const unchanged = Boolean(previous)
        && typeof previous.generatedAt === "string"
        && payload.isUnchanged(previous);
    const output = {
        generatedAt: unchanged ? previous.generatedAt : new Date().toISOString(),
        ...payload.create(previous),
    };
    const serialised = `${JSON.stringify(output, null, 2)}\n`;
    const before = previous ? `${JSON.stringify(previous, null, 2)}\n` : "";
    if (serialised === before) {
        console.log(`${summary} already current.`);
        return { changed: false, output };
    }
    writeFileSync(outputPath, serialised, "utf8");
    console.log(`Wrote ${summary}.`);
    return { changed: true, output };
}
