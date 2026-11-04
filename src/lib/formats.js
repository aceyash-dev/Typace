// The file formats the catalogue can serve, in display order. The browse route
// map and the format filter are both built from this list, so adding a format
// here cannot leave the UI disagreeing with /api/fonts again.
export const FORMATS = Object.freeze([
  { type: "woff2", label: "WOFF2" },
  { type: "ttf", label: "TTF" },
  { type: "otf", label: "OTF" },
  { type: "woff", label: "WOFF" }
]);

export const FORMAT_TYPES = Object.freeze(FORMATS.map((format) => format.type));

/** "/browse/ttf" -> "ttf"; anything else -> "all". */
export function formatFromPath(pathname) {
  const match = /^\/browse\/([a-z0-9]+)\/?$/.exec(String(pathname || ""));
  const candidate = match ? match[1] : "";
  return FORMAT_TYPES.includes(candidate) ? candidate : "all";
}
