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
  if (!value || typeof value !== "object") return false;
  if (typeof value.name !== "string" || typeof value.file !== "string") return false;
  if (!/^(ttf|otf|woff|woff2)$/i.test(String(value.type || ""))) return false;
  return typeof value.url === "string" && value.url.startsWith("/fonts/") && !value.url.includes("..");
}

export function fontUrl(font) {
  return new URL(font.url, window.location.origin).href;
}

export function loadFontFace(font) {
  if (!usableFont(font) || !("FontFace" in window)) return Promise.resolve(false);
  const family = familyFor(font);
  const existing = fontLoadPromises.get(family);
  if (existing) return existing;

  const source = 'url("' + fontUrl(font).replace(/"/g, "%22") + '") format("' + String(font.format || "truetype") + '")';
  const promise = new FontFace(family, source, { display: "swap" }).load()
    .then((loaded) => {
      document.fonts.add(loaded);
      return true;
    })
    .catch(() => {
      fontLoadPromises.delete(family);
      return false;
    });

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
