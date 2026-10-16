import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { fontUrl, familyFor, loadFontFace } from "../lib/fonts.js";

const SWIPE_DISTANCE = 56;
const CLOSE_DISTANCE = 96;
const SAMPLES = [
  ["Aa Bb Cc 0123", "Aa / 123"],
  ["Sphinx of black quartz, judge my vow.", "Pangram"],
  ["ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz", "Alphabet"],
];

export default function PreviewDialog({ font, position, total, onClose, onStep, onCopy, copied }) {
  const sheetRef = useRef(null);
  const drag = useRef(null);
  const handlers = useRef({ onClose, onStep });
  handlers.current = { onClose, onStep };
  const [sample, setSample] = useState(SAMPLES[0][0]);
  const [fontStatus, setFontStatus] = useState("idle");
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!font) return undefined;
    let active = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setFontStatus("loading");
    setOffset({ x: 0, y: 0 });
    loadFontFace(font).then((ready) => { if (active) setFontStatus(ready ? "ready" : "fallback"); });
    const onKeyDown = (event) => {
      if (event.key === "Escape") handlers.current.onClose();
      if (event.key === "ArrowRight") handlers.current.onStep(1);
      if (event.key === "ArrowLeft") handlers.current.onStep(-1);
    };
    window.addEventListener("keydown", onKeyDown);
    sheetRef.current?.focus();
    return () => {
      active = false;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [font]);

  function onTouchStart(event) {
    const interactive = event.target.closest("input, textarea, button, a");
    if (event.touches.length !== 1 || interactive) { drag.current = null; return; }
    const touch = event.touches[0];
    drag.current = { x: touch.clientX, y: touch.clientY, dx: 0, dy: 0, axis: null, scrollTop: sheetRef.current?.scrollTop ?? 0 };
  }

  function onTouchMove(event) {
    const current = drag.current;
    if (!current) return;
    const touch = event.touches[0];
    current.dx = touch.clientX - current.x;
    current.dy = touch.clientY - current.y;
    if (!current.axis && (Math.abs(current.dx) > 8 || Math.abs(current.dy) > 8)) {
      current.axis = Math.abs(current.dx) > Math.abs(current.dy) ? "x" : "y";
    }
    if (current.axis === "x") setOffset({ x: current.dx * 0.4, y: 0 });
    else if (current.axis === "y" && current.dy > 0 && current.scrollTop <= 0) setOffset({ x: 0, y: current.dy * 0.5 });
  }

  function onTouchEnd() {
    const current = drag.current;
    drag.current = null;
    setOffset({ x: 0, y: 0 });
    if (!current) return;
    if (current.axis === "x" && Math.abs(current.dx) > SWIPE_DISTANCE) handlers.current.onStep(current.dx < 0 ? 1 : -1);
    else if (current.axis === "y" && current.dy > CLOSE_DISTANCE && current.scrollTop <= 0) handlers.current.onClose();
  }

  if (!font) return null;
  const family = familyFor(font);

  return (
    <div className="sheet-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        className="preview-dialog preview-sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
        tabIndex={-1}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="sheet-grabber" aria-hidden="true"><span /></div>
        <div className="preview-shell" style={offset.x || offset.y ? { transform: "translate3d(" + offset.x + "px, " + offset.y + "px, 0)" } : undefined}>
          <div className="preview-head">
            <div className="preview-title-block">
              <span className="preview-counter">{position} / {total}</span>
              <h2 id="preview-title">{font.name}</h2>
              <p className="preview-type">{String(font.type).toUpperCase()}</p>
            </div>
            <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close preview">
              <Icon name="cancel-01" />
            </button>
          </div>
          <div className="preview-specimen" aria-live="polite" style={{ fontFamily: fontStatus === "ready" ? '"' + family + '", sans-serif' : "inherit" }}>
            {sample || " "}
          </div>
          <label className="sample-label" htmlFor="sample-text">Try your own text</label>
          <input id="sample-text" className="sample-input" value={sample} maxLength={180} onChange={(event) => setSample(event.target.value)} placeholder="Type something…" />
          <div className="preview-presets" aria-label="Sample text presets">
            {SAMPLES.map(([text, label]) => <button key={label} type="button" onClick={() => setSample(text)}>{label}</button>)}
          </div>
          <div className="preview-actions">
            <button className="button button-primary" type="button" onClick={() => onCopy(font)}>
              <Icon name={copied ? "checkmark-circle-02" : "copy-01"} /> {copied ? "CSS copied" : "Copy CSS"}
            </button>
            <a className="button button-secondary" href={fontUrl(font)} download={String(font.file).split("/").pop()}>
              <Icon name="download-01" /> Download
            </a>
          </div>
          <div className="preview-nav">
            <button type="button" onClick={() => onStep(-1)} aria-label="Previous font"><Icon name="arrow-left-01" /></button>
            <span className="preview-hint">{fontStatus === "fallback" ? "Preview unavailable" : "Swipe or use arrows"}</span>
            <button type="button" onClick={() => onStep(1)} aria-label="Next font"><Icon name="arrow-right-01" /></button>
          </div>
        </div>
      </section>
    </div>
  );
}
