Typace

<p align="center">
  <img src="./icon.png" width="96" height="96" alt="Typace">
</p><p align="center">
  <strong>Typography, beautifully organized.</strong>
</p><p align="center">
  A quiet, minimal font library for collecting, browsing, previewing, and downloading typefaces.
</p>---

Philosophy

Less interface.
More typography.

No frameworks.
No build tools.
No accounts.
No tracking.

Just a lightweight interface for your type collection.

---

Your Library

Typace loads font data and font files through an API, keeping the client lightweight and the library easy to update.

Font metadata is provided by the API, including information such as:

- Font name
- File URL
- Format
- Available variants
- Other font metadata

The interface uses this data to dynamically load, preview, browse, and download typefaces.

Supported formats include:

- WOFF2
- WOFF
- TTF
- OTF

No font collection needs to be bundled with the frontend.

---

Features

- API-powered font library
- Search and browsing
- Live typography previews
- Font metadata
- Multiple font formats
- Downloadable font files
- Light and dark themes
- Responsive interface
- Offline-friendly client architecture
- No framework
- No build step

---

Architecture

Typace keeps the client deliberately small:

HTML
 ↓
CSS
 ↓
JavaScript
 ↓
Font API
 ↓
Font files

The frontend handles the interface and typography previews while the API provides the font library and associated assets.

No database or backend is required by the Typace client itself.

No dependency pile pretending to be architecture.

---

CDN

Font files can be served through a CDN, including jsDelivr when the underlying assets are hosted on GitHub.

This keeps the application lightweight while allowing font files to be delivered separately from the frontend.

---

Font Licensing

Typace does not determine the license of fonts available through the library.

Each typeface remains subject to its own license and redistribution terms. Make sure you have the appropriate rights before distributing or serving a font through the API.

---

License

The Typace source code is available under the license specified by the project repository.

Font licenses are separate and remain the responsibility of their respective authors or foundries.

---

<p align="center">
  <img src="./icon.png" width="32" height="32" alt="Typace">
</p><p align="center">
  <sub>Typography deserves a quiet place.</sub>
</p>