const fontLoadPromises = new Map();

export function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function familyFor(font) {
  return "Typace-" + normalize(font.file || font.name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function usableFont(value) {
  if (!value || typeof value.name !== "string" || typeof value.file !== "string") return false;
  if (!/^(ttf|otf|woff|woff2)$/i.test(String(value.type || ""))) return false;
  return typeof value.url === "string" && value.url.startsWith("/fonts/") && !value.url.split("/").includes("..");
}

export function fontUrl(font) {
  return new URL(font.url, window.location.origin).href;
}

function fontFormat(font) {
  const format = String(font.format || "").toLowerCase();
  if (["truetype", "opentype", "woff", "woff2"].includes(format)) return format;
  return ({ ttf: "truetype", otf: "opentype", woff: "woff", woff2: "woff2" })[String(font.type || "").toLowerCase()] || "";
}

// Build a ready-to-paste @font-face rule from font metadata. Used as a
// resilient fallback when the CSS API is unreachable, so copying never fails.
export function buildFontFace(font) {
  if (!usableFont(font)) return "";
  const rawFamily = String(font.name || "");
  const family = String(font.name || "").replace(/["\\]/g, "\\$&");
  const format = fontFormat(font);
  const url = fontUrl(font).replace(/["\\]/g, (character) => encodeURIComponent(character));
  return "@font-face {\n  font-family: \"" + family + "\";\n  src: url(\"" + url + "\")" + (format ? " format(\"" + format + "\")" : "") + ";\n  font-display: swap;\n}";
}

function absoluteUrl(value) {
  try { return new URL(value, window.location.origin).href; } catch { return value; }
}

// A stable, URL-safe slug for a font — used for shareable specimen deep links.
export function slugFor(font) {
  return normalize(font.name || font.file || "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Ready-to-paste snippets for the copy control: the raw @font-face rule, an
// @import, a <link> tag, or the plain font-file URL.
// Human-readable file size, or "" when the catalog has no size for the asset.
export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!(value > 0)) return "";
  return value < 1024 * 1024
    ? Math.round(value / 1024) + " KB"
    : (value / (1024 * 1024)).toFixed(2) + " MB";
}

export const FONT_VIEW = Object.freeze({ CARD: "card", PEEK: "peek" });

export function fontTypeLabel(font) {
  return String(font?.type || "font").toUpperCase();
}

export function fontSizeLabel(font) {
  return formatBytes(font?.sizeBytes ?? font?.size ?? font?.bytes);
}

export function downloadNameFor(font) {
  const name = String(font?.file || font?.name || "font").split(/[\\/]/).pop();
  return name || "font";
}

const indent = (block) => block.split("\n").map((line) => (line ? "  " + line : line)).join("\n");

/**
 * Implementation snippets keyed by target, so a developer picks their stack and
 * gets code that works there. Everything is generated locally from the catalog
 * entry, so it is instant and never depends on a network round trip.
 */
export function fontCssSnippet(font, language = "css") {
  if (!usableFont(font)) return "";

  const rawFamily = String(font.name || "");
  const family = String(font.name || "").replace(/["\\]/g, "\\$&");
  const slug = slugFor(font) || "typeface";
  const absUrl = absoluteUrl(fontUrl(font));
  const absFace = buildFontFace(font).replace(/url\("([^"]+)"\)/, 'url("' + absUrl + '")');
  const cssStack = 'font-family: "' + family + '", sans-serif;';
  const cssStackAttribute = cssStack.replace(/&/g, "&amp;").replace(/\"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const reactStack = "fontFamily: " + JSON.stringify('"' + rawFamily + '", sans-serif');
  const cssEndpoint = absoluteUrl("/api/css/" + encodeURIComponent(font.name));
  const faceBlock = indent(absFace);

  const snippets = {
    css:
      absFace + "\n\n/* then apply it */\nbody {\n  " + cssStack + "\n}",

    html:
      '<link rel="stylesheet" href="' + cssEndpoint + '">\n' +
      "<style>\n  .typeface {\n    " + cssStack + "\n  }\n</style>\n\n" +
      '<p class="typeface">The quick brown fox</p>',

    react:
      "// Load the face at runtime — no stylesheet needed.\n" +
      'import { useEffect } from "react";\n\n' +
      "const FONT_FACE = `" + absFace.replace(/`/g, "\\`") + "`;\n\n" +
      "export default function Typeface({ children }) {\n" +
      "  useEffect(() => {\n" +
      '    const style = document.createElement("style");\n' +
      "    style.textContent = FONT_FACE;\n" +
      "    document.head.append(style);\n" +
      "    return () => style.remove();\n" +
      "  }, []);\n\n" +
      "  return <span style={{ " + reactStack + " }}>{children}</span>;\n" +
      "}",

    next:
      "// app/layout.tsx — import the stylesheet once, at the root\n" +
      'import "./globals.css";\n\n' +
      "/* app/globals.css */\n" + absFace + "\n\n" +
      "// then use it anywhere\n" +
      "<h1 style={{ " + reactStack + " }}>The quick brown fox</h1>",

    vue:
      '<template>\n  <p class="typeface">The quick brown fox</p>\n</template>\n\n' +
      "<style>\n" + faceBlock + "\n\n  .typeface {\n    " + cssStack + "\n  }\n</style>",

    svelte:
      '<p class="typeface">The quick brown fox</p>\n\n' +
      "<style>\n" + faceBlock + "\n\n  .typeface {\n    " + cssStack + "\n  }\n</style>",

    tailwind:
      "/* app.css — declare the face once */\n" + absFace + "\n\n" +
      "// tailwind.config.js\n" +
      "module.exports = {\n" +
      "  theme: {\n    extend: {\n      fontFamily: {\n" +
      "        " + slug + ": [" + JSON.stringify(rawFamily) + ', "sans-serif"],\n' +
      "      },\n    },\n  },\n};\n\n" +
      '<p class="font-' + slug + '">The quick brown fox</p>',

    astro:
      "---\n// src/layouts/Base.astro\n---\n\n" +
      "<style is:global>\n" + faceBlock + "\n</style>\n\n" +
      '<p style="' + cssStackAttribute + '">The quick brown fox</p>',
  };

  return snippets[language] || snippets.css;
}

export function loadFontFace(font) {
  if (!usableFont(font) || !document?.fonts) return Promise.resolve(false);
  const family = familyFor(font);
  const existing = fontLoadPromises.get(family);
  if (existing) return existing;

  const url = fontUrl(font).replace(/["\\\\]/g, (character) => encodeURIComponent(character));
  const format = fontFormat(font);
  const src = 'url("' + url + '")' + (format ? ' format("' + format + '")' : "");
  const promise = (async () => {
    try {
      if ("FontFace" in window) {
        let loaded;
        try {
          loaded = await new FontFace(family, src, { display: "swap" }).load();
        } catch (firstError) {
          // Some browser/font combinations reject a format hint despite a valid font file.
          loaded = await new FontFace(family, 'url("' + url + '")', { display: "swap" }).load();
        }
        document.fonts.add(loaded);
      } else {
        let style = document.querySelector('style[data-typace-font="' + family + '"]');
        if (!style) {
          style = document.createElement("style");
          style.dataset.typaceFont = family;
          style.textContent = '@font-face{font-family:"' + family + '";src:' + src + ';font-display:swap}';
          document.head.appendChild(style);
        }
        await document.fonts.load('16px "' + family + '"');
      }
      await document.fonts.load('16px "' + family + '"');
      const ready = document.fonts.check('16px "' + family + '"');
      if (!ready) fontLoadPromises.delete(family);
      return ready;
    } catch {
      fontLoadPromises.delete(family);
      return false;
    }
  })();

  fontLoadPromises.set(family, promise);
  return promise;
}

export async function copyText(value) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Use the fallback for browsers or contexts without Clipboard API access.
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
}

export function formatCount(value) {
  return Number(value || 0).toLocaleString();
}
