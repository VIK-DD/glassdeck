# Glassdeck — Architecture

A touch control center for a Windows PC, shown on an old Android phone in iOS 26's Liquid Glass style.
The phone runs a web page in Chrome; the PC runs an Electron app that serves that page on the local
network, holds the configuration and talks to Windows, OBS and the GPU driver.

## Using it

```
npm install
npm run desktop        # build everything (web, Electron host, Windows helper) and start Glassdeck
```

Building needs Node.js 20+ and the .NET 10 SDK. See the README for pairing a phone and enabling OBS.

Development:

```
npm run dev            # Vite: phone page at http://<pc-ip>:5173/phone.html, config page at /config.html
npm run desktop:dev    # Electron using the Vite dev server (run `npm run dev` first)
npm run helper:build   # dotnet publish helper/ → dist-helper/glassdeck-helper.exe
npm test               # Vitest
npm run typecheck
```

## Structure

```
electron/                   PC host (Node / Electron), compiled to dist-electron/ by tsconfig.electron.json
  main.ts                   Lifecycle, wiring of integrations to the server, config window, validated IPC,
                            one-time migration of the pre-rename config (%APPDATA%/carplay-windows).
  preload.ts                Exposes the DeckApi to the config window (sandboxed, contextIsolation on).
  deckServer.ts             LAN server on port 4460: phone page, pairing, SSE stream, validated commands.
  deckStore.ts              Buttons + pairing token in %APPDATA%/glassdeck/deck.json (atomic writes, corrupt-file backup).
  pinGuard.ts               One-time 6-digit PIN, rotates after use and after 5 wrong guesses.
  appInfo.ts                App names and icons (resolves .lnk targets); opens targets via the shell.
  pc/winHelper.ts           Runs the C# helper, parses its JSON-lines events, restarts it if it exits.
  pc/systemMonitor.ts       CPU (os.cpus deltas), memory, GPU via `nvidia-smi -lms 1000`.
  pc/obsClient.ts           obs-websocket v5 client: auth, replay buffer / record / stream state, clips.
helper/                     glassdeck-helper (C#, .NET 10, Windows only)
  Program.cs                stdio loop: polls audio (300 ms) and media (1 s), emits only changes, runs commands.
  MediaController.cs        Global System Media Transport Controls: now playing, cover, play/pause/skip.
  AudioController.cs        Core Audio: endpoint volume/mute, per-app sessions, default output (IPolicyConfig).
  CoreAudio.cs              COM interop definitions (IIDs cross-checked against NAudio and EarTrumpet).
src/
  core/                     Shared, platform-free TypeScript (no React, DOM, Node or Electron — enforced by a test).
    deck.ts                 Button model, validation, pagination, reordering.
    pc.ts                   Media / audio / system / OBS models, their validators, playback-position extrapolation.
    deckApi.ts              Contract between the Electron host and the config window.
    deckClientState.ts      Phone state reducer: connection, pairing, launch feedback, PC state, chart history.
    store/createStore.ts    Observable store used by the phone.
  phone/                    Phone web app (served by deckServer).
    deckClient.ts           fetch + EventSource transport; throttles volume drags to one request per 80 ms.
    PhoneApp.tsx            Ambient backdrop, glass rail navigation, page switching.
    pages/NowPage.tsx       Now playing, mic toggle, clip toggle, CPU/GPU glance.
    pages/MixerPage.tsx     Output picker and a vertical slider per sound source.
    pages/SystemPage.tsx    Load rings, one-minute charts, memory meters.
    pages/AppsPage.tsx      Paged grid of app buttons.
    PairingScreen.tsx       PIN entry with a glass keypad.
  config/                   PC config window (Electron renderer): phone panel, integrations, app editor.
  ui/design-system/         Liquid Glass components + tokens, shared by both pages.
tests/                      core/, electron/ and the architecture test.
```

## Data flow

**PC → phone.** Each source pushes into the host, which broadcasts a Server-Sent Event to every paired phone:

| Event     | Source                                  | When                               |
|-----------|-----------------------------------------|------------------------------------|
| `buttons` | deckStore                               | buttons added, edited, reordered   |
| `media`   | helper (media session)                  | track, play state or position jump |
| `audio`   | helper (Core Audio) + host icon lookup  | any volume, mute, app or device change |
| `system`  | systemMonitor                           | every second                       |
| `obs`     | obsClient                               | connection or output state change  |

A phone that connects gets the current value of every event first. Media positions are extrapolated:
the helper stamps each sample with the PC time, the host advances it when sending, and the phone
advances it from the moment it arrived, so the progress bar moves without a stream of updates.

**Phone → PC.** Every command is a POST with the pairing cookie and the `X-Deck-Client` header:

| Endpoint                       | Body                          | Effect                           |
|--------------------------------|-------------------------------|----------------------------------|
| `/api/launch/<buttonId>`       | –                             | open a configured app            |
| `/api/media/<toggle\|next\|previous>` | –                      | media keys for the current player |
| `/api/audio/volume`            | `{ target, volume }`          | set a volume (0–1)               |
| `/api/audio/mute`              | `{ target, muted }`           | mute / unmute                    |
| `/api/audio/output`            | `{ deviceId }`                | make an output the default       |
| `/api/obs/clip`                | –                             | save the replay buffer, or arm it |

`target` is `master`, `mic`, `system` or `pid:<n>`. Responses: 204 done, 400 invalid, 401 not paired,
404 unknown, 409 not possible right now (e.g. helper not running).

The helper polls instead of registering COM callbacks: simpler threading, and it only emits when the
serialised state actually changed. After any command it re-polls immediately so the phone sees the
effect within a frame or two.

## Security model

The phone can change things on the PC, so the server is the trust boundary:

- **Fixed vocabulary.** The phone sends ids and numbers, never paths or commands. Button targets, executable
  paths and device ids from Windows never need to be trusted from the network: targets stay on the PC,
  app ids are validated against `pid:<n>`, output ids must match a device the helper reported.
- **Pairing.** A one-time 6-digit PIN (rotates after use and after 5 wrong guesses) exchanges for a 256-bit
  token in an `HttpOnly; SameSite=Strict` cookie. Token comparisons are constant-time. **Reset pairing**
  issues a new token and drops all connections.
- **Cross-site requests.** POSTs need the `X-Deck-Client` header (which forces a CORS preflight the server
  never allows) and a matching `Origin` when present. Bodies are capped at 1 KB.
- **Static files.** Only files inside the built web folder, with known types, are served. The config page is
  not served on the network. The phone page gets a strict Content-Security-Policy.
- **Validation both ways.** The host validates everything from the phone and from the helper; the phone
  validates everything it receives (`parseMediaInfo`, `parseAudioInfo`, … — covers must be PNG/JPEG data URLs).
- **OBS credentials** are read from OBS's own config on the PC and never leave it.
- **Electron.** Sandboxed renderer, context isolation, no Node in the page, navigation and popups blocked,
  IPC only from the config window with validated arguments.

Plain http on the LAN is not encrypted; use it on a trusted home network.

## Design system (Liquid Glass)

`Glass.module.css` defines the material every surface composes: a saturated backdrop blur, a bright
specular edge on top, a soft inner stroke and a diagonal sheen, with an opaque fallback for browsers
without `backdrop-filter`. Behind it, `Ambient` paints the wallpaper, tinted by the current album art.

Tokens (`tokens.css`): iOS system colours in Day and Night, glass fills and strokes per mode, the iOS type
scale (13 / 15 / 17 / 22 / 34), radii 12–32 px, touch targets of 52 / 68 / 88 px, spring easing.
The phone is always Night; the config window follows the Windows light/dark setting.

Components (each pure props-in / callbacks-out, one Figma component each):

- **GlassPanel** — the material as a container.
- **Rail / RailItem** — floating glass navigation rail; the active page gets its own drop of glass.
- **GlassToggle** — Control Center–style square button; tinted glass for on / attention states.
- **VolumeSlider** — tall glass capsule filled from the bottom; shows the finger's value while dragging.
- **RingGauge**, **Sparkline** — load rings and one-minute charts.
- **AppIcon / AppTile** — app icons with gradient tints and launch feedback.
- **PinPad**, **Card**, **Button / IconButton**, **NavigationBar**, **Icon**, **Ambient**.
