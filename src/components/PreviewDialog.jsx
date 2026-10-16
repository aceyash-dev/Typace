import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { fontUrl, familyFor, loadFontFace, fontCssSnippet } from "../lib/fonts.js";
import { track } from "../lib/analytics.js";

const SWIPE_CLOSE = 110;
const SWIPE_NAV = 78;
const VARIANTS = [
  { id: "face", label: "@font-face" },
  { id: "import", label: "@import" },
  { id: "link", label: "<link>" },
  { id: "url", label: "URL" },
];
const THEMES = [
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
  const [variant, setVariant] = useState("face");
  const [theme, setTheme] = useState(() => {
    const stored = readStored("typace-specimen-theme", "light");
    return ["light", "dark", "ink"].includes(stored) ? stored : "light";
  });
  const [fontReady, setFontReady] = useState(false);
  const [fontFailed, setFontFailed] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const family = font ? familyFor(font) : "";

  useEffect(() => { writeStored("typace-sample", sample); }, [sample]);
  useEffect(() => { writeStored("typace-specimen-theme", theme); }, [theme]);

  useEffect(() => {
    if (!font) return undefined;
    let active = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setFontReady(false);
    setFontFailed(false);
    loadFontFace(font).then((result) => {
      if (active) { setFontReady(result); setFontFailed(!result); }
    });
    const onKeyDown = (event) => {
      if (event.key === "Escape") callbacks.current.onClose();
      else if (event.key === "ArrowLeft" && callbacks.current.onPrev) callbacks.current.onPrev();
      else if (event.key === "ArrowRight" && callbacks.current.onNext) callbacks.current.onNext();
    };
    window.addEventListener("keydown", onKeyDown);
    sheetRef.current?.focus();
    return () => {
      active = false;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [font]);

  if (!font) return null;

  const snippet = fontCssSnippet(font, variant);
  const activeVariant = VARIANTS.find((item) => item.id === variant) || VARIANTS[0];

  function startDrag(event) {
    if (event.target.closest("input, textarea, button, a, select, summary, pre")) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
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
    if (!start.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      start.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (start.axis === "y") {
      if (start.fromHandle) setDrag({ x: 0, y: Math.max(0, dy), active: true });
    } else if (start.axis === "x") {
      setDrag({ x: dx, y: 0, active: true });
    }
  }
  function endDrag(event) {
    const start = dragRef.current;
    dragRef.current = null;
    setDrag({ x: 0, y: 0, active: false });
    if (!start || event.type === "pointercancel") return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (start.axis === "y" && start.fromHandle && dy > SWIPE_CLOSE) { onClose(); return; }
    if (start.axis === "x" && Math.abs(dx) > SWIPE_NAV) {
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
            <div className="copy-tabs" role="tablist" aria-label="CSS format">
              {VARIANTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={variant === item.id}
                  className={variant === item.id ? "active" : ""}
                  onClick={() => setVariant(item.id)}
                >{item.label}</button>
              ))}
            </div>
            <pre className="copy-snippet"><code>{snippet}</code></pre>
          </div>
          <div className="preview-actions">
            <button className="button button-primary" type="button" onClick={() => onCopy(font, variant)}>
              <Icon name={copied ? "checkmark-circle-02" : "copy-01"} /> {copied ? "Copied" : "Copy " + activeVariant.label}
            </button>
            <a className="button button-secondary" href={fontUrl(font)} download={String(font.file).split("/").pop()} onClick={() => track("download_font", { font: font.name, variant: "sheet" })}>
              <Icon name="download-01" /> Download
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
