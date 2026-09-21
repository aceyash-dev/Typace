export default async function handler(req, res) {
    try {
        const deploymentSha =
            process.env.VERCEL_GIT_COMMIT_SHA;

        const deploymentMessage =
            process.env.VERCEL_GIT_COMMIT_MESSAGE;

        if (deploymentSha && deploymentMessage) {
            return res.status(200).json({
                sha: deploymentSha,
                shortSha: deploymentSha.slice(0, 7),
                message: deploymentMessage.split("\n")[0],
                date: null
            });
        }

        const response = await fetch(
            "https://api.github.com/repos/aceyash-dev/Typace/commits?per_page=1",
            {
                headers: {
                    Accept: "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                    "User-Agent": "Typace"
                }
            }
        );

        if (!response.ok) {
            return res.status(response.status).json({
                error: "Failed to fetch latest commit"
            });
        }

        const commits = await response.json();
        const commit = commits[0];

        if (!commit) {
            return res.status(404).json({
                error: "No commits found"
            });
        }

        return res.status(200).json({
            sha: commit.sha,
            shortSha: commit.sha.slice(0, 7),
            message: commit.commit.message.split("\n")[0],
            date: commit.commit.author?.date || commit.commit.committer?.date || null
        });
    } catch {
        return res.status(500).json({
            error: "Failed to fetch latest commit"
        });
    }
}
