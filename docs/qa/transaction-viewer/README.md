# Transaction viewer validation

Base: `7ccc26d`. Local, read-only tests; no inscriptions or wallet transactions were submitted.

- `npm test` on Node 24: 10 regression cases passed, including live gateway FROG data, Korean UTF-8, malformed metadata, HTML/SVG text, binary, empty and ambiguous base64-looking text.
- `npx tsc --noEmit`, changed-file ESLint, and `npm run build`: passed.
- Real FROG `frog.txt` and `deploy.json`: browser-rendered from the live gateway.
- Desktop 1280×900 and mobile 390×844 screenshots: no document overflow; ASCII retains spacing within its scrollable preview.
- Stored-data toggle and keyboard scrolling: verified.
- Chrome download: `frog.txt`, 802 bytes, exact match to decoded gateway response.
- Error/empty/raster-image states are implemented but do not yet have separate live browser fixtures in this evidence set.

The baseline lockfile fails `npm ci` with missing bufferutil, utf-8-validate and node-gyp-build entries. Local verification used `npm install --ignore-scripts --package-lock=false`; the lockfile remains unchanged.

![Desktop](frog-desktop.png)
![Mobile](frog-mobile.png)
