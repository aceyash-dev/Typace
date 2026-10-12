import { motion, useReducedMotion } from "motion/react";
import Icon from "./Icon.jsx";
import useVisibleFont from "../hooks/useVisibleFont.js";
import { familyFor, fontUrl } from "../lib/fonts.js";

export default function FontCard({ font, onPreview, onCopy, copied }) {
  const { ref, loaded, failed } = useVisibleFont(font);
  const reduceMotion = useReducedMotion();
  const family = familyFor(font);
  const specimenStyle = loaded ? { fontFamily: '"' + family + '", sans-serif' } : undefined;

  return (
    <motion.article
      className="font-card"
      ref={ref}
      initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduceMotion ? undefined : { y: -5, scale: 1.012 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      layout
    >
      <div className="font-card-top">
        <span className="font-format">{String(font.type || "font").toUpperCase()}</span>
        <span className={"font-load-state" + (loaded ? " is-loaded" : failed ? " is-failed" : "")} title={loaded ? "Font ready" : failed ? "Preview unavailable" : "Loading preview"}><span />{loaded ? "READY" : failed ? "FALLBACK" : "LOADING"}</span>
      </div>
      <button className="specimen-button" type="button" onClick={() => onPreview(font)} aria-label={"Preview " + font.name}>
        <span className="specimen" style={specimenStyle}>Aa</span>
        <span className="specimen-caption">{font.name} · The quick brown fox</span>
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
    </motion.article>
  );
}
