import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { fontUrl, familyFor, loadFontFace } from "../lib/fonts.js";

export default function PreviewDialog({ font, onClose, onCopy, copied }) {
  const sheetRef = useRef(null);
  const [sample, setSample] = useState("Aa Bb Cc 0123");
  const [size, setSize] = useState(64);
  const [fontReady, setFontReady] = useState(false);
  const [fontFailed, setFontFailed] = useState(false);
  const family = font ? familyFor(font) : "";

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
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    sheetRef.current?.focus();
    return () => {
      active = false;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [font, onClose]);

  if (!font) return null;

  return (
    <div className="sheet-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="preview-dialog preview-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="preview-title" tabIndex={-1}>
        <div className="sheet-grabber" aria-hidden="true"><span /></div>
        <div className="preview-shell">
          <div className="preview-head">
            <div>
              <span className="eyebrow">TYPE SPECIMEN / PREVIEW</span>
              <h2 id="preview-title">{font.name}</h2>
              <p>{font.file} <span className="dot-separator">·</span> {String(font.type).toUpperCase()}</p>
            </div>
            <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close preview">
              <Icon name="cancel-01" />
            </button>
          </div>
          <div className="preview-stage">
            <div className="preview-stage-meta"><span className={fontFailed ? "preview-font-status is-failed" : "preview-font-status"}>{fontReady ? "FONT READY" : fontFailed ? "SYSTEM FALLBACK · REOPEN TO RETRY" : "LOADING TYPEFACE…"}</span><span>{size}px</span></div>
            <div className="preview-sample" style={{ fontFamily: fontReady ? '"' + family + '", sans-serif' : "inherit", fontSize: size + "px" }} aria-live="polite">
              {sample || " "}
            </div>
            <label className="sample-label" htmlFor="sample-text">Try your own text</label>
            <input id="sample-text" className="sample-input" value={sample} maxLength={180} onChange={(event) => setSample(event.target.value)} placeholder="Type something…" />
            <label className="size-label" htmlFor="font-size"><span>Preview size</span><output>{size}px</output></label>
            <input id="font-size" className="size-slider" type="range" min="24" max="112" step="2" value={size} onChange={(event) => setSize(Number(event.target.value))} />
            <div className="preview-presets" aria-label="Specimen presets"><button type="button" onClick={() => setSample("Aa Bb Cc 0123")}>Aa / 123</button><button type="button" onClick={() => setSample("Sphinx of black quartz, judge my vow.")}>Pangram</button><button type="button" onClick={() => setSample("ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz")}>Alphabet</button></div>
          </div>
          <div className="preview-actions">
            <button className="button button-primary" type="button" onClick={() => onCopy(font)}>
              <Icon name={copied ? "checkmark-circle-02" : "copy-01"} /> {copied ? "CSS copied" : "Copy CSS"}
            </button>
            <a className="button button-secondary" href={fontUrl(font)} download={String(font.file).split("/").pop()}>
              <Icon name="download-01" /> Download
            </a>
            <a className="text-link" href={"/api/fonts/" + encodeURIComponent(font.name)} target="_blank" rel="noreferrer">
              API record <Icon name="arrow-up-right-01" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
