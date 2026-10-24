import { FONT_VIEW } from "../lib/fonts.js";

/** Render the shared NEW indicator with the existing card/peek styling. */
export default function FontNewBadge({ variant = FONT_VIEW.CARD }) {
  if (variant === FONT_VIEW.PEEK) return <span className="peek-new">NEW</span>;
  return (
    <>
      <i className="meta-dot" aria-hidden="true" />
      <span className="font-new-badge">NEW</span>
    </>
  );
}
