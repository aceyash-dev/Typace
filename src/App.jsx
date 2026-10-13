import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import Icon from "./components/Icon.jsx";
import FontCard from "./components/FontCard.jsx";
import PreviewDialog from "./components/PreviewDialog.jsx";
import CookieConsent from "./components/CookieConsent.jsx";
import LegalPage from "./components/LegalPage.jsx";
import { copyText, formatCount, normalize, usableFont } from "./lib/fonts.js";

const API = "/api/fonts";
export default function App() {
  const isBrowse = window.location.pathname === "/browse" || window.location.pathname.startsWith("/browse/");
  const isAccount = window.location.pathname === "/account";
  const isDevelopers = window.location.pathname === "/developers" || window.location.pathname.startsWith("/developers/");
  const API_DOCS = "https://docs.ace-base.cc/projects/typace-api";
  const routeFormat = ({ "/browse/woff2": "woff2", "/browse/woff": "woff", "/browse/ttf": "ttf", "/browse/otf": "otf" })[window.location.pathname] || "all";
  const legalRoute = { "/privacy": "privacy", "/terms": "terms", "/cookies": "cookies", "/security": "security" }[window.location.pathname];
  const [fonts, setFonts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("search") || "");
  const [sort, setSort] = useState("az");
  const [formatFilter, setFormatFilter] = useState("all");
  const [view, setView] = useState("grid");
  const [visibleCount, setVisibleCount] = useState(20);
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
  useEffect(() => { setVisibleCount(20); }, [query, sort, routeFormat, formatFilter]);
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
      const compare = String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
      return sort === "za" ? -compare : compare;
    });
    return results;
  }, [fonts, query, sort, routeFormat, formatFilter]);

  useEffect(() => {
    if (!isBrowse || loading || error || visibleCount >= filtered.length) return;
    const sentinel = loadSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisibleCount((count) => Math.min(count + 20, filtered.length));
    }, { rootMargin: "560px 0px", threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isBrowse, loading, error, visibleCount, filtered.length]);

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
    <div className={"app-shell" + (isBrowse ? " browse-page" : isAccount ? " account-page" : isDevelopers ? " developers-route" : " home-page")}>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Typace home">
          <img className="brand-image" src="/icon.png" alt="" width="38" height="38" />
          <span className="brand-word">Typace</span>
          <span className="brand-beta">BETA</span>
        </a>
        {(isBrowse || isAccount || isDevelopers) && <nav className={"main-nav floating-nav" + (navVisible ? " nav-visible" : " nav-hidden")} aria-label="Main navigation">
          <a className={isAccount ? "nav-active" : ""} href="/account" aria-label="Account"><Icon name="user-circle" /><span>Account</span></a>
          {isBrowse && <a className="nav-explore nav-active" href="/browse" aria-label="Explore font library"><Icon name="compass" /><span>Explore</span><Icon name="arrow-up-right-01" /></a>}
          <a className={isDevelopers ? "nav-active" : ""} href="/developers" aria-label="Developer"><Icon name="code" /><span>Developer</span></a>
        </nav>}
        <div className="header-actions account-menu">
          {!isBrowse && !isAccount && !isDevelopers && <a className="header-account-link" href="/account"><Icon name="user-circle" /><span>Account</span></a>}
          <details className="account-popover">
            <summary aria-label="Account settings" title="Account settings"><Icon name="settings-02" /></summary>
            <div className="account-popover-panel">
              <p className="account-popover-title">Preferences</p>
              <button className="account-setting" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Icon name={theme === "dark" ? "sun-03" : "moon-02"} /><span>{theme === "dark" ? "Light appearance" : "Dark appearance"}</span></button>
              <button className="account-setting" type="button" onClick={() => { window.dispatchEvent(new Event("typace:cookie-settings")); document.querySelector(".account-popover")?.removeAttribute("open"); }}><Icon name="cookie" /><span>Cookie settings</span></button>
              <a className="account-setting" href="/cookies" onClick={() => document.querySelector(".account-popover")?.removeAttribute("open")}><Icon name="file-02" /><span>Cookie policy</span><Icon name="arrow-up-right-01" /></a>
            </div>
          </details>
          {!isBrowse && !isAccount && !isDevelopers && <a className="header-cta" href="/browse">Browse library <Icon name="arrow-up-right-01" /></a>}
        </div>
      </header>

      <main>
        {!isBrowse && !isAccount && !isDevelopers && <motion.section className="hero" aria-labelledby="hero-title" initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }}>
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> THE FONT CATALOG</p>
            <h1 id="hero-title">Type with<br /><span>full</span> <em>volume.</em></h1>
            <p className="hero-description">A font library with a little more character. Preview typefaces, copy their CSS, and download the original files.</p>
            <a className="hero-link" href="/browse">Open the font library <Icon name="arrow-up-right-01" /></a>
          </div>
          <div className="hero-art hero-tagline-panel" aria-label="Typace tagline">
            <span className="hero-panel-index">TYPE LIBRARY / 001</span>
            <p>Just a font library,<br /><em>but not your average one.</em></p>
            <span className="hero-panel-foot">TYPOGRAPHY / 001</span>
          </div>
        </motion.section>}

        {isBrowse && <section className="browse-intro"><p className="eyebrow">THE TYPE LIBRARY</p><h1>Find your <em>type.</em></h1><p>Preview, copy CSS, or download the original font file.</p></section>}

        {isAccount && <section className="account-page-content">
          <p className="eyebrow">ACCOUNT / PREFERENCES</p>
          <h1>Your <em>settings.</em></h1>
          <p className="account-lede">Control how Typace looks and manage your privacy preferences on this device.</p>
          <div className="account-overview-grid account-settings-grid">
            <article className="account-overview-card">
              <span className="account-card-index">01 / APPEARANCE</span><Icon name="sun-03" />
              <h2>Color theme</h2><p>Choose the appearance that works best for your screen.</p>
              <button className="account-inline-link account-action-link" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Icon name={theme === "dark" ? "sun-03" : "moon-02"} /> Switch to {theme === "dark" ? "light" : "dark"}</button>
            </article>
            <article className="account-overview-card">
              <span className="account-card-index">02 / PRIVACY</span><Icon name="cookie" />
              <h2>Cookie settings</h2><p>Manage optional analytics consent. Essential site functionality remains available either way.</p>
              <button className="account-inline-link account-action-link" type="button" onClick={() => window.dispatchEvent(new Event("typace:cookie-settings"))}>Manage cookie consent <Icon name="arrow-up-right-01" /></button>
              <a className="account-inline-link" href="/cookies">Read cookie policy <Icon name="arrow-up-right-01" /></a>
            </article>
          </div>
        </section>}

        {isDevelopers && <section className="developers-page"><p className="eyebrow">TYPOGRAPHY API / 002</p><h1>Build with <em>type.</em></h1><p className="developers-lede">Browse the API reference, fetch the catalog, and use the font files in your projects.</p><div className="developer-panels"><a className="developer-panel developer-panel-primary" href={API_DOCS} target="_blank" rel="noreferrer"><span className="developer-panel-index">01 / REFERENCE</span><Icon name="book-open-01" /><h2>API documentation</h2><p>Endpoints, request formats, responses, and integration details.</p><span className="developer-panel-link">Open API docs <Icon name="arrow-up-right-01" /></span></a><a className="developer-panel" href="/api/fonts"><span className="developer-panel-index">02 / DATA</span><Icon name="database-02" /><h2>Font catalog</h2><p>Inspect the live catalog response and available font metadata.</p><span className="developer-panel-link">View catalog JSON <Icon name="arrow-up-right-01" /></span></a><article className="developer-panel"><span className="developer-panel-index">03 / ABOUT</span><Icon name="type-01" /><h2>About Typace</h2><p>A focused font library for previewing typefaces, copying CSS, and downloading original font files.</p><span className="developer-panel-link">Typography, ready to use</span></article><a className="developer-panel" href="/api/openapi.json"><span className="developer-panel-index">04 / SCHEMA</span><Icon name="file-code" /><h2>OpenAPI schema</h2><p>Machine-readable endpoint definitions for clients and tooling.</p><span className="developer-panel-link">View schema <Icon name="arrow-up-right-01" /></span></a></div><div className="developer-code"><p className="eyebrow">QUICK START</p><h2>Start with the catalog endpoint.</h2><code>GET https://typace.ace-base.cc/api/fonts</code><button className="button button-secondary" type="button" onClick={() => { copyText("https://typace.ace-base.cc/api/fonts").then((ok) => setToast(ok ? "Catalog endpoint copied" : "Could not copy endpoint")); }}> <Icon name="copy-01" /> Copy endpoint</button></div></section>}

        

                {!isDevelopers && !isAccount && <section className={"library-section" + (isBrowse ? " full-library" : " featured-library")} id="library" aria-labelledby="library-title">
          <div className="section-heading">
            <div><p className="eyebrow">{isBrowse ? "THE COLLECTION" : "CURATED SPECIMENS / 06"}</p><h2 id="library-title">{isBrowse ? <>All typefaces</> : <>A few good <em>typefaces.</em></>}</h2></div>
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
            <label className="format-control"><span className="sr-only">Filter file format</span><select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value)}><option value="all">All formats</option><option value="woff2">WOFF2</option><option value="woff">WOFF</option><option value="ttf">TTF</option><option value="otf">OTF</option></select></label>
            <div className="view-switch" role="group" aria-label="Font layout">
              <button type="button" className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-pressed={view === "grid"} aria-label="Grid view"><Icon name="grid-view" /></button>
              <button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-pressed={view === "list"} aria-label="List view"><Icon name="list-view" /></button>
            </div>
          </div>}
          {isBrowse && <div className="browse-result-line"><span className="result-count" aria-live="polite">{loading ? "Loading fonts…" : formatCount(filtered.length) + (filtered.length === 1 ? " font" : " fonts")}</span>{(query || formatFilter !== "all" || routeFormat !== "all") && <button type="button" className="text-link clear-filters" onClick={() => { setQuery(""); setFormatFilter("all"); window.history.replaceState({}, "", "/browse"); }}>Clear filters <Icon name="cancel-01" /></button>}</div>}

          {loading && <div className="loading-state" role="status"><span className="loading-spinner" /><span>Setting the type…</span></div>}
          {!loading && error && <div className="error-state" role="alert"><span className="error-icon"><Icon name="alert-circle" /></span><div><h3>The catalog did not load.</h3><p>{error}</p><button className="button button-primary" type="button" onClick={() => loadCatalog()}><Icon name="refresh" /> Try again</button></div></div>}
          {!loading && !error && filtered.length === 0 && <div className="empty-state"><Icon name="search-remove" /><h3>No fonts found.</h3><p>Try a shorter search or clear the filters.</p><button className="button button-secondary" type="button" onClick={() => { setQuery(""); setFormatFilter("all"); }}>Clear search</button></div>}
          {!loading && !error && filtered.length > 0 && <>
            <div className={"font-grid " + (view === "list" ? "font-list-view" : "") + (!isBrowse ? " showcase-rail" : "")}>
              {(isBrowse ? filtered.slice(0, visibleCount) : featuredFonts).map((font) => <FontCard key={font.file} font={font} onPreview={setSelectedFont} onCopy={handleCopy} copied={copiedFont === font.file} />)}
            </div>
            {isBrowse && visibleCount < filtered.length && <div className="load-sentinel" ref={loadSentinelRef} aria-hidden="true"><span className="loading-spinner" /><span>Loading more typefaces…</span></div>}
          </>}
        </section>}

        {!isBrowse && !isDevelopers && !isAccount && <section className="showcase-note"><span className="showcase-index">02 / 02</span><div><p className="eyebrow">THE WHOLE COLLECTION</p><h2>Good type deserves<br /><em>room to roam.</em></h2></div><a className="button button-primary" href="/browse">Explore the full library <Icon name="arrow-up-right-01" /></a></section>}

        {!isDevelopers && !isBrowse && !isAccount && <section className="api-callout">
          <div className="api-callout-icon"><Icon name="code-square-01" /></div>
          <div className="api-callout-copy"><p className="eyebrow">FOR BUILDERS</p><h2>Use the fonts. <em>Ship the work.</em></h2><p>Fetch the catalog or grab a ready-to-use <code>@font-face</code> rule from the API.</p></div>
          <div className="api-callout-links"><a href="/developers">Developer guide <Icon name="arrow-up-right-01" /></a><a href={API_DOCS} target="_blank" rel="noreferrer">API reference <Icon name="arrow-up-right-01" /></a></div>
        </section>}
      </main>

      <footer className="site-footer">
        <a className="footer-brand" href="/"><img className="footer-brand-image" src="/icon.png" alt="" width="30" height="30" /><span>Typace</span></a>
        <div className="footer-links"><a className={isDevelopers ? "nav-active" : ""} href="/developers">Developers</a><a href={API_DOCS} target="_blank" rel="noreferrer">API docs</a><a href="/api/fonts">Catalog API</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/security">Security</a><a href="/llms.txt">Docs for AI tools</a></div>
        <span className="build-meta">{commit ? "BUILD " + commit.shortSha : "FONT LIBRARY"} <span aria-hidden="true">·</span> <a href="/api/commit">STATUS</a></span>
      </footer>
      <PreviewDialog font={selectedFont} onClose={() => setSelectedFont(null)} onCopy={handleCopy} copied={selectedFont ? copiedFont === selectedFont.file : false} />
      {toast && <div className="toast" role="status"><Icon name="checkmark-circle-02" />{toast}</div>}
      <CookieConsent />
    </div>
  );
}
