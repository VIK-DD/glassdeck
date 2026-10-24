# Deck — Architecture

A Stream Deck / MX Keypad-style launcher in the look of Apple CarPlay. An old Android phone (Chrome) shows
a CarPlay home screen of app buttons; tapping one opens that app on the Windows PC. The PC runs an
Electron app that holds the button list, serves the phone page on the local network and launches apps.

## Using it

```
npm install
npm run desktop        # build everything and start the Deck app on the PC
```

1. In the Deck window, click **Add apps** and pick programs (.exe), Start-menu shortcuts (.lnk) or
   Steam games (.url). The picker opens in the Start menu folder.
2. On the phone (same Wi-Fi), open Chrome at the address shown in the Deck window, e.g. `http://192.168.1.23:4455`.
3. Enter the 6-digit PIN shown on the PC. The phone stays paired (cookie) until you press **Reset pairing**.
4. Tap the full-screen button in the phone's sidebar to hide Chrome's address bar.

Practical notes:
- The first start asks Windows Firewall for network access; allow it on private networks.
- Android can't keep the screen on for a plain web page over http. Set a long screen timeout, or turn on
  "Stay awake while charging" in Developer options.

Development:

```
npm run dev            # Vite: phone page at http://<pc-ip>:5173/phone.html, config page at /config.html
npm run desktop:dev    # Electron using the Vite dev server (run `npm run dev` first)
npm test               # core, server, store and PIN tests
npm run typecheck
```

## Structure

```
electron/                 PC host (Node / Electron), compiled to dist-electron/ by tsconfig.electron.json
  main.ts                 Lifecycle, config window, IPC handlers (all arguments validated).
  preload.ts              Exposes the DeckApi to the config window (sandboxed, contextIsolation on).
  deckServer.ts           LAN HTTP server: phone page, pairing, button stream (SSE), launch by id.
  deckStore.ts            Buttons + pairing token in %APPDATA%/<app>/deck.json (atomic writes, corrupt-file backup).
  pinGuard.ts             One-time 6-digit PIN, rotates after use and after 5 wrong guesses.
  appInfo.ts              Reads an app's name and icon (resolves .lnk targets), opens targets via the shell.
src/
  core/                   Shared, platform-free TypeScript (no React, DOM, Node or Electron — enforced by a test).
    deck.ts               Button model, validation of stored and received data, pagination, reordering.
    deckApi.ts            Contract between the Electron host and the config window.
    deckClientState.ts    Phone state reducer: connection, buttons, pairing, launch feedback, recents.
    store/createStore.ts  Observable store used by the phone.
  phone/                  Phone web app (served by deckServer).
    deckClient.ts         fetch + EventSource transport feeding the reducer; reconnects automatically.
    PairingScreen.tsx     PIN entry with an on-screen keypad.
    DeckScreen.tsx        CarPlay home screen: sidebar (clock, connection, recents, full screen) + paged grid.
  config/                 PC config window (Electron renderer).
    ConfigApp.tsx         Phone panel (address, PIN, connected phones) + buttons panel.
    ButtonEditor.tsx      Rename, recolour, reorder, remove.
  ui/design-system/       Pure components + tokens, shared by both pages.
phone.html, config.html   Vite entry pages.
tests/                    core/, electron/ and the architecture test.
```

## How a tap becomes an app on the PC

1. The phone's grid calls `launch(id)`; the reducer marks the button `launching` (icon pulses) and adds it to recents.
2. `POST /api/launch/<id>` with the pairing cookie and the `X-Deck-Client` header.
3. The server looks the id up in the stored config and opens that button's target with `shell.openPath`.
4. 204 → green check badge; error → red badge and a shake. The badge clears after 1.5 s.

Button changes on the PC are pushed to every phone over `GET /api/events` (Server-Sent Events), so the
phone updates instantly. If the stream drops, the phone shows "Reconnecting…", re-checks its session every
3 s and returns to the PIN screen if the pairing was reset.

## Security model

The phone can make the PC open programs, so the server is the trust boundary:

- **Launch by id only.** The phone never sends paths or commands; it can open only what you added. Targets are never sent to the phone.
- **Pairing.** A one-time 6-digit PIN (rotates after use, and after 5 wrong guesses) exchanges for a 256-bit
  token stored in an `HttpOnly; SameSite=Strict` cookie. Token comparisons are constant-time. **Reset pairing** issues a new token and drops all connections.
- **Cross-site requests.** POSTs need the `X-Deck-Client` header (which forces a CORS preflight the server never allows)
  and a matching `Origin` when present. Bodies are capped at 1 KB.
- **Static files.** Only files inside the built web folder, with known types, are served. The config page is not served on the network. The phone page gets a strict Content-Security-Policy.
- **Data from the network or disk is validated** (`parseDeckConfig`, `parsePublicButtons`): ids, titles, tints, and icons (PNG data URLs only).
- **Electron.** Sandboxed renderer, context isolation, no Node in the page, navigation and popups blocked, IPC only from the config window with validated arguments.

Plain http on the LAN is not encrypted; someone on the same Wi-Fi could observe traffic. Use it on a trusted home network.

## Design system (CarPlay look)

Tokens (`tokens.css`) use the iOS system palette in Day and Night modes, the iOS type scale
(13 / 15 / 17 / 22 / 34), Inter as a stand-in for SF Pro, 22.5 % icon corners and touch targets of 56 / 72 / 96 px.
The phone is always in Night appearance; the config window follows the Windows light/dark setting.

Components (`src/ui/design-system/`), each a pure props-in / callbacks-out component that maps to one Figma component:

- **AppIcon** — rounded square with a gradient tint (blue, green, red, orange, purple, gray, graphite) and the app's own Windows icon on top; falls back to the first letter. Sizes sm 56 / md 72 / lg 88.
- **AppTile** — AppIcon + label; launch states (pulse, success badge, failure badge + shake), selection ring, disabled.
- **Dock / DockItem** — CarPlay sidebar: status header, icon-only items, footer button.
- **PinPad** — iOS passcode keypad (72 px keys) so the system keyboard never covers the landscape screen.
- **NavigationBar**, **Card**, **Button**, **IconButton**, **Icon** — iOS-style chrome for the config window.
