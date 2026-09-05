Typace

> Typography, beautifully organized.



A quiet, minimal font library for collecting, browsing, previewing, and downloading typefaces.

Built around a simple idea: your fonts, your library, no unnecessary machinery.


---

Philosophy

Less interface.
More typography.

-No frameworks.
-No build tools.
-No accounts.
-No tracking.

Just a lightweight interface for your type collection.


---

Structure

Typace/
├── index.html
├── fonts.json
└── fonts/
    ├── Font-One.woff2
    ├── Font-Two.ttf
    └── Font-Three.otf


---

Your Library

Typace doesn't ship with a bundled font collection.

Add your own font files to /fonts and see them on the site!


Supported formats include:

-WOFF2

-TTF

-OTF

---

Features

-Local font collection

-Search and browsing

-Live typography previews

-Font metadata

-Multiple font formats

-Downloadable font files

-Light and dark themes

-Responsive interface

-Offline-friendly architecture

-No framework or build step



---

Architecture

Typace keeps the stack deliberately small:

HTML → CSS → JavaScript → api/fonts

-No database.
-No backend required for the basic library.
-No dependency pile pretending to be architecture.


---

CDN

For deployments where fonts are hosted through GitHub, Typace can also load font files through jsDelivr, allowing the library to remain lightweight while serving the actual font assets from a CDN.


---

License

Typace itself is open to whatever license you choose for the project.

The fonts inside your library remain subject to their individual licenses. Make sure you have the right to redistribute any typeface you place in /fonts.


---

> Typography deserves a quiet place.