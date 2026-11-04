import { enforceRateLimit } from "./_lib/rate-limit.js";
import { applyCommonHeaders, sendJSON } from "./_lib/respond.js";
const REPOSITORY = process.env.TYPACE_REPOSITORY || "aceyash-dev/Typace";
const CACHE_TTL_MS = 60_000;
let cachedCommit = null;
let cachedAt = 0;

// One response path: _lib/respond.js sets the shared CORS, versioning, ETag and
// X-Request-Id headers. The local copy here had drifted, so /api/commit
// responses could not be correlated with the platform logs.
const CACHE_CONTROL = "public, max-age=30, s-maxage=120, stale-while-revalidate=300";

function validTimestamp(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function normalizeCommit(commit, source) {
    if (!commit || typeof commit.sha !== "string" || !/^[a-f0-9]{7,40}$/i.test(commit.sha)) {
        return null;
    }

    const date = validTimestamp(commit.date);
    const sha = commit.sha;
    const message = String(commit.message || "Typace source revision")
        .split("\n")[0]
        .trim()
        .slice(0, 200);

    return {
        sha,
        shortSha: sha.slice(0, 7),
        message: message || "Typace source revision",
        date,

        source
    };
}

async function fetchGitHubCommit(reference) {
    const endpoint = reference
        ? `https://api.github.com/repos/${REPOSITORY}/commits/${encodeURIComponent(reference)}`
        : `https://api.github.com/repos/${REPOSITORY}/commits/main`;

    const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
    const headers = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Typace-Commit-Status"
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(endpoint, {
        headers,
        signal: AbortSignal.timeout(2500)
    });

    if (!response.ok) {
        throw new Error(`GitHub commit lookup returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const date = validTimestamp(data.commit?.author?.date)
        || validTimestamp(data.commit?.committer?.date)
        || null;

    return normalizeCommit({
        sha: data.sha,
        message: data.commit?.message,
        date
    }, "github");
}

async function resolveCommit() {
    const deploymentSha = process.env.VERCEL_GIT_COMMIT_SHA;
    const deploymentMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE;
    // Vercel exposes the author login and name, but no author date; a project
    // variable is the only way to supply one without a GitHub round trip.
    const deploymentDate = process.env.TYPACE_COMMIT_DATE || null;

    if (deploymentSha && /^[a-f0-9]{7,40}$/i.test(deploymentSha)) {
        let fromGitHub = null;
        try {
            fromGitHub = await fetchGitHubCommit(deploymentSha);
        } catch {
            // Deployment metadata is still useful if GitHub is unavailable.
        }

        return normalizeCommit({
            sha: deploymentSha,
            message: deploymentMessage || fromGitHub?.message,
            date: validTimestamp(deploymentDate) || fromGitHub?.date || null
        }, "deployment");
    }

    return fetchGitHubCommit(null);
}

export default async function handler(req, res) {
    applyCommonHeaders(res, req);

    if (req.method === "OPTIONS") {
        res.setHeader("Cache-Control", "no-store");
        return res.status(204).end();
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD, OPTIONS");
        return sendJSON(req, res, 405, {
            error: "Method not allowed.",
            code: "METHOD_NOT_ALLOWED"
        });
    }
    if (!(await enforceRateLimit(req, res))) return;

    if (cachedCommit && Date.now() - cachedAt < CACHE_TTL_MS) {
        return sendJSON(req, res, 200, cachedCommit, { cache: CACHE_CONTROL });
    }

    try {
        const commit = await resolveCommit();
        if (!commit) {
            return sendJSON(req, res, 502, {
                error: "Commit metadata is unavailable.",
                code: "COMMIT_METADATA_UNAVAILABLE"
            });
        }

        cachedCommit = commit;
        cachedAt = Date.now();
        return sendJSON(req, res, 200, commit, { cache: CACHE_CONTROL });
    } catch (error) {
        console.error("Typace commit metadata lookup failed:", error);
        return sendJSON(req, res, 502, {
            error: "Unable to resolve the current Typace commit.",
            code: "COMMIT_LOOKUP_FAILED"
        });
    }
}
