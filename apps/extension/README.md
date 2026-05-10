# SwipeHire Extension

Chrome / Firefox extension that auto-fills job applications on any ATS using your SwipeHire profile + tailored resume.

## Why this exists

Server-side auto-apply (Greenhouse / Lever / Ashby) covers ~30% of jobs cleanly. Workday / iCIMS / SmartRecruiters need browser-side help (their forms break server-side automation). Custom career pages need universal field detection. The extension covers all three — running in your own browser, on your own IP, with you in control of every submission.

**Hard rule:** the extension never clicks Submit for you. It fills, you review, you submit.

## Architecture

```
┌─────────────────────────┐         ┌─────────────────────────┐
│  Career page            │         │  Background service     │
│  (Greenhouse, Workday,  │◀───────▶│  worker                 │
│   custom, etc.)         │         │                         │
│                         │         │  - holds session token  │
│  Content script:        │  msg    │  - syncs profile        │
│  - detects ATS          │ ───────▶│  - fetches resume       │
│  - finds form fields    │         │  - reports outcomes     │
│  - shows overlay        │  msg    │                         │
│  - fills on confirm     │ ◀────── │                         │
└─────────────────────────┘         └────────────┬────────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────┐
                                    │  api.swipehire.io      │
                                    │                        │
                                    │  /api/extension/*      │
                                    └────────────────────────┘
```

All field-mapping logic lives in `packages/applier-core` and is shared with the server-side Playwright adapters. Selectors are written once.

## Development

```bash
cd apps/extension
pnpm install
pnpm dev          # vite dev server, hot reload
```

Then load the unpacked extension in Chrome:
1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select `apps/extension/dist/`

The extension will auto-reload on file change (vite + crxjs).

## Build for distribution

```bash
pnpm build               # → apps/extension/dist/
pnpm package             # → apps/extension/swipehire-extension.zip
```

Submit the zip to:
- Chrome Web Store: https://chrome.google.com/webstore/devconsole
- Firefox Add-ons: https://addons.mozilla.org/developers/

## File map

```
apps/extension/
├── manifest.json                Manifest v3 — host_permissions, content scripts, perms
├── vite.config.ts               crxjs/vite-plugin config
├── src/
│   ├── background/
│   │   └── index.ts             Service worker — session, profile sync, outcome reports
│   ├── content/
│   │   ├── index.ts             Content script — ATS detection + form fill
│   │   ├── overlay.ts           Confirmation overlay (always shown before fill)
│   │   └── overlay.css          Scoped styles (#swipehire-overlay)
│   └── popup/
│       ├── index.html
│       ├── popup.ts             Sign-in / status UI
│       └── popup.css
└── icons/                       Extension icons (16, 32, 48, 128 px)
```

## How it works on a real page

1. Page loads. Content script runs at `document_idle`.
2. Detects ATS from URL + DOM markers.
3. Finds form fields using the matched `AtsSpec` from `@swipehire/applier-core`.
4. For each field, resolves a value from the cached SwipeHire profile.
5. Renders the overlay: "We can fill 8 fields. 2 still need your input. [Fill] [Cancel]"
6. User clicks Fill. Content script fills inputs (using React-friendly setters that dispatch input/change events).
7. User reviews the form. User clicks the form's **own** Submit button.
8. Content script detects submission, waits for the success selector, reports outcome to the API.
9. The outcome eventually feeds the calibrator — the same one trained from server-side auto-applies.

## Privacy & safety

- The extension only activates on pages matching the `content_scripts.matches` patterns in `manifest.json` (career pages + ATS subdomains).
- Profile data is cached in `chrome.storage.local` (not synced; never leaves your device except to call the SwipeHire API over HTTPS).
- The session token is per-device. Sign out clears everything.
- We never inject scripts into pages outside the manifest's `host_permissions` allowlist.
- We never click Submit for you. You always have the final tap.

## Outcome loop (the strategic moat)

When the extension reports a successful submission, the SwipeHire backend logs it to `audit.score_decisions` and `ml.score_outcomes`. When the user later marks the application as "interview" or "offer," the calibration model retrains. The next user gets a more accurate match score.

The extension isn't just a convenience layer — it's how SwipeHire learns from real-world outcomes at scale.
