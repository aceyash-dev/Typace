const fontLoadPromises = new Map();

export function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\\u0300-\\u036f]/g, "")
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

// Builds the same @font-face rule as /api/css/:slug locally, so copying never waits on a network call.
export function fontFaceCss(font) {
  const family = String(font.name).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const format = fontFormat(font);
  return '@font-face {\n  font-family: "' + family + '";\n  src: url("' + fontUrl(font) + '")' +
    (format ? ' format("' + format + '")' : "") + ";\n  font-display: swap;\n}";
}

function fontFormat(font) {
  const format = String(font.format || "").toLowerCase();
  if (["truetype", "opentype", "woff", "woff2"].includes(format)) return format;
  return ({ ttf: "truetype", otf: "opentype", woff: "woff", woff2: "woff2" })[String(font.type || "").toLowerCase()] || "";
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
