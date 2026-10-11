import { useEffect } from "react";

const pages = {
  privacy: {
    number: "01", title: "Privacy", subtitle: "A plain-language account of what Typace handles when you use the site.",
    sections: [
      ["Who operates Typace", "Typace is a font library and font delivery service associated with The Ace Base. The site provides a public font catalogue, font previews, downloads, and API endpoints."],
      ["Information processed", "When you visit the site, your browser and hosting infrastructure necessarily exchange technical request information such as IP address, user agent, requested path, timestamp, and response status. API endpoints may use request metadata to apply best-effort rate limits and diagnose failures. Do not submit confidential information to public API endpoints."],
      ["Preferences and analytics", "Typace stores your colour-theme preference and cookie-consent choice in browser local storage. Optional Google Tag Manager analytics are not loaded until you accept analytics or enable them in Cookie settings. You can change your choice at any time from the site footer."],
      ["Third-party services", "The site loads the Grandstander font from Google Fonts and the Hugeicons icon font from their respective providers. Those requests are made to third-party servers and may expose standard connection metadata to those providers. If you enable analytics, Google Tag Manager is also loaded."],
      ["Retention and sharing", "Typace does not provide user accounts or a profile system on the public font catalogue. Technical request records may be handled by the hosting or infrastructure providers under their own retention and security practices. We do not claim a fixed retention period where one has not been published, and we do not sell personal information."],
      ["Your choices and contact", "You can reject optional analytics, change consent using Cookie settings, or block browser storage in your browser settings. Blocking storage may prevent theme and consent preferences from persisting. For privacy requests, contact The Ace Base through its official website at https://ace-base.cc/."]
    ]
  },
  terms: {
    number: "02", title: "Terms of use", subtitle: "Use the service responsibly. Font files have their own licences, which matter more than wishful thinking.",
    sections: [
      ["Using Typace", "You may browse the catalogue, preview available fonts, use the public API, and download files for lawful purposes. Do not interfere with the service, attempt to bypass rate limits, probe systems without authorization, or use the service to distribute malware."],
      ["Font licences", "Typace's availability of a font does not mean that it is public domain, open source, or cleared for every use. Each font may have its own author, owner, and licence. You are responsible for checking the applicable licence before commercial use, embedding, modification, redistribution, or bundling. Typace does not grant rights beyond those the relevant rights holder permits."],
      ["Accuracy and availability", "Catalogue metadata, previews, API responses, and download availability may be incomplete or change over time. The service is provided on an as-available basis, without a promise of uninterrupted access or error-free metadata."],
      ["Third-party services and links", "External resources and linked services are operated by their respective providers and may have separate terms and privacy practices. Typace does not control those services."],
      ["Limits and changes", "To protect service stability, requests may be rate-limited and access may be restricted for abuse or operational reasons. These terms may be updated as the service changes; the current version will be published on this page."],
      ["Contact", "For questions about these terms or a font listing, contact The Ace Base through https://ace-base.cc/. These terms are general service information and are not legal advice."]
    ]
  },
  cookies: {
    number: "03", title: "Cookie policy", subtitle: "What is stored, what is optional, and how to change your mind.",
    sections: [
      ["What the site uses", "Typace currently uses browser local storage for functional preferences. This is not technically the same as an HTTP cookie, but browser storage is described here because it serves a similar preference-persistence purpose."],
      ["Essential preferences", "The key ty pace-theme stores your light/dark theme choice. The key typace-cookie-consent-v1 stores your consent choice and its update time. These are used to remember your settings; the site does not require an account to browse fonts."],
      ["Optional analytics", "Google Tag Manager (container GTM-KWB6T7ZN) is not loaded before you opt in to analytics. If you accept, Google Tag Manager may load tags configured for that container, which can use cookies or similar technologies. The exact analytics cookies depend on the active tag configuration. Rejecting analytics prevents this optional loader from being activated by the Typace consent UI."],
      ["Third-party fonts and icons", "Grandstander is requested from Google Fonts and the Hugeicons icon font is requested from Hugeicons. These are external resource requests and can expose standard connection metadata to the providers. They are loaded for site presentation, independently of the optional analytics choice."],
      ["Change or withdraw consent", "Use Cookie settings in the footer to accept or reject optional analytics at any time. Your choice is stored in local storage. If you clear site data or use a different browser or device, the banner may appear again. If analytics was previously loaded, withdrawal signals denied analytics consent to the data layer; it cannot retroactively erase information already collected by a third party."],
      ["Browser controls", "You can clear site storage or block it in your browser. Some preferences may then reset. This policy describes the current implementation and will be updated if the site's storage or analytics practices change."]
    ]
  }
};

export default function LegalPage({ page }) {
  const content = pages[page] || pages.privacy;
  useEffect(() => {
    document.title = content.title + " | Typace";
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute("content", content.subtitle);
  }, [content]);
  return (
    <div className="legal-shell">
      <header className="legal-header">
        <a className="legal-brand" href="/"><img src="/icon.png" alt="" width="34" height="34" /><span>typace</span><i>POLICY FILE / {content.number}</i></a>
        <a className="legal-back" href="/">Back to the specimens ↗</a>
      </header>
      <main className="legal-main">
        <p className="eyebrow">THE FINE PRINT / {content.number}</p>
        <h1>{content.title}<span>.</span></h1>
        <p className="legal-subtitle">{content.subtitle}</p>
        <p className="legal-updated">LAST UPDATED <strong>11 OCTOBER 2026</strong><span>·</span> TY / LEGAL</p>
        <div className="legal-layout">
          <aside><span>ON THIS PAGE</span>{content.sections.map(([title], index) => <a key={title} href={"#section-" + index}>{String(index + 1).padStart(2, "0")} / {title}</a>)}</aside>
          <article>{content.sections.map(([title, body], index) => <section key={title} id={"section-" + index}><span className="legal-section-no">{String(index + 1).padStart(2, "0")}</span><div><h2>{title}</h2><p>{body}</p></div></section>)}
            <p className="legal-note">This page describes the current public-site implementation in plain language. It is not a certification of legal compliance. Requirements depend on where the operator and visitors are located and how the service is used.</p>
          </article>
        </div>
      </main>
      <footer className="legal-footer"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/cookies">Cookies</a><a href="/browse">Font library</a><span>TYPOGRAPHY / UTILITY / 2026</span></footer>
    </div>
  );
}
