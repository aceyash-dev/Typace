import fs from "node:fs/promises";
import path from "node:path";

const FONT_EXTENSIONS = new Set([
    ".ttf",
    ".otf",
    ".woff",
    ".woff2"
]);

export default async function handler(req, res) {
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

                const extension =
                    path.extname(entry.name).toLowerCase();

                return FONT_EXTENSIONS.has(extension);
            })
            .map(entry => {
                const filename = entry.name;

                const extension =
                    path.extname(filename);

                // Filename without extension = font name.
                const name =
                    filename
                        .slice(
                            0,
                            -extension.length
                        )
                        .trim();

                return {
                    name,
                    file: filename
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
            "Content-Type",
            "application/json; charset=utf-8"
        );

        res.setHeader(
            "Cache-Control",
            "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400"
        );

        res.status(200).json(fonts);
    } catch (error) {
        console.error(
            "Typace font discovery failed:",
            error
        );

        res.status(500).json({
            error: "Unable to read fonts directory."
        });
    }
}            error: "Unable to scan the fonts directory."
        });
    }
}