import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { fontUrl, familyFor, loadFontFace } from "../lib/fonts.js";

export default function PreviewDialog({ font, onClose, onCopy, copied }) {
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
    loadFontFace(font).then((result) => {
      if (active) setFontReady(result);
    });
    return () => {
      active = false;
      if (dialog.open) dialog.close();
    };
  }, [font]);

  if (!font) return null;

  return (
    <dialog
      className="preview-dialog"
      ref={dialogRef}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}
      aria-labelledby="preview-title"
    >
      <div className="preview-shell">
        <div className="preview-head">
          <div>
            <span className="eyebrow">FONT PREVIEW</span>
            <h2 id="preview-title">{font.name}</h2>
            <p>{font.file} <span className="dot-separator">·</span> {String(font.type).toUpperCase()}</p>
          </div>
          <button className="icon-button close-button" type="button" onClick={onClose} aria-label="Close preview">
            <Icon name="cancel-01" />
          </button>
        </div>
        <div className="preview-stage">
          <div className="preview-stage-meta"><span>{fontReady ? "FONT LOADED" : "LIVE SPECIMEN"}</span><span>{size}px</span></div>
          <div
            className="preview-sample"
            style={{ fontFamily: fontReady ? '"' + family + '", sans-serif' : "inherit", fontSize: size + "px" }}
            aria-live="polite"
          >
            {sample || " "}
          </div>
          <label className="sample-label" htmlFor="sample-text">Your specimen</label>
          <input id="sample-text" className="sample-input" value={sample} maxLength={180} onChange={(event) => setSample(event.target.value)} placeholder="Type something…" />
          <label className="size-label" htmlFor="font-size"><span>Preview size</span><output>{size}px</output></label>
          <input id="font-size" className="size-slider" type="range" min="24" max="112" step="2" value={size} onChange={(event) => setSize(Number(event.target.value))} />
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
    </dialog>
  );
}
