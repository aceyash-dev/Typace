/**
 * The write half both generators share.
 *
 * fonts/manifest.json and fonts/style-index.json are committed artifacts rebuilt
 * in CI on every font change, so the rule for both is the same: keep the
 * previous generatedAt when the payload has not moved, and skip the write when
 * the serialised bytes are identical, so a no-op run produces no commit churn.
 * That logic used to be duplicated, line for line, in both scripts.
 */
import { readFileSync, writeFileSync } from "node:fs";

export function readPrevious(path) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch {
        // First run, or an unreadable/corrupt artifact: treat it as absent.
        return null;
    }
}

function sameContent(previous, content) {
    if (!previous) return false;
    return Object.entries(content).every(
        ([key, value]) => JSON.stringify(previous[key]) === JSON.stringify(value)
    );
}

/**
 * Write `content` with a fresh generatedAt only when something changed.
 * Returns true when the file was written.
 */
export function writeArtifact({ path, note, content, logCurrent, logWritten }) {
    const previous = readPrevious(path);
    const unchanged = sameContent(previous, content);
    const output = {
        generatedAt: unchanged ? previous.generatedAt : new Date().toISOString(),
        note,
        ...content,
    };

    const serialised = JSON.stringify(output, null, 2) + "\n";
    const before = previous ? JSON.stringify(previous, null, 2) + "\n" : "";
    if (serialised === before) {
        logCurrent(output);
        return false;
    }

    writeFileSync(path, serialised, "utf8");
    logWritten(output);
    return true;
}
