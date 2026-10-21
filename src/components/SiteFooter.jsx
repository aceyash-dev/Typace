export default function SiteFooter({ commit, isDevelopers, apiDocs }) {
  return (
    <footer className="site-footer">
      <a className="footer-brand" href="/"><img className="footer-brand-image" src="/icon.png" alt="" width="30" height="30" /><span>Typace</span></a>
      <div className="footer-links">
        <a className={isDevelopers ? "nav-active" : ""} href="/developers">Developers</a>
        <a href={apiDocs} target="_blank" rel="noreferrer">API docs</a>
        <a href="/api/fonts">Catalog API</a>
        <a href="/formats/woff2">WOFF2</a>
        <a href="/formats/ttf">TTF</a>
        <a href="/formats/otf">OTF</a>
        <a href="/faq">FAQ</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/security">Security</a>
        <a href="/llms.txt">Docs for AI tools</a>
        <a href="mailto:hello@ace-base.cc">Contact</a>
      </div>
      <span className="build-meta">{commit ? "BUILD " + commit.shortSha : "FONT LIBRARY"} <span aria-hidden="true">·</span> <a href="/api/commit">STATUS</a></span>
    </footer>
  );
}
