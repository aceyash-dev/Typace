import fs from "node:fs/promises";
import path from "node:path";

const FONT_TYPES = {
    ".ttf": {
        type: "ttf",
        format: "truetype"
    },
    ".otf": {
        type: "otf",
        format: "opentype"
    },
    ".woff": {
        type: "woff",
        format: "woff"
    },
    ".woff2": {
        type: "woff2",
        format: "woff2"
    }
};

function sendJSON(res, status, data) {
    res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8"
    );

    res.status(status).json(data);
}

export default async function handler(req, res) {
    if (req.method === "OPTIONS") {
        res.setHeader(
            "Access-Control-Allow-Origin",
            "*"
        );

        res.setHeader(
            "Access-Control-Allow-Methods",
            "GET, OPTIONS"
        );

        res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type"
        );

        return res.status(204).end();
    }

    if (req.method !== "GET") {
        return sendJSON(res, 405, {
            error: "Method not allowed."
        });
    }

    try {
        const fontsDirectory = path.join(
            process.cwd(),
            "fonts"
        );

        const entries = await fs.readdir(
            fontsDirectory,
            {
                withFileTypes: true
            }
        );

        const fonts = entries
            .filter(entry => {
                if (!entry.isFile()) {
                    return false;
                }

                const extension = path
                    .extname(entry.name)
                    .toLowerCase();

                return Boolean(
                    FONT_TYPES[extension]
                );
            })
            .map(entry => {
                const file = entry.name;

                const extension = path
                    .extname(file)
                    .toLowerCase();

                const metadata =
                    FONT_TYPES[extension];

                const name = file
                    .slice(
                        0,
                        -extension.length
                    )
                    .trim();

                return {
                    name,
                    file,
                    type: metadata.type,
                    format: metadata.format
                };
            })
            .sort((a, b) =>
                a.name.localeCompare(
                    b.name,
                    undefined,
                    {
                        sensitivity: "base"
                    }
                )
            );

        res.setHeader(
            "Access-Control-Allow-Origin",
            "*"
        );

        res.setHeader(
            "Cache-Control",
            "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
        );

        return sendJSON(
            res,
            200,
            fonts
        );
    } catch (error) {
        console.error(
            "Typace font discovery failed:",
            error
        );

        return sendJSON(res, 500, {
            error: "Unable to scan the fonts directory.",
            code: "FONT_SCAN_FAILED"
        });
    }
}