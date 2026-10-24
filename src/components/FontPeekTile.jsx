import { motion, useReducedMotion } from "motion/react";
import useVisibleFont from "../hooks/useVisibleFont.js";
import FontActions from "./FontActions.jsx";
import FontNewBadge from "./FontNewBadge.jsx";
import { familyFor, fontUrl, fontSizeLabel, fontTypeLabel, downloadNameFor, usableFont, FONT_VIEW } from "../lib/fonts.js";

/** Compact specimen tile used by the horizontal font peek view. */
export default function FontPeekTile({ font, onPreview, onCopy, onDownload, copied }) {
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
          {font.isNew && <FontNewBadge variant={FONT_VIEW.PEEK} />}
        </span>
        <FontActions font={font} copied={copied} size={size} downloadName={downloadName} downloadHref={downloadHref} onCopy={onCopy} onDownload={onDownload} onPreview={onPreview} variant={FONT_VIEW.PEEK} />
      </div>
    </motion.article>
  );
}
