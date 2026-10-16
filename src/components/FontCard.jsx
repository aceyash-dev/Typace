import { motion, useReducedMotion } from "motion/react";
import Icon from "./Icon.jsx";
import useVisibleFont from "../hooks/useVisibleFont.js";
import { familyFor, fontUrl } from "../lib/fonts.js";

function fileSizeLabel(font) {
  const bytes = Number(font.sizeBytes ?? font.size ?? font.bytes ?? 0);
  if (!(bytes > 0)) return "";
  return bytes < 1024 * 1024
    ? (bytes / 1024).toFixed(0) + " KB"
    : (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export default function FontCard({ font, onPreview, onCopy, copied, variant = "card" }) {
  const { ref, loaded, failed } = useVisibleFont(font);
  const reduceMotion = useReducedMotion();
  const family = familyFor(font);
  const format = String(font.type || "font").toUpperCase();
  const size = fileSizeLabel(font);
  const isNew = Boolean(font.isNew);
  const state = loaded ? "ready" : failed ? "failed" : "loading";
  const specimenStyle = loaded ? { fontFamily: '"' + family + '", sans-serif' } : undefined;

  // Peek view: a compact specimen wall (freefaces.gallery style).
  if (variant === "peek") {
    return (
      <motion.article
        className="peek-tile"
        ref={ref}
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.1 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <button className="peek-sample" type="button" onClick={() => onPreview(font)} aria-label={"Preview " + font.name}>
          <span className={"peek-glyph is-" + state} style={specimenStyle}>{font.name}</span>
        </button>
        <div className="peek-bar">
          <span className="peek-tags">
            <span className="peek-format">{format}</span>
            {isNew && <span className="peek-new">NEW</span>}
          </span>
          <div className="peek-actions">
            <button className="icon-button" type="button" onClick={() => onCopy(font)} aria-label={"Copy CSS for " + font.name} title={copied ? "Copied" : "Copy CSS"}>
              <Icon name={copied ? "checkmark-circle-02" : "copy-01"} />
            </button>
            <a className="icon-button" href={fontUrl(font)} download={String(font.file).split("/").pop()} aria-label={"Download " + font.name} title="Download font">
              <Icon name="download-01" />
            </a>
          </div>
        </div>
      </motion.article>
    );
  }

  // Card view: the fuller preview card used in the library grid.
  return (
    <motion.article
      className="font-card"
      ref={ref}
      initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.12 }}
      whileHover={reduceMotion ? undefined : { y: -4, scale: 1.008 }}
      whileTap={reduceMotion ? undefined : { scale: 0.995 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      layout
    >
      <div className="font-card-top">
        <span className="font-card-tags">
          <span className="font-format">{format}</span>
          {isNew && <span className="font-new">NEW</span>}
        </span>
        <span className={"font-load-state" + (loaded ? " is-loaded" : failed ? " is-failed" : "")} title={loaded ? "Font ready" : failed ? "Preview unavailable" : "Loading preview"}><span />{loaded ? "READY" : failed ? "FALLBACK" : "LOADING"}</span>
      </div>
      <button className="specimen-button" type="button" onClick={() => onPreview(font)} aria-label={"Preview " + font.name}>
        <span className="specimen" style={specimenStyle}>Aa</span>
        <span className="specimen-caption">{font.name} · The quick brown fox</span>
      </button>
      <div className="font-card-bottom">
        <div className="font-card-name">
          <h2>{font.name}</h2>
          {size && <p className="font-file-meta"><span>{size}</span></p>}
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
    </motion.article>
  );
}
