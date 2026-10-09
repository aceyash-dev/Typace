const REPOSITORY = "aceyash-dev/Typace";
const CACHE_TTL_MS = 60_000;
let cachedCommit = null;
let cachedAt = 0;

function sendJSON(res, status, data) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
        "Cache-Control",
        status === 200
            ? "public, max-age=30, s-maxage=120, stale-while-revalidate=300"
            : "no-store"
    );
    return res.status(status).json(data);
}

function normalizeCommit(commit, source) {
    if (!commit || typeof commit.sha !== "string" || !/^[a-f0-9]{7,40}$/i.test(commit.sha)) {
        return null;
    }

    const date = commit.date || null;
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
        url: `https://github.com/${REPOSITORY}/commit/${sha}`,
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
    return normalizeCommit({
        sha: data.sha,
        message: data.commit?.message,
        date: data.commit?.author?.date || data.commit?.committer?.date || null
    }, "github");
}

async function resolveCommit() {
    const deploymentSha = process.env.VERCEL_GIT_COMMIT_SHA;
    const deploymentMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE;
    const deploymentDate = process.env.VERCEL_GIT_COMMIT_AUTHOR_DATE || null;

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
            date: deploymentDate || fromGitHub?.date || null
        }, "deployment");
    }

    return fetchGitHubCommit(null);
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        return sendJSON(res, 405, {
            error: "Method not allowed.",
            code: "METHOD_NOT_ALLOWED"
        });
    }

    if (cachedCommit && Date.now() - cachedAt < CACHE_TTL_MS) {
        return sendJSON(res, 200, cachedCommit);
    }

    try {
        const commit = await resolveCommit();
        if (!commit) {
            return sendJSON(res, 502, {
                error: "Commit metadata is unavailable.",
                code: "COMMIT_METADATA_UNAVAILABLE"
            });
        }

        cachedCommit = commit;
        cachedAt = Date.now();
        return sendJSON(res, 200, commit);
    } catch (error) {
        console.error("Typace commit metadata lookup failed:", error);
        return sendJSON(res, 502, {
            error: "Unable to resolve the current Typace commit.",
            code: "COMMIT_LOOKUP_FAILED"
        });
    }
}
