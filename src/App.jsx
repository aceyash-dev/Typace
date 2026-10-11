import { useEffect, useMemo, useRef, useState } from "react";

const API = "/api/fonts";
const CATEGORIES = [
  { value: "all", label: "All fonts" },
  { value: "serif", label: "Serif" },
  { value: "sans-serif", label: "Sans serif" },
  { value: "unknown", label: "Unclassified" }
];
const fontLoadPromises = new Map();

function Icon({ name, className = "" }) {
  return <i aria-hidden="true" className={"hgi hgi-stroke hgi-" + name + (className ? " " + className : "")} />;
}

function normalize(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function familyFor(font) {
  return "Typace-" + normalize(font.file || font.name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function usableFont(value) {
  if (!value || typeof value !== "object") return false;
  if (typeof value.name !== "string" || typeof value.file !== "string") return false;
  if (!/^(ttf|otf|woff|woff2)$/i.test(String(value.type || ""))) return false;
  return typeof value.url === "string" && value.url.startsWith("/fonts/") && !value.url.includes("..");
}

function fontUrl(font) {
  return new URL(font.url, window.location.origin).href;
}

function loadFontFace(font) {
  if (!usableFont(font) || !("FontFace" in window)) return Promise.resolve(false);
  const family = familyFor(font);
  const existing = fontLoadPromises.get(family);
  if (existing) return existing;
  const source = 'url("' + fontUrl(font).replace(/"/g, "%22") + '") format("' + String(font.format || "truetype") + '")';
  const promise = new FontFace(family, source, { display: "swap" }).load().then((loaded) => {
    document.fonts.add(loaded);
    return true;
  }).catch(() => {
    fontLoadPromises.delete(family);
    return false;
  });
  fontLoadPromises.set(family, promise);
  return promise;
}

function useVisibleFont(font, enabled = true) {
  const ref = useRef(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!enabled || !ref.current || !usableFont(font)) return undefined;
    let active = true;
    let observer;
    const load = () => {
      loadFontFace(font).then((result) => {
        if (active) setLoaded(result);
      });
    };
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      }, { rootMargin: "180px" });
      observer.observe(ref.current);
    } else {
      load();
    }
    return () => {
      active = false;
      if (observer) observer.disconnect();
    };
  }, [font, enabled]);
  return { ref, loaded };
}

async function copyText(value) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the selection-based fallback.
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  let copied = false;
  try { copied = document.execCommand("copy"); } catch { copied = false; }
  field.remove();
  return copied;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString();
}

function FontCard({ font, onPreview, onCopy, copied }) {
  const { ref, loaded } = useVisibleFont(font);
  const family = familyFor(font);
  const specimenStyle = loaded ? { fontFamily: '"' + family + '", sans-serif' } : undefined;
  return (
    <article className="font-card" ref={ref}>
      <div className="font-card-top">
        <span className="font-format">{String(font.type || "font").toUpperCase()}</span>
        {font.isNew ? <span className="new-pill">NEW</span> : <span className="font-category">{font.category || "unknown"}</span>}
      </div>
      <button className="specimen-button" type="button" onClick={() => onPreview(font)} aria-label={"Preview " + font.name}>
        <span className="specimen" style={specimenStyle}>Aa</span>
        <span className="specimen-caption">The quick brown fox jumps over the lazy dog.</span>
      </button>
      <div className="font-card-bottom">
        <div className="font-card-name">
          <h2>{font.name}</h2>
          <p>{font.file}</p>
        </div>
        <div className="font-card-actions">
          <button className="icon-button" type="button" onClick={() => onCopy(font)} aria-label={"Copy CSS for " + font.name} title={copied ? "Copied" : "Copy CSS"}>
            <Icon name={copied ? "checkmark-circle-02" : "copy-01"} />
          </button>
          <a className="icon-button" href={fontUrl(font)} download={String(font.file).split("/").pop()} aria-label={"Download " + font.name} title="Download font">
            <Icon name="download-01" />
          </a>
          <button className="icon-button open-button" type="button" onClick={() => onPreview(font)} aria-label={"Open " + font.name + " preview"} title="Open preview">
            <Icon name="arrow-up-right-01" />
          </button>
        </div>
      </div>
    </article>
  );
}

function PreviewDialog({ font, onClose, onCopy, copied }) {
  const dialogRef = useRef(null);
  const [sample, setSample] = useState("Aa Bb Cc 0123");
  const [size, setSize] = useState(64);
  const [fontReady, setFontReady] = useState(false);
  const family = font ? familyFor(font) : "";
  useEffect(() => {
    if (!font || !dialogRef.current) return undefined;
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    let active = true;
    setFontReady(false);
    loadFontFace(font).then((result) => { if (active) setFontReady(result); });
    return () => {
      active = false;
      if (dialog.open) dialog.close();
    };
  }, [font]);
  if (!font) return null;
  return (
    <dialog className="preview-dialog" ref={dialogRef} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === dialogRef.current) onClose(); }} aria-labelledby="preview-title">
      <div className="preview-shell">
        <div className="preview-head">
          <div>
            <span className="eyebrow">FONT PREVIEW</span>
            <h2 id="preview-title">{font.name}</h2>
            <p>{font.file} <span className="dot-separator">·</span> {String(font.type).toUpperCase()}</p>
          </div>
          <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close preview"><Icon name="cancel-01" /></button>
        </div>
        <div className="preview-stage">
          <div className="preview-stage-meta"><span>{fontReady ? "FONT LOADED" : "LIVE SPECIMEN"}</span><span>{size}px</span></div>
          <div className="preview-sample" style={{ fontFamily: fontReady ? '"' + family + '", sans-serif' : "inherit", fontSize: size + "px" }} aria-live="polite">{sample || " "}</div>
          <label className="sample-label" htmlFor="sample-text">Your specimen</label>
          <input id="sample-text" className="sample-input" value={sample} maxLength={180} onChange={(event) => setSample(event.target.value)} placeholder="Type something…" />
          <label className="size-label" htmlFor="font-size"><span>Preview size</span><output>{size}px</output></label>
          <input id="font-size" className="size-slider" type="range" min="24" max="112" step="2" value={size} onChange={(event) => setSize(Number(event.target.value))} />
        </div>
        <div className="preview-actions">
          <button className="button button-primary" type="button" onClick={() => onCopy(font)}><Icon name={copied ? "checkmark-circle-02" : "copy-01"} /> {copied ? "CSS copied" : "Copy CSS"}</button>
          <a className="button button-secondary" href={fontUrl(font)} download={String(font.file).split("/").pop()}><Icon name="download-01" /> Download</a>
          <a className="text-link" href={"/api/fonts/" + encodeURIComponent(font.name)} target="_blank" rel="noreferrer">API record <Icon name="arrow-up-right-01" /></a>
        </div>
      </div>
    </dialog>
  );
}

export default function App() {
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
      const haystack = normalize([font.name, font.file, font.type, font.format, font.category].join(" "));
      return matchesCategory && (!needle || haystack.includes(needle));
    });
    results.sort((a, b) => {
      const compare = String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
      return sort === "za" ? -compare : compare;
    });
    return results;
  }, [fonts, query, category, sort]);

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

  return (
    <div className="app-shell">
      <div className="revamp-banner" role="status">
        <span className="status-pulse" aria-hidden="true" />
        <strong>Revamp in Progress</strong>
        <span className="banner-divider" aria-hidden="true" />
        <span>Typace is getting a fresh type system.</span>
        <span className="banner-note">Fonts stay untouched.</span>
      </div>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Typace home">
          <span className="brand-mark">t<span>.</span></span>
          <span className="brand-word">typace</span>
          <span className="brand-beta">BETA</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className="nav-active" href="#library">Library</a>
          <a href="/developers">Developers</a>
          <a href="/llms.txt">For AI</a>
        </nav>
        <div className="header-actions">
          <button className="theme-toggle" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title="Toggle theme">
            <Icon name={theme === "dark" ? "sun-03" : "moon-02"} />
          </button>
          <a className="header-cta" href="#library">Explore fonts <Icon name="arrow-down-01" /></a>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> THE TYPE PLAYGROUND</p>
            <h1 id="hero-title">Make every<br /><span>letter feel</span> <em>right.</em></h1>
            <p className="hero-description">A growing library of typefaces for interfaces, identities, and everything in between. Find your next font, try it live, and take it with you.</p>
            <a className="hero-link" href="#library">Find your type <Icon name="arrow-down-right-01" /></a>
          </div>
          <div className="hero-art" aria-label="Typography specimen artwork">
            <div className="art-label art-label-top"><span>SPECIMEN NO. 001</span><span>EST. TYPE</span></div>
            <div className="art-word art-word-one">Aa</div>
            <div className="art-word art-word-two">Gg</div>
            <div className="art-sticker"><span>GOOD</span><strong>TYPE</strong><span>CHANGES</span><span>EVERYTHING</span></div>
            <div className="art-baseline"><span>ABCDEFGHIJKLMNOPQRSTUVWXYZ</span><span>0123456789</span></div>
          </div>
          <div className="hero-footnote"><span>01 / DISCOVER</span><span>DESIGNED FOR THE CURIOUS</span><span>SCROLL TO EXPLORE ↓</span></div>
        </section>

        <section className="library-section" id="library" aria-labelledby="library-title">
          <div className="section-heading">
            <div><p className="eyebrow">THE COLLECTION</p><h2 id="library-title">Find your <em>font.</em></h2></div>
            <p className="section-note">Browse the catalog, test a specimen, then download or copy the CSS. No mystery meat metadata.</p>
          </div>
          <div className="library-toolbar">
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
          </div>
          <div className="filter-row" role="group" aria-label="Filter by font category">
            {CATEGORIES.map((item) => <button key={item.value} type="button" className={"filter-chip" + (category === item.value ? " active" : "")} onClick={() => setCategory(item.value)} aria-pressed={category === item.value}>{item.label}{item.value === "all" && <span>{formatCount(fonts.length)}</span>}</button>)}
            <span className="result-count" aria-live="polite">{loading ? "Loading catalog…" : formatCount(filtered.length) + " fonts"}</span>
          </div>

          {loading && <div className="loading-state" role="status"><span className="loading-spinner" /><span>Setting the type…</span></div>}
          {!loading && error && <div className="error-state" role="alert"><span className="error-icon"><Icon name="alert-circle" /></span><div><h3>The catalog did not load.</h3><p>{error}</p><button className="button button-primary" type="button" onClick={() => loadCatalog()}><Icon name="refresh" /> Try again</button></div></div>}
          {!loading && !error && filtered.length === 0 && <div className="empty-state"><Icon name="search-remove" /><h3>No fonts found.</h3><p>Try a shorter search or clear the filters.</p><button className="button button-secondary" type="button" onClick={() => { setQuery(""); setCategory("all"); }}>Reset filters</button></div>}
          {!loading && !error && filtered.length > 0 && <>
            <div className={"font-grid " + (view === "list" ? "font-list-view" : "")}>
              {filtered.slice(0, visibleCount).map((font) => <FontCard key={font.file} font={font} onPreview={setSelectedFont} onCopy={handleCopy} copied={copiedFont === font.file} />)}
            </div>
            {visibleCount < filtered.length && <div className="load-more-wrap"><button className="button button-secondary load-more" type="button" onClick={() => setVisibleCount((count) => Math.min(count + 24, filtered.length))}>Load more fonts <Icon name="arrow-down-01" /><span>{formatCount(filtered.length - visibleCount)} remaining</span></button></div>}
          </>}
        </section>

        <section className="api-callout">
          <div className="api-callout-icon"><Icon name="code-square-01" /></div>
          <div className="api-callout-copy"><p className="eyebrow">BUILT FOR THE WEB</p><h2>Good type. <em>Easy integration.</em></h2><p>Use the catalog API, generate a ready-to-use <code>@font-face</code> rule, or hand the OpenAPI spec to your AI coding assistant.</p></div>
          <div className="api-callout-links"><a href="/developers">Developer guide <Icon name="arrow-up-right-01" /></a><a href="/api/openapi.json">OpenAPI schema <Icon name="arrow-up-right-01" /></a><a href="/llms.txt">AI-readable docs <Icon name="arrow-up-right-01" /></a></div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="footer-brand" href="/"><span className="brand-mark">t<span>.</span></span><span>typace</span></a>
        <p>Made for people who notice the letters.</p>
        <div className="footer-links"><a href="/developers">Developers</a><a href="/api/fonts">Catalog API</a><a href="/llms.txt">For AI</a><a href="https://aero.aryankaushik.space/d/tabgl" target="_blank" rel="noopener noreferrer">Join Dock <Icon name="arrow-up-right-01" /></a></div>
        <span className="build-meta">{commit ? "BUILD " + commit.shortSha : "FONT LIBRARY"} <span aria-hidden="true">·</span> <a href="/api/commit">STATUS</a></span>
      </footer>
      <PreviewDialog font={selectedFont} onClose={() => setSelectedFont(null)} onCopy={handleCopy} copied={selectedFont ? copiedFont === selectedFont.file : false} />
      {toast && <div className="toast" role="status"><Icon name="checkmark-circle-02" />{toast}</div>}
    </div>
  );
}
