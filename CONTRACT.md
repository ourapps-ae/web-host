# Web host component

## Purpose and facilities
Turns a web application into an installable one: gives the application's Vite build its configuration, which writes the page head, the web manifest, the response headers and a service worker that makes the page installable without caching, all from the installed settings, and starts the shell in the browser with an add-to-home-screen banner. The application supplies its own `index.html` (the page body and the entry module) and screens.

Facilities: `web-shell` (Installable web application shell).

## User inputs
The installer collects these settings and renders them into `web/settings.ts` (`webHostSettings`). Colours are names of colours in the theme component (the collected setting grammar cannot carry #rrggbb), resolved through the colour table the application passes; the functions also accept #rrggbb when run outside the installer. `iconPath` names the icon files in the web `public/` folder: `<iconPath>.png` is 512 pixels square and `<iconPath>-192.png` is 192 pixels square.

- `applicationId` (string, slug; required)
- `applicationName` (string, label; required)
- `shortName` (string, label; required)
- `themeColour` (string, identifier; required)
- `backgroundColour` (string, identifier; required)
- `iconPath` (string, slug; optional; default `icon`)
- `webAddress` (string, address; required)

## Artefacts and dependencies
`component.json` maps every `implementation/` source into `components/web-host/`:

- `implementation/web/install-banner.ts` -> `components/web-host/web/install-banner.ts`
- `implementation/web/public/sw.js` -> `components/web-host/web/public/sw.js`
- `implementation/web/render.ts` -> `components/web-host/web/render.ts`
- `implementation/web/runtime.ts` -> `components/web-host/web/runtime.ts`
- `implementation/web/settings.ts` -> `components/web-host/web/settings.ts` (template: aepm renders it from the settings)
- `implementation/web/vite.ts` -> `components/web-host/web/vite.ts`

Dependencies: none.
`tools.lock.json` pins verification tools: node 26.5. Licence wording remains deferred.

## Provided interfaces
- `interfaces/web-shell.json` defines `web-shell` (ae/web-shell) version 1.0.0 as an OpenRPC 1.3.2 document: one method per exported function (`validateSettings`, `resolveColour`, `renderManifest`, `renderHeaders`, `headTags`, `webHostConfig`, `startShell`, `browserHost`, `startInstallBanner`, `bannerKind`), its parameters and result as JSON Schema 2020-12, and `SettingsError` where a setting breaks its grammar.

## Required interfaces
- `theme` (ae/theme) version 1.0.0, supplied by the recipe or application. `interfaces/required-theme.json` is a copy of the theme component's interface document; web-host uses its `colourTable` result (build time) for `themeColour` and `backgroundColour`.

## Integration
The application's `vite.config.ts` returns `webHostConfig({ mode, root, settings: webHostSettings, colours })` from `web/vite.ts`, with `webHostSettings` from the installed `web/settings.ts` and `colours` the colour table of the connected theme; it may add its own fields (for example `resolve.alias`). The build then has the page head, and the web build `manifest.webmanifest`, `sw.js` and `_headers`; the desktop build (`--mode desktop`) has the head without the manifest link and writes `dist-desktop/`. The application's `index.html` holds the page body and `<script type="module" src="/src/main.ts">`. In the application's main module call `startShell(browserHost(), {desktop})` from `web/runtime.ts` once; it registers `./sw.js` and starts the install banner, and does neither when `desktop` is true. The application keeps its own screens, art, strings and its `src/main.ts` entry. `examples/consumer.ts` does both steps without a game.

## Visual definition and connected examples
`visual/definition.json` maps its ports to the provided and required interfaces. `visual/examples/connected.json` connects the component to an illustrative application consumer. Both image formats and a text description are in `visual/output/`.

## Infrastructure
No service is deployed by this package. The rendered files are static and need any static file host served over https at `webAddress`; the hosting account belongs to the release pipeline or the developer. Install prompts need https and a browser that supports installation.

## Verification
`node --test tests/web.test.ts` checks the manifest, the page head (with and without the manifest link), the Vite configuration (head injection, emitted files, the desktop build, the development server's answers), the headers and the `settings.ts` template against the collected settings, runs `sw.js` against a fake service worker scope, and drives the install banner against fake browsers for iPhone Safari, in-app iPhone browsers, iPadOS desktop mode, Android and desktop Chrome, including dismissal and installed state. The OurPoker recipe's `authoring/try_install.py` builds a real application with it and loads the page in headless Chrome. Real browser installation was not exercised.

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5)

## Scenarios and presentation
Safari on iPhone shows the Share instructions; Chrome on Android or desktop shows a one-tap Add button; an application already on the home screen or dismissed within three days shows nothing; the desktop wrapper skips the service worker and banner.

## Updates and removal
Patch updates replace the owned files without migrating data; the service worker never caches, so a new deployment reaches installed copies at once. Removal deletes the owned sources and the application's imports; no application data is held.
