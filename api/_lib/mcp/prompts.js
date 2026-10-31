// The one prompt Typace offers: turn a design brief into shortlisted typefaces.
import { LICENCE } from "./constants.js";

export const PROMPTS = [
    {
        name: "pick-a-font",
        title: "Pick a font",
        description: "Choose typefaces for a design brief and return them with CSS.",
        arguments: [{ name: "brief", description: "What the font is for, e.g. 'warm serif for a bakery site'.", required: true }],
    },
];

/**
 * Returns `{ found: false }` for an unknown prompt, `{ found: true, error }` for a
 * missing argument, and `{ found: true, result }` on success. The dispatcher maps
 * each case to the right JSON-RPC error code.
 */
export function getPrompt(name, args) {
    if (name !== "pick-a-font") return { found: false };

    const brief = String(args?.brief || "").trim();
    if (!brief) return { found: true, error: "The 'brief' argument is required." };

    return {
        found: true,
        result: {
            description: "Pick typefaces for a brief",
            messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: `Pick three typefaces from Typace for this brief: "${brief}".\n\n` +
                        "Call search_fonts with a few different keywords, compare the results, and return " +
                        "the three best matches with their name, format, and get_font_css output. " +
                        "If nothing fits, say so rather than choosing something unsuitable.\n\n" + LICENCE,
                },
            }],
        },
    };
}
