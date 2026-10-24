import { motion, useReducedMotion } from "motion/react";
import useVisibleFont from "../hooks/useVisibleFont.js";
import FontActions from "./FontActions.jsx";
import FontNewBadge from "./FontNewBadge.jsx";
import { familyFor, fontUrl, fontSizeLabel, fontTypeLabel, downloadNameFor, usableFont, FONT_VIEW } from "../lib/fonts.js";

const PANGRAM = "The quick brown fox";

/** Full font specimen card; preview and peek variants live in separate components. */
export default function FontCard({ font, onPreview, onCopy, onDownload, copied }) {
  const { ref, loaded, failed } = useVisibleFont(font);
  const reduceMotion = useReducedMotion();
  const family = familyFor(font);
  const format = fontTypeLabel(font);
  const size = fontSizeLabel(font);
  const downloadName = downloadNameFor(font);
  const downloadHref = usableFont(font) ? fontUrl(font) : "";
  const state = loaded ? "ready" : failed ? "failed" : "loading";
  const specimenStyle = loaded ? { fontFamily: '"' + family + '", sans-serif' } : undefined;

  return (
    <motion.article
      className="font-card"
      ref={ref}
      initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.985 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.12 }}
      whileHover={reduceMotion ? undefined : { y: -3 }}
      whileTap={reduceMotion ? undefined : { scale: 0.997 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      layout
    >
      <button className={"specimen-button is-" + state} type="button" onClick={() => onPreview(font)} aria-label={"Preview " + font.name}>
        <span className="specimen" style={specimenStyle}>Aa</span>
        <span className="specimen-caption" style={specimenStyle}>{PANGRAM}</span>
      </button>
      <div className="font-card-bottom">
        <div className="font-card-name">
          <h2>{font.name}</h2>
          <p className="font-file-meta">
            <span>{format}</span>
            {font.isNew && <FontNewBadge variant={FONT_VIEW.CARD} />}
          </p>
        </div>
        <FontActions font={font} copied={copied} size={size} downloadName={downloadName} downloadHref={downloadHref} onCopy={onCopy} onDownload={onDownload} onPreview={onPreview} variant={FONT_VIEW.CARD} />
      </div>
    </motion.article>
  );
}
