// Shared loading placeholder. Mirrors the real card so there is no layout shift.
// `compact` is used for the infinite-scroll tail (no meta line).
export default function SkeletonGrid({ count = 6, compact = false, label = "", gridRef = null }) {
  const wrapperProps = label
    ? { role: "status", "aria-busy": "true", "aria-live": "polite" }
    : { "aria-hidden": "true" };
  return (
    <div className={"font-grid " + (compact ? "load-sentinel-grid" : "font-skeleton-grid")} ref={gridRef} {...wrapperProps}>
      {label && <span className="sr-only">{label}</span>}
      {Array.from({ length: count }, (_, index) => (
        <div className="font-card skeleton-card" key={index}>
          <div className="skeleton-top">
            <span className="skeleton-line skeleton-badge" />
            <span className="skeleton-line skeleton-state" />
          </div>
          <span className="skeleton-specimen" />
          <span className="skeleton-line skeleton-title" />
          {!compact && <span className="skeleton-line skeleton-meta" />}
          {!compact && (
            <div className="skeleton-actions">
              <span className="skeleton-chip" />
              <span className="skeleton-chip" />
              <span className="skeleton-chip" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
