// Consent-respecting event tracking. Pushes to the GTM dataLayer only when the
// visitor has explicitly allowed analytics, so nothing fires before consent.
const CONSENT_KEY = "typace-cookie-consent-v1";

function analyticsAllowed() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return false;
    return JSON.parse(raw)?.analytics === true;
  } catch {
    return false;
  }
}

export function track(event, params = {}) {
  if (typeof window === "undefined" || !analyticsAllowed()) return;

  // A plain dataLayer event only triggers GTM custom-event rules; it does not
  // automatically send a GA4 event. Use the consent-gated Google tag command.
  if (typeof window.gtag === "function") {
    window.gtag("event", event, params);
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}
