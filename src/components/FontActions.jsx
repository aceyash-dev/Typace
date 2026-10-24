import Icon from "./Icon.jsx";
import { FONT_VIEW } from "../lib/fonts.js";

/** Shared copy/download controls for the full card and compact peek tile. */
export default function FontActions({ font, copied, size, downloadName, downloadHref, onCopy, onDownload, onPreview, variant = FONT_VIEW.CARD }) {
  const isPeek = variant === FONT_VIEW.PEEK;
  const downloadLabel = "Download " + font.name + (size ? " (" + size + ")" : "");
  const downloadTitle = "Download" + (size ? " · " + size : "");

  return (
    <div className={isPeek ? "peek-actions" : "font-card-actions"}>
      <button className="icon-button" type="button" onClick={() => onCopy(font)} aria-label={"Copy CSS for " + font.name} title={copied ? "Copied" : "Copy CSS"}>
        <Icon name={copied ? "checkmark-circle-02" : "copy-01"} />
      </button>
      {downloadHref ? (
        <a className="icon-button download-button" href={downloadHref} download={downloadName} onClick={() => onDownload?.(font, variant)} aria-label={downloadLabel} title={downloadTitle}>
          <Icon name="download-01" />
          {size && <span className="download-size">{size}</span>}
        </a>
      ) : (
        <span className="icon-button download-button" aria-disabled="true" title="Download unavailable">
          <Icon name="download-01" />
        </span>
      )}
      {!isPeek && (
        <button className="icon-button open-button" type="button" onClick={() => onPreview(font)} aria-label={"Open " + font.name + " preview"} title="Open preview">
          <Icon name="arrow-up-right-01" />
        </button>
      )}
    </div>
  );
}
