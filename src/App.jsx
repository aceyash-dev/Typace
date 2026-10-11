import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import Icon from "./components/Icon.jsx";
import FontCard from "./components/FontCard.jsx";
import PreviewDialog from "./components/PreviewDialog.jsx";
import CookieConsent from "./components/CookieConsent.jsx";
import LegalPage from "./components/LegalPage.jsx";
import { copyText, formatCount, normalize, usableFont } from "./lib/fonts.js";

const API = "/api/fonts";
const CATEGORIES = [
  { value: "all", label: "All fonts" },
  { value: "serif", label: "Serif" },
  { value: "sans-serif", label: "Sans serif" },
  { value: "unknown", label: "Unclassified" }
];

export default function App() {
  const isBrowse = window.location.pathname === "/browse" || window.location.pathname.startsWith("/browse/");
  const routeFormat = ({ "/browse/woff2": "woff2", "/browse/woff": "woff", "/browse/ttf": "ttf", "/browse/otf": "otf" })[window.location.pathname] || "all";
  const legalRoute = { "/privacy": "privacy", "/terms": "terms", "/cookies": "cookies", "/security": "security" }[window.location.pathname];
  const [fonts, setFonts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("az");
  const [view, setView] = useState("grid");
  const [visibleCount, setVisibleCount] = useState(24);
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
  const searchRef = useRef(null);
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
  useEffect(() => { setVisibleCount(24); }, [query, category, sort]);

  const filtered = useMemo(() => {
    const needle = normalize(query).trim();
    const results = fonts.filter((font) => {
      const matchesCategory = category === "all" || font.category === category;
      const matchesFormat = routeFormat === "all" || String(font.type).toLowerCase() === routeFormat;
      const haystack = normalize([font.name, font.file, font.type, font.format, font.category].join(" "));
      return matchesCategory && matchesFormat && (!needle || haystack.includes(needle));
    });
    results.sort((a, b) => {
      const compare = String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
      return sort === "za" ? -compare : compare;
    });
    return results;
  }, [fonts, query, category, sort, routeFormat]);

  const featuredFonts = useMemo(() => {
    if (filtered.length <= 6) return filtered;
    return Array.from({ length: 6 }, (_, index) => filtered[Math.round(index * (filtered.length - 1) / 5)]);
  }, [filtered]);

  async function handleCopy(font) {
    try {
      const response = await fetch("/api/css/" + encodeURIComponent(font.name), { headers: { Accept: "text/css" } });
      if (!response.ok) throw new Error("CSS endpoint returned " + response.status);
      const css = await response.text();
      if (!css || !css.includes("@font-face")) throw new Error("CSS response was empty or invalid.");
      const ok = await copyText(css);
      if (!ok) throw new Error("Clipboard is unavailable.");
      setCopiedFont(font.file);
      setToast("CSS copied for " + font.name);
      window.setTimeout(() => setCopiedFont(""), 1800);
      window.setTimeout(() => setToast(""), 2400);
    } catch {
      setToast("Could not copy CSS. Open the font API to copy it manually.");
      window.setTimeout(() => setToast(""), 3200);
    }
  }

  if (legalRoute) return <><LegalPage page={legalRoute} /><CookieConsent /></>;

  return (
    <div className={"app-shell" + (isBrowse ? " browse-page" : " home-page")}>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Typace home">
          <img className="brand-image" src="/icon.png" alt="" width="38" height="38" />
          <span className="brand-word">typace</span>
          <span className="brand-beta">BETA</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className={isBrowse ? "nav-active" : ""} href="/browse">Library</a>
          <a href="/developers">Developers</a>
          <a href="/api/openapi.json">API docs</a>
        </nav>
        <div className="header-actions">
          <button className="theme-toggle" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title="Toggle theme">
            <Icon name={theme === "dark" ? "sun-03" : "moon-02"} />
          </button>
          <a className="header-cta" href="/browse">Browse library <Icon name="arrow-up-right-01" /></a>
        </div>
      </header>

      <main>
        {!isBrowse && <motion.section className="hero" aria-labelledby="hero-title" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }}>
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> THE FONT CATALOG</p>
            <h1 id="hero-title">Type with<br /><span>full</span> <em>volume.</em></h1>
            <p className="hero-description">Browse the actual files. Preview a typeface, copy its CSS, or download it. Straight to the point.</p>
            <a className="hero-link" href="#library">Browse the catalog <Icon name="arrow-down-right-01" /></a>
          </div>
          <div className="hero-art">
            <img className="hero-image" src="/og-image.png" alt="Typace typography artwork" width="1200" height="630" fetchPriority="high" />
            <span className="hero-stamp" aria-hidden="true">TYPE<br />KA<br />TASHAN</span>
            <span className="hero-corner-label" aria-hidden="true">TYPOGRAPHY / 001</span>
          </div>
        </motion.section>}

        {isBrowse && <section className="browse-intro"><p className="eyebrow">TYPOGRAPHY INDEX / 001</p><h1>Every typeface.<br /><em>One library.</em></h1><p>Search the collection, test specimens, copy CSS, or download the source file.</p></section>}

        <section className={"library-section" + (isBrowse ? " full-library" : " featured-library")} id="library" aria-labelledby="library-title">
          <div className="section-heading">
            <div><p className="eyebrow">{isBrowse ? "THE COMPLETE INDEX" : "CURATED SPECIMENS / 06"}</p><h2 id="library-title">{isBrowse ? <>Find your <em>type.</em></> : <>A few good <em>typefaces.</em></>}</h2></div>
            {isBrowse ? <p className="section-note">Search by name or format. Preview, copy the CSS, and download the original file.</p> : <a className="all-fonts-link" href="/browse">View all {formatCount(fonts.length)} fonts <Icon name="arrow-up-right-01" /></a>}
          </div>
          {isBrowse && <div className="library-toolbar">
            <label className="search-box">
              <Icon name="search-01" />
              <span className="sr-only">Search fonts</span>
              <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search fonts, formats, styles…" autoComplete="off" />
              {query && <button type="button" className="clear-search" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Clear search"><Icon name="cancel-01" /></button>}
              <kbd>/</kbd>
            </label>
            <label className="sort-control"><span className="sr-only">Sort fonts</span><Icon name="sorting-05" /><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="az">Name A–Z</option><option value="za">Name Z–A</option></select></label>
            <div className="view-switch" role="group" aria-label="Font layout">
              <button type="button" className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-pressed={view === "grid"} aria-label="Grid view"><Icon name="grid-view" /></button>
              <button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-pressed={view === "list"} aria-label="List view"><Icon name="list-view" /></button>
            </div>
          </div>}
          {isBrowse && <div className="filter-row" role="group" aria-label="Filter by font category">
            {CATEGORIES.map((item) => <button key={item.value} type="button" className={"filter-chip" + (category === item.value ? " active" : "")} onClick={() => setCategory(item.value)} aria-pressed={category === item.value}>{item.label}{item.value === "all" && <span>{formatCount(fonts.length)}</span>}</button>)}
            <span className="result-count" aria-live="polite">{loading ? "Loading catalog…" : formatCount(filtered.length) + " fonts"}</span>
          </div>}

          {loading && <div className="loading-state" role="status"><span className="loading-spinner" /><span>Setting the type…</span></div>}
          {!loading && error && <div className="error-state" role="alert"><span className="error-icon"><Icon name="alert-circle" /></span><div><h3>The catalog did not load.</h3><p>{error}</p><button className="button button-primary" type="button" onClick={() => loadCatalog()}><Icon name="refresh" /> Try again</button></div></div>}
          {!loading && !error && filtered.length === 0 && <div className="empty-state"><Icon name="search-remove" /><h3>No fonts found.</h3><p>Try a shorter search or clear the filters.</p><button className="button button-secondary" type="button" onClick={() => { setQuery(""); setCategory("all"); }}>Reset filters</button></div>}
          {!loading && !error && filtered.length > 0 && <>
            <div className={"font-grid " + (view === "list" ? "font-list-view" : "")}>
              {(isBrowse ? filtered.slice(0, visibleCount) : featuredFonts).map((font) => <FontCard key={font.file} font={font} onPreview={setSelectedFont} onCopy={handleCopy} copied={copiedFont === font.file} />)}
            </div>
            {isBrowse && visibleCount < filtered.length && <div className="load-more-wrap"><button className="button button-secondary load-more" type="button" onClick={() => setVisibleCount((count) => Math.min(count + 24, filtered.length))}>Load more fonts <Icon name="arrow-down-01" /><span>{formatCount(filtered.length - visibleCount)} remaining</span></button></div>}
          </>}
        </section>

        {!isBrowse && <section className="showcase-note"><span className="showcase-index">02 / 02</span><div><p className="eyebrow">THE WHOLE COLLECTION</p><h2>Good type deserves<br /><em>room to roam.</em></h2></div><a className="button button-primary" href="/browse">Explore the full library <Icon name="arrow-up-right-01" /></a></section>}

        <section className="api-callout">
          <div className="api-callout-icon"><Icon name="code-square-01" /></div>
          <div className="api-callout-copy"><p className="eyebrow">FOR BUILDERS</p><h2>Use the fonts. <em>Ship the work.</em></h2><p>Fetch the catalog or grab a ready-to-use <code>@font-face</code> rule from the API.</p></div>
          <div className="api-callout-links"><a href="/developers">Developer guide <Icon name="arrow-up-right-01" /></a><a href="/api/openapi.json">API schema <Icon name="arrow-up-right-01" /></a></div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="footer-brand" href="/"><img className="footer-brand-image" src="/icon.png" alt="" width="30" height="30" /><span>typace</span></a>
        <p>Made for type that has something to say.</p>
        <div className="footer-links"><a href="/developers">Developers</a><a href="/api/fonts">Catalog API</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/cookies">Cookie policy</a><a href="/security">Security</a><a href="#" onClick={(event) => { event.preventDefault(); window.dispatchEvent(new Event("typace:cookie-settings")); }}>Cookie settings</a><a href="/llms.txt">Docs for AI tools</a></div>
        <span className="build-meta">{commit ? "BUILD " + commit.shortSha : "FONT LIBRARY"} <span aria-hidden="true">·</span> <a href="/api/commit">STATUS</a></span>
      </footer>
      <PreviewDialog font={selectedFont} onClose={() => setSelectedFont(null)} onCopy={handleCopy} copied={selectedFont ? copiedFont === selectedFont.file : false} />
      {toast && <div className="toast" role="status"><Icon name="checkmark-circle-02" />{toast}</div>}
      <CookieConsent />
    </div>
  );
}
