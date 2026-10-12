import { useEffect, useState } from "react";

const STORAGE_KEY = "typace-cookie-consent-v1";
const GTM_ID = "GTM-KWB6T7ZN";

function readConsent() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (value && typeof value.analytics === "boolean") return value;
  } catch {
    // Consent UI remains usable when storage is unavailable.
  }
  return null;
}

function activateAnalytics() {
  if (document.querySelector('script[data-typace-analytics="true"]')) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtm.js?id=" + encodeURIComponent(GTM_ID);
  script.dataset.typaceAnalytics = "true";
  document.head.appendChild(script);
}

export default function CookieConsent() {
  const [consent, setConsent] = useState(readConsent);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(() => readConsent()?.analytics ?? false);

  useEffect(() => {
    const openSettings = () => {
      setAnalytics(readConsent()?.analytics ?? false);
      setSettingsOpen(true);
    };
    window.addEventListener("typace:cookie-settings", openSettings);
    return () => window.removeEventListener("typace:cookie-settings", openSettings);
  }, []);

  useEffect(() => {
    if (consent?.analytics) {
      activateAnalytics();
    } else if (window.dataLayer) {
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    }
  }, [consent]);

  function save(value) {
    const next = { necessary: true, analytics: value, updatedAt: new Date().toISOString() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Current-session choice still applies. */ }
    setConsent(next);
    setAnalytics(value);
    setSettingsOpen(false);
  }

  return (
    <>
      {(!consent || settingsOpen) && (
        <div className="cookie-scrim" aria-hidden="true" />
      )}
      {!consent && !settingsOpen && (
        <section className="cookie-banner" role="region" aria-label="Cookie consent">
          <div className="cookie-mark" aria-hidden="true">01</div>
          <div className="cookie-copy">
            <p className="cookie-kicker">YOUR PRIVACY / YOUR CALL</p>
            <h2>Cookies, with the boring bits explained.</h2>
            <p>Typace stores essential preferences for the site to work. Optional analytics are off unless you allow them. Read the <a href="/cookies">cookie policy</a> or <a href="/privacy">privacy policy</a>.</p>
          </div>
          <div className="cookie-actions">
            <button type="button" className="cookie-button cookie-quiet" onClick={() => save(false)}>Reject optional</button>
            <button type="button" className="cookie-button cookie-settings" onClick={() => setSettingsOpen(true)}>Settings</button>
            <button type="button" className="cookie-button cookie-accept" onClick={() => save(true)}>Accept analytics</button>
          </div>
        </section>
      )}
      {settingsOpen && (
        <section className="cookie-preferences" role="dialog" aria-modal="true" aria-labelledby="cookie-preferences-title">
          <div className="cookie-preferences-head">
            <p className="cookie-kicker">PRIVACY CONTROL / 01</p>
            <button type="button" className="cookie-close" onClick={() => setSettingsOpen(false)} aria-label="Close cookie settings">×</button>
          </div>
          <h2 id="cookie-preferences-title">Choose what runs.</h2>
          <p>Essential storage keeps preferences such as your colour theme and consent choice. It cannot be switched off here. Analytics is optional and loads only after you enable it.</p>
          <div className="cookie-choice"><div><strong>Essential preferences</strong><span>Theme and consent choice</span></div><span className="cookie-always">ALWAYS ON</span></div>
          <label className="cookie-choice cookie-choice-toggle"><div><strong>Analytics</strong><span>Google Tag Manager, only after consent</span></div><input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} /></label>
          <div className="cookie-actions cookie-preferences-actions">
            <button type="button" className="cookie-button cookie-quiet" onClick={() => save(false)}>Reject optional</button>
            <button type="button" className="cookie-button cookie-accept" onClick={() => save(analytics)}>Save choices</button>
          </div>
          <a className="cookie-policy-link" href="/cookies">Read the full cookie policy ↗</a>
        </section>
      )}
    </>
  );
}
