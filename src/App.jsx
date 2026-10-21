import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import Icon from "./components/Icon.jsx";
import FontCard from "./components/FontCard.jsx";
import PreviewDialog from "./components/PreviewDialog.jsx";
import CookieConsent from "./components/CookieConsent.jsx";
import LegalPage from "./components/LegalPage.jsx";
import SkeletonGrid from "./components/SkeletonGrid.jsx";
import SiteFooter from "./components/SiteFooter.jsx";
import { copyText, fontCssSnippet, formatCount, normalize, slugFor, usableFont } from "./lib/fonts.js";
import { track } from "./lib/analytics.js";
import { pickSeed, loadImageTheme, applyTheme } from "./lib/palette.js";

const API = "/api/fonts";
const INITIAL_VISIBLE = 20;

// Desktop has the room (and the CPU) for a bigger batch than a phone.
function loadBatchSize() {
  if (typeof window === "undefined" || !window.matchMedia) return 10;
  return window.matchMedia("(min-width: 1025px)").matches ? 20 : 10;
}
export default function App() {
  const isBrowse = window.location.pathname === "/browse" || window.location.pathname.startsWith("/browse/");
  const isAccount = window.location.pathname === "/account";
  const isDevelopers = window.location.pathname === "/developers" || window.location.pathname.startsWith("/developers/");
  const API_DOCS = "https://docs.ace-base.cc/projects/typace-api";
  const routeFormat = ({ "/browse/woff2": "woff2", "/browse/ttf": "ttf", "/browse/otf": "otf" })[window.location.pathname] || "all";
  const legalRoute = { "/privacy": "privacy", "/terms": "terms", "/cookies": "cookies", "/security": "security" }[window.location.pathname];
  const [fonts, setFonts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("search") || "");
  const [sort, setSort] = useState("az");
  const [formatFilter, setFormatFilter] = useState(routeFormat === "all" ? "all" : routeFormat);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState("card");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [selectedFont, setSelectedFont] = useState(null);
  const [copiedFont, setCopiedFont] = useState("");
  const [toast, setToast] = useState("");
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem("typace-theme");
      if (saved === "dark" || saved === "light") return saved;
    } catch {
      // The interface still works when browser storage is blocked.
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [commit, setCommit] = useState(null);
  const [navVisible, setNavVisible] = useState(true);
  const searchRef = useRef(null);
  const loadSentinelRef = useRef(null);
  const reduceMotion = useReducedMotion();

  async function loadCatalog(signal) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(API, { headers: { Accept: "application/json" }, cache: "no-store", signal });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.error || ("Catalog request failed (" + response.status + ")"));
      }
      const payload = await response.json();
      const records = Array.isArray(payload) ? payload : Array.isArray(payload.fonts) ? payload.fonts : [];
      const usable = records.filter(usableFont);
      if (!usable.length) throw new Error("The catalog returned no usable font records.");
      setFonts(usable);
    } catch (cause) {
      if (cause?.name !== "AbortError") setError(cause instanceof Error ? cause.message : "Unable to load the font catalog.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadCatalog(controller.signal);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("typace-theme", theme); } catch { /* Non-persistent mode is still functional. */ }
  }, [theme]);
  // The accent and the specimen ink come from a random photo's dominant colour.
  // Runs once; the seed is persisted so the palette is stable across reloads.
  useEffect(() => {
    let active = true;
    const seed = pickSeed();
    loadImageTheme(seed).then((palette) => { if (active) applyTheme(palette); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/commit", { headers: { Accept: "application/json" }, cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => { if (active && value && value.shortSha) setCommit(value); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { setVisibleCount(INITIAL_VISIBLE); }, [query, sort, routeFormat, formatFilter]);
  useEffect(() => {
    let previousY = window.scrollY;
    let idleTimer;
    const onScroll = () => {
      const currentY = window.scrollY;
      if (currentY < 36 || currentY < previousY - 6) setNavVisible(true);
      else if (currentY > previousY + 6) setNavVisible(false);
      previousY = currentY;
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setNavVisible(true), 720);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(idleTimer);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = normalize(query).trim();
    const results = fonts.filter((font) => {
      const matchesFormat = (routeFormat === "all" || String(font.type).toLowerCase() === routeFormat) && (formatFilter === "all" || String(font.type).toLowerCase() === formatFilter);
      const haystack = normalize([font.name, font.file, font.type, font.format].join(" "));
      return matchesFormat && (!needle || haystack.includes(needle));
    });
    results.sort((a, b) => {
      if (sort === "new" && Boolean(a.isNew) !== Boolean(b.isNew)) return a.isNew ? -1 : 1;
      const compare = String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
      return sort === "za" ? -compare : compare;
    });
    return results;
  }, [fonts, query, sort, routeFormat, formatFilter]);

  // Keep the current result count in a ref so the observer itself stays stable.
  // Re-creating it on every increment made it fire again immediately while the
  // sentinel was still within the root margin, so batches landed unevenly.
  const resultCountRef = useRef(0);
  resultCountRef.current = filtered.length;
  const hasMore = isBrowse && visibleCount < filtered.length;

  useEffect(() => {
    if (!hasMore || loading || error) return;
    const sentinel = loadSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisibleCount((count) => {
        const total = resultCountRef.current;
        return count >= total ? count : Math.min(count + loadBatchSize(), total);
      });
    }, { rootMargin: "400px 0px", threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, error]);

  const featuredFonts = useMemo(() => {
    if (filtered.length <= 6) return filtered;
    return Array.from({ length: 6 }, (_, index) => filtered[Math.round(index * (filtered.length - 1) / 5)]);
  }, [filtered]);

  const deepSlug = (() => {
    const match = window.location.pathname.match(/^\/browse\/font\/(.+)$/);
    return match ? decodeURIComponent(match[1]).replace(/\/+$/, "") : "";
  })();

  function openFont(font) {
    if (font) track("open_font", { font: font.name, format: font.type });
    setSelectedFont(font);
    if (isBrowse && font) {
      const slug = slugFor(font);
      if (slug) window.history.pushState({ typaceFont: slug }, "", "/browse/font/" + slug);
    }
  }
  function closeFont() {
    setSelectedFont(null);
    if (isBrowse && window.location.pathname.startsWith("/browse/font/")) {
      window.history.pushState({}, "", "/browse");
    }
  }

  // Open the specimen named in a /browse/font/<slug> deep link.
  useEffect(() => {
    if (!deepSlug || !fonts.length) return;
    const match = fonts.find((item) => slugFor(item) === deepSlug);
    if (match) setSelectedFont(match);
  }, [deepSlug, fonts]);

  // Keep the sheet in sync with browser back/forward.
  useEffect(() => {
    const onPop = () => {
      const match = window.location.pathname.match(/^\/browse\/font\/(.+)$/);
      if (match && fonts.length) {
        const slug = decodeURIComponent(match[1]);
        setSelectedFont(fonts.find((item) => slugFor(item) === slug) || null);
      } else {
        setSelectedFont(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [fonts]);

  // Keep metadata consistent with the current route. Static prerendered pages
  // own their route metadata; browser-only routes should never inherit a false
  // homepage canonical.
  useEffect(() => {
    const description = document.querySelector('meta[name="description"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const robots = document.querySelector('meta[name="robots"]');
    const previous = { title: document.title, description: description?.content || "", canonical: canonical?.href || "", robots: robots?.content || "" };
    const base = "https://typace.ace-base.cc";
    let title = "";
    let descriptionText = "";
    let canonicalHref = "";
    let robotsText = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
    if (selectedFont) {
      title = selectedFont.name + " Font — Preview & CSS | Typace";
      descriptionText = "Preview " + selectedFont.name + ", copy its CSS as @font-face, @import, or a <link> tag, or download the original " + String(selectedFont.type || "font").toUpperCase() + " file from Typace.";
      canonicalHref = base + "/font/" + slugFor(selectedFont);
    } else if (isBrowse && routeFormat !== "all") {
      title = routeFormat.toUpperCase() + " Fonts | Typace";
      descriptionText = "Browse " + routeFormat.toUpperCase() + " fonts published by Typace, with ready-to-use CSS and downloads.";
      canonicalHref = base + "/formats/" + routeFormat;
    } else if (isBrowse) {
      title = "Browse Fonts | Typace";
      descriptionText = "Search the Typace font library, preview typefaces, copy ready-to-use CSS, and download original font files.";
      canonicalHref = base + "/browse";
    } else if (isDevelopers) {
      title = "Typace API for Developers | Font Catalog & CSS";
      descriptionText = "Integrate the Typace font catalog with documented API endpoints, OpenAPI, and ready-to-use font CSS.";
      canonicalHref = base + "/developers";
    } else if (isAccount) {
      title = "Account Preferences | Typace";
      descriptionText = "Manage Typace appearance and privacy preferences.";
      canonicalHref = base + "/account";
      robotsText = "noindex,follow";
    } else if (window.location.pathname === "/") {
      title = "Typace | Fonts with Full Volume";
      descriptionText = "Browse the Typace font catalog. Preview typefaces, copy ready-to-use CSS, and download font files.";
      canonicalHref = base + "/";
    }
    if (title) document.title = title;
    if (description && descriptionText) description.setAttribute("content", descriptionText);
    if (canonical && canonicalHref) canonical.setAttribute("href", canonicalHref);
    if (robots) robots.setAttribute("content", robotsText);
    return () => {
      document.title = previous.title;
      if (description) description.setAttribute("content", previous.description);
      if (canonical) canonical.setAttribute("href", previous.canonical);
      if (robots) robots.setAttribute("content", previous.robots);
    };
  }, [selectedFont, isBrowse, isAccount, isDevelopers, routeFormat]);

  async function handleCopy(font, language = "css") {
    try {
      // Generated locally from the catalog entry, so it is instant, always
      // available, and always matches the snippet shown in the preview.
      const snippet = fontCssSnippet(font, language);
      if (!snippet) throw new Error("No snippet to copy.");
      const ok = await copyText(snippet);
      if (!ok) throw new Error("Clipboard is unavailable.");
      track("copy_css", { font: font.name, variant: language });
      const label = { css: "CSS", html: "HTML", react: "React", next: "Next.js", vue: "Vue", svelte: "Svelte", tailwind: "Tailwind", astro: "Astro" }[language] || "CSS";
      setCopiedFont(font.file);
      setToast(label + " snippet copied for " + font.name);
      window.setTimeout(() => setCopiedFont(""), 1800);
      window.setTimeout(() => setToast(""), 2400);
    } catch {
      setToast("Couldn’t copy. Try again, or download the font file instead.");
      window.setTimeout(() => setToast(""), 3200);
    }
  }

  const selectedIndex = selectedFont ? filtered.findIndex((item) => item.file === selectedFont.file) : -1;
  const goPrev = selectedIndex > 0 ? () => openFont(filtered[selectedIndex - 1]) : null;
  const goNext = selectedIndex >= 0 && selectedIndex < filtered.length - 1 ? () => openFont(filtered[selectedIndex + 1]) : null;

  if (legalRoute) return <><LegalPage page={legalRoute} /><CookieConsent /></>;

  return (
    <div className={"app-shell" + (isBrowse ? " browse-page" : isAccount ? " account-page" : isDevelopers ? " developers-route" : " home-page")}>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Typace home">
          <img className="brand-image" src="/icon.png" alt="" width="38" height="38" />
          <span className="brand-word">Typace</span>
          <span className="brand-beta">BETA</span>
        </a>
        {/* Account lives on the landing page only — inside the app the nav tab covers it. */}
        {!isBrowse && !isAccount && !isDevelopers && (
          <div className="header-actions account-menu">
            <a className="header-account-link" href="/account"><Icon name="user-circle" /><span>Account</span></a>
            <details className="account-popover">
              <summary aria-label="Account settings" title="Account settings"><Icon name="settings-02" /></summary>
              <div className="account-popover-panel">
                <p className="account-popover-title">Preferences</p>
                <button className="account-setting" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Icon name={theme === "dark" ? "sun-03" : "moon-02"} /><span>{theme === "dark" ? "Light appearance" : "Dark appearance"}</span></button>
                <button className="account-setting" type="button" onClick={() => { window.dispatchEvent(new Event("typace:cookie-settings")); document.querySelector(".account-popover")?.removeAttribute("open"); }}><Icon name="cookie" /><span>Cookie settings</span></button>
                <a className="account-setting" href="/cookies" onClick={() => document.querySelector(".account-popover")?.removeAttribute("open")}><Icon name="file-02" /><span>Cookie policy</span><Icon name="arrow-up-right-01" /></a>
              </div>
            </details>
            <a className="header-cta" href="/browse">Browse library <Icon name="arrow-up-right-01" /></a>
          </div>
        )}
      </header>

      {/* Rendered OUTSIDE <header> on purpose. The sticky header uses backdrop-filter,
          which makes it the containing block for position:fixed children — that is why
          the docked nav kept rendering at the top of the header instead of the bottom
          of the viewport. As a sibling of the header it is fixed to the viewport again. */}
      {(isBrowse || isAccount || isDevelopers) && (
        <nav className={"main-nav floating-nav" + (navVisible ? " nav-visible" : " nav-hidden")} aria-label="Main navigation">
          <a className={isAccount ? "nav-active" : ""} href="/account" aria-label="Account"><Icon name="user-circle" /><span>Account</span></a>
          <a className={"nav-explore" + (isBrowse ? " nav-active" : "")} href="/browse" aria-label="Explore font library"><Icon name="compass" /><span>Explore</span>{isBrowse && <Icon name="arrow-up-right-01" />}</a>
          <a className={isDevelopers ? "nav-active" : ""} href="/developers" aria-label="Developer"><Icon name="code" /><span>Developer</span></a>
        </nav>
      )}

      <main>
        {!isBrowse && !isAccount && !isDevelopers && <motion.section className="hero" aria-labelledby="hero-title" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }}>
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> THE FONT CATALOG</p>
            <h1 id="hero-title">Type with<br /><span>full</span> <em>volume.</em></h1>
            <p className="hero-description">A font library with a little more character. Preview typefaces, copy their CSS, and download the original files.</p>
            <a className="hero-link" href="/browse">Explore the font library <Icon name="arrow-up-right-01" /></a>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-art-top"><span>01 / 02</span><span>SPECIMEN STUDY</span></div>
            <div className="hero-glyph">Aa</div>
            <div className="hero-art-bottom"><span>THE SHAPE OF LANGUAGE</span><span>— TYPACE</span></div>
          </div>
        </motion.section>}

        {isAccount && <section className="account-overview"><div className="section-heading"><div><p className="eyebrow">YOUR SPACE</p><h1>Account <em>settings.</em></h1></div><p className="section-note">Set the tone, manage privacy, and get back to the good stuff.</p></div>
          <div className="account-overview-grid account-settings-grid">
            <article className="account-overview-card">
              <span className="account-card-index">01 / APPEARANCE</span><Icon name="palette" />
              <h2>Appearance</h2><p>Choose how Typace looks across the library and previews.</p>
              <button className="account-inline-link account-action-link" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>Switch to {theme === "dark" ? "light" : "dark"} mode <Icon name="arrow-up-right-01" /></button>
            </article>
            <article className="account-overview-card">
              <span className="account-card-index">02 / PRIVACY</span><Icon name="cookie" />
              <h2>Cookie settings</h2><p>Manage optional analytics consent. Essential site functionality remains available either way.</p>
              <button className="account-inline-link account-action-link" type="button" onClick={() => window.dispatchEvent(new Event("typace:cookie-settings"))}>Manage cookie consent <Icon name="arrow-up-right-01" /></button>
              <a className="account-inline-link" href="/cookies">Read cookie policy <Icon name="arrow-up-right-01" /></a>
            </article>
            <article className="account-overview-card">
              <span className="account-card-index">03 / COMMUNITY</span><Icon name="grid-view" />
              <h2>Aero Dock</h2><p>Open the Aero Dock community in a new tab.</p>
              <a className="account-inline-link" href="https://aero.aryankaushik.space/d/tabgl" target="_blank" rel="noopener noreferrer" aria-label="Join Aero Dock community (opens in a new tab)">Join Dock <Icon name="arrow-up-right-01" /></a>
            </article>
            <article className="account-overview-card">
              <span className="account-card-index">04 / CONTACT</span><Icon name="mail-01" />
              <h2>Contact Typace</h2><p>Questions, feedback, or a problem with the font library? Get in touch by email.</p>
              <a className="account-inline-link" href="mailto:hello@ace-base.cc">hello@ace-base.cc <Icon name="arrow-up-right-01" /></a>
            </article>
          </div>
        </section>}

        {/* other existing page markup unchanged */}
        {!isDevelopers && !isAccount && <section className={"library-section" + (isBrowse ? " full-library" : " featured-library")} id="library" aria-labelledby="library-title">{ /* retained */ }
        </section>}
      </main>

      <SiteFooter commit={commit} isDevelopers={isDevelopers} apiDocs={API_DOCS} />
      <PreviewDialog font={selectedFont} onClose={closeFont} onCopy={handleCopy} copied={selectedFont ? copiedFont === selectedFont.file : false} onPrev={goPrev} onNext={goNext} />
      {toast && <div className="toast" role="status"><Icon name="checkmark-circle-02" />{toast}</div>}
      <CookieConsent />
    </div>
  );
}
