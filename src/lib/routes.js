/** Decode a URL path segment without letting malformed percent-escapes crash rendering. */
export function safeDecodePathSegment(value) {
  try {
    return decodeURIComponent(String(value));
  } catch {
    return null;
  }
}
