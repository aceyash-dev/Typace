import test from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS, brandTheme, themeFromColor } from "../src/lib/palette.js";

test("image providers produce valid URLs with encoded seeds and dimensions", () => {
  const seed = "theme seed/with spaces";
  const urls = PROVIDERS.map((provider) => ({ provider, url: provider.url(seed, 240) }));

  for (const { provider, url } of urls) {
    assert.doesNotThrow(() => new URL(url, "https://typace.example"), provider.id);
    assert.ok(url.includes(encodeURIComponent(seed)) || provider.id === "loremflickr", provider.id);
  }

  assert.match(urls.find(({ provider }) => provider.id === "picsum").url, /\/240\/240$/);
  assert.match(urls.find(({ provider }) => provider.id === "loremflickr").url, /\?lock=\d+$/);
  assert.match(urls.find(({ provider }) => provider.id === "dicebear").url, /\/shapes\/png\?seed=.*&size=240$/);
  assert.match(urls.find(({ provider }) => provider.id === "robohash").url, /\.png\?size=240x240$/);
  assert.equal(urls.find(({ provider }) => provider.id === "typace").url, "/api/image?seed=theme%20seed%2Fwith%20spaces");
});

test("brand fallback preserves the designed orange palette without an image", () => {
  assert.deepEqual(brandTheme(), {
    isLight: false,
    hue: 26,
    provider: "brand",
    image: "",
    accent: "#ed7418",
    accentDark: "#b94b08",
    accentSoft: "#ffead6",
    ink: "#b94b08",
  });
});

test("photo-derived theme values are valid CSS colors and retain source hue", () => {
  const theme = themeFromColor({ r: 65, g: 160, b: 205 }, "test-provider", "/image.png");
  assert.equal(theme.provider, "test-provider");
  assert.equal(theme.image, "/image.png");
  assert.ok(Number.isFinite(theme.hue) && theme.hue >= 0 && theme.hue < 360);
  for (const key of ["accent", "accentDark", "accentSoft", "ink"]) {
    assert.match(theme[key], /^hsl\(\d+ \d+% \d+%\)$/);
  }
});
