# Ark-Book (web / iPhone)

Static Home Screen web app for Ark-Book. **This repo contains the app only: no data and no tokens.**
Your data lives in the private `ark-book-data` branch of `rockyshawjr/g12-updates` and is read and written through the GitHub API with a token you type on the phone once (stored in that phone's localStorage only).

## Install on iPhone
1. Open https://rockyshawjr.github.io/ark-book-web/ in **Safari**.
2. Tap Share, then **Add to Home Screen**, then Add.
3. Open Ark-Book from the Home Screen. Tap **Phone sync token** (it opens on first launch), paste the same sync token the Macs use, tap **Save and sync**.

## Using it
- Tap any field for the dropdown. **Long-press** a field, match row or event for the right-click menu (swap, clear, remove, edit text).
- Sync runs on open, every 3 minutes, shortly after each edit, and with the Sync Now button. It pulls and merges before it pushes (newest edit wins per record, same code as the Mac app).
- Works offline for reading and editing; changes sync when you are back online.
- Phone limits: promo pictures and Archive posters/match cards (images, PDF) sync; intro videos and intro music are left alone (add those on a Mac); PDF/PNG export to the archive and year zips are Mac features. Print/PDF opens in a new tab.

## Develop
`./build.sh` copies `core.js`, `app.js`, `style.css`, `logo.png` from the Mac app (they are the same files). `npm test` in the Mac app project checks they match and tests merge parity.
