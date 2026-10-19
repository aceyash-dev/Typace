import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { applyTheme, loadImageTheme, reshuffleSeed } from "../lib/palette.js";
import { fontUrl, familyFor, loadFontFace, fontCssSnippet, formatBytes } from "../lib/fonts.js";
import { track } from "../lib/analytics.js";

const SWIPE_CLOSE = 120;
const SWIPE_NAV_MIN = 64;      // floor, for narrow screens
const SWIPE_NAV_RATIO = 0.22;  // fraction of the sheet width that counts as a swipe
const SWIPE_VELOCITY = 0.55;   // px per ms — a quick flick navigates even if short
// Pick the stack you are building in and get code that works there, rather than
// choosing between CSS syntaxes.
const LANGUAGES = [
  { id: "css", label: "CSS" },
  { id: "html", label: "HTML" },
  { id: "react", label: "React" },
  { id: "next", label: "Next.js" },
  { id: "vue", label: "Vue" },
  { id: "svelte", label: "Svelte" },
  { id: "tailwind", label: "Tailwind CSS" },
  { id: "astro", label: "Astro" },
];
const THEMES = [
  { id: "image", label: "Specimen over the photo" },
  { id: "light", label: "Light specimen" },
  { id: "dark", label: "Dark specimen" },
  { id: "ink", label: "Specimen on colour" },
];

function readStored(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch { return fallback; }
}
function writeStored(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage may be blocked */ }
}

export default function PreviewDialog({ font, onClose, onCopy, copied, onPrev, onNext }) {
  const sheetRef = useRef(null);
  const dragRef = useRef(null);
  // Keep the latest callbacks in a ref so the effect only re-runs when the font
  // changes — otherwise navigating prev/next would reset the loaded state.
  const callbacks = useRef({ onClose, onPrev, onNext });
  callbacks.current = { onClose, onPrev, onNext };
  const [sample, setSample] = useState(() => readStored("typace-sample", "Aa Bb Cc 0123"));
  const [language, setLanguage] = useState("css");
  const [theme, setTheme] = useState(() => {
    const stored = readStored("typace-specimen-theme", "image");
    return ["image", "light", "dark", "ink"].includes(stored) ? stored : "image";
  });
  const [fontReady, setFontReady] = useState(false);
  const [fontFailed, setFontFailed] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const imageShuffleRef = useRef(0);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const family = font ? familyFor(font) : "";

  useEffect(() => { writeStored("typace-sample", sample); }, [sample]);
  useEffect(() => { writeStored("typace-specimen-theme", theme); }, [theme]);

  useEffect(() => {
    if (!font) return undefined;
    let active = true;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    const scrim = sheetRef.current?.parentElement;
    const backgroundNodes = scrim?.parentElement
      ? [...scrim.parentElement.children].filter((element) => element !== scrim)
      : [];
    const previousInert = backgroundNodes.map((element) => element.inert);
    backgroundNodes.forEach((element) => { element.inert = true; });
    document.body.style.overflow = "hidden";
    setFontReady(false);
    setFontFailed(false);
    loadFontFace(font).then((result) => {
      if (active) { setFontReady(result); setFontFailed(!result); }
    });
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        callbacks.current.onClose();
        return;
      }
      if (event.key === "Tab") {
        const focusable = [...(sheetRef.current?.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || [])].filter((element) => !element.hasAttribute("hidden"));
        if (!focusable.length) {
          event.preventDefault();
          sheetRef.current?.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === "ArrowLeft" && callbacks.current.onPrev) callbacks.current.onPrev();
      else if (event.key === "ArrowRight" && callbacks.current.onNext) callbacks.current.onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    sheetRef.current?.focus();
    return () => {
      active = false;
      document.body.style.overflow = previousOverflow;
      backgroundNodes.forEach((element, index) => { element.inert = previousInert[index]; });
      window.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, [font]);

  if (!font) return null;

  const snippet = fontCssSnippet(font, language);
  const activeLanguage = LANGUAGES.find((item) => item.id === language) || LANGUAGES[0];
  const sizeLabel = formatBytes(font.sizeBytes ?? font.size ?? font.bytes);

  function shufflePreviewPhoto() {
    const requestId = ++imageShuffleRef.current;
    setImageLoading(true);
    loadImageTheme(reshuffleSeed()).then((palette) => {
      if (requestId !== imageShuffleRef.current) return;
      applyTheme(palette); setImageLoading(false);
    }).catch(() => { if (requestId === imageShuffleRef.current) setImageLoading(false); });
  }

  function startDrag(event) {
    // Never hijack a gesture that starts on something interactive or scrollable.
    if (event.target.closest("input, textarea, button, a, select, summary, pre, code")) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      startedAt: performance.now(),
      axis: null,
      fromHandle: !!event.target.closest(".sheet-grabber, .preview-head"),
    };
    setDrag({ x: 0, y: 0, active: true });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture is best-effort */ }
  }

  function moveDrag(event) {
    const start = dragRef.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // Lock the axis once, with a little hysteresis so a slightly diagonal swipe
    // still resolves to the direction the user meant.
    if (!start.axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      start.axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
    }
    if (start.axis === "x") {
      // Move with the finger; add resistance when there is nothing further to reach.
      const blocked = (dx < 0 && !onNext) || (dx > 0 && !onPrev);
      setDrag({ x: blocked ? dx * 0.28 : dx, y: 0, active: true });
    } else if (start.axis === "y" && start.fromHandle) {
      setDrag({ x: 0, y: Math.max(0, dy), active: true });
    }
  }

  function endDrag(event) {
    const start = dragRef.current;
    dragRef.current = null;
    setDrag({ x: 0, y: 0, active: false });
    if (!start || event.type === "pointercancel") return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const elapsed = Math.max(1, performance.now() - start.startedAt);
    const speed = Math.abs(dx) / elapsed;          // px per ms
    const width = sheetRef.current?.offsetWidth || 340;
    const navThreshold = Math.max(SWIPE_NAV_MIN, width * SWIPE_NAV_RATIO);

    if (start.axis === "y" && start.fromHandle) {
      // Dismiss on a long pull, or a short but decisive flick downwards.
      if (dy > SWIPE_CLOSE || (dy > 46 && dy / elapsed > 0.5)) onClose();
      return;
    }

    if (start.axis === "x") {
      const dragged = Math.abs(dx) > navThreshold;
      const flicked = speed > SWIPE_VELOCITY && Math.abs(dx) > 26;
      if (!dragged && !flicked) return;
      if (dx < 0 && onNext) onNext();
      else if (dx > 0 && onPrev) onPrev();
    }
  }

  const dragStyle = {
    transform: "translate(" + drag.x + "px, " + drag.y + "px)",
    transition: drag.active ? "none" : "transform .3s cubic-bezier(.22,1,.36,1), opacity .3s ease",
    opacity: drag.active && drag.y > 0 ? Math.max(0.45, 1 - drag.y / 460) : 1,
  };

  return (
    <div className="sheet-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        className={"preview-dialog preview-sheet" + (drag.active ? " is-dragging" : "")}
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        tabIndex={-1}
        style={dragStyle}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="sheet-grabber" aria-hidden="true"><span /></div>
        <div className="preview-shell">
          <div className="preview-head">
            <div>
              <span className="eyebrow">TYPE SPECIMEN / PREVIEW</span>
              <h2 id="preview-title">{font.name}</h2>
              <p>{String(font.type || "font").toUpperCase()}</p>
            </div>
            <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close preview">
              <Icon name="cancel-01" />
            </button>
          </div>
          <div className={"preview-stage is-" + theme}>
            <div className="preview-stage-meta">
              <span className={fontFailed ? "preview-font-status is-failed" : "preview-font-status"}>{fontReady ? "FONT READY" : fontFailed ? "SYSTEM FALLBACK · REOPEN TO RETRY" : "LOADING TYPEFACE…"}</span>
              <div className="specimen-theme" role="group" aria-label="Specimen background">
                {THEMES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={"specimen-theme-btn is-" + item.id + (theme === item.id ? " active" : "")}
                    onClick={() => setTheme(item.id)}
                    aria-pressed={theme === item.id}
                    aria-label={item.label}
                    title={item.label}
                  ><span /></button>
                ))}
                {theme === "image" && <button className="specimen-theme-shuffle" type="button" onClick={shufflePreviewPhoto} disabled={imageLoading} aria-label={imageLoading ? "Loading a different photo" : "Show a different photo"} title={imageLoading ? "Loading photo…" : "Show a different photo"}><Icon name="refresh" /></button>}
              </div>
            </div>
            <div className="preview-sample" style={{ fontFamily: fontReady ? '"' + family + '", sans-serif' : "inherit", fontSize: "clamp(34px, 8vw, 62px)" }} aria-live="polite">
              {sample || " "}
            </div>
            <label className="sample-label" htmlFor="sample-text">Try your own text</label>
            <input id="sample-text" className="sample-input" value={sample} maxLength={180} onChange={(event) => setSample(event.target.value)} placeholder="Type something…" />
            <div className="preview-presets" aria-label="Specimen presets"><button type="button" onClick={() => setSample("Aa Bb Cc 0123")}>Aa / 123</button><button type="button" onClick={() => setSample("Sphinx of black quartz, judge my vow.")}>Pangram</button><button type="button" onClick={() => setSample("ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz")}>Alphabet</button></div>
          </div>
          <div className="copy-variants">
            <div className="copy-lang">
              <label className="copy-lang-label" htmlFor="copy-language">Implementation</label>
              <div className="copy-lang-field">
                <select
                  id="copy-language"
                  className="lang-select"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                >
                  {LANGUAGES.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
                <Icon name="arrow-down-01" />
              </div>
            </div>
            <pre className="copy-snippet"><code>{snippet}</code></pre>
          </div>
          <div className="preview-actions">
            <button className="button button-primary" type="button" onClick={() => onCopy(font, language)}>
              <Icon name={copied ? "checkmark-circle-02" : "copy-01"} /> {copied ? "Copied" : "Copy for " + activeLanguage.label}
            </button>
            <a className="button button-secondary" href={fontUrl(font)} download={String(font.file).split("/").pop()} onClick={() => track("download_font", { font: font.name, variant: "sheet" })}>
              <Icon name="download-01" /> Download{sizeLabel ? " · " + sizeLabel : ""}
            </a>
          </div>
          {(onPrev || onNext) && (
            <div className="preview-nav" aria-label="Browse typefaces">
              <button className="icon-button" type="button" onClick={onPrev} disabled={!onPrev} aria-label="Previous typeface"><Icon name="arrow-left-01" /></button>
              <span className="preview-nav-hint">Swipe to browse</span>
              <button className="icon-button" type="button" onClick={onNext} disabled={!onNext} aria-label="Next typeface"><Icon name="arrow-right-01" /></button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
