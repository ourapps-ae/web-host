# Web host component

## Purpose and facilities
Turns a web application into an installable one: renders the web manifest, the start page, the response headers and the build configuration from typed settings, ships a service worker that makes the page installable without caching, and starts the shell in the browser with an add-to-home-screen banner. The application supplies its own screens through the entry module and the page body.

Facilities: `web-shell` (Installable web application shell).

## User inputs
The installer collects these settings. Colours are names of colours in the theme component (the collected setting grammar cannot carry #rrggbb); the render functions also accept #rrggbb when run outside the installer. `iconPath` names the icon files in the web `public/` folder: `<iconPath>.png` is 512 pixels square and `<iconPath>-192.png` is 192 pixels square.

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
- `implementation/web/templates/_headers.template` -> `components/web-host/web/templates/_headers.template`
- `implementation/web/templates/index.html.template` -> `components/web-host/web/templates/index.html.template`
- `implementation/web/templates/manifest.webmanifest.template` -> `components/web-host/web/templates/manifest.webmanifest.template`
- `implementation/web/templates/vite.config.ts.template` -> `components/web-host/web/templates/vite.config.ts.template`

Dependencies: none.
`tools.lock.json` pins verification tools: node 26.5.0. Licence wording remains deferred.

## Provided interfaces
- `interfaces/web-shell.json` defines `web-shell` (ae/web-shell) version 1.0.0.

## Required interfaces
- `theme` (ae/theme) version 1.0.0, supplied by the recipe or application. The operations used are listed in `interfaces/required/theme.json`: theme `colourTable` (build time) for `themeColour` and `backgroundColour`.

## Integration
At build time call `renderShell(settings, {colours})` from `web/render.ts` and write the result with `writeShell` (index.html, vite.config.ts, public/manifest.webmanifest, public/_headers, public/sw.js); `colours` is the colour table of the connected theme. In the application's main module call `startShell(browserHost(), {desktop})` from `web/runtime.ts` once; it registers `./sw.js` and starts the install banner, and does neither when `desktop` is true. The application keeps its own screens, art, strings and its `src/main.ts` entry. `examples/consumer.ts` does both steps without a game.

## Visual definition and connected examples
`visual/definition.json` maps its ports to the provided and required interfaces. `visual/examples/connected.json` connects the component to an illustrative application consumer. Both image formats and a text description are in `visual/output/`.

## Infrastructure
No service is deployed by this package. The rendered files are static and need any static file host served over https at `webAddress`; the hosting account belongs to the release pipeline or the developer. Install prompts need https and a browser that supports installation.

## Verification
`node --test tests/web.test.ts` renders the shell from fixture settings and checks the manifest, page, headers and build configuration, runs `sw.js` against a fake service worker scope, and drives the install banner against fake browsers for iPhone Safari, in-app iPhone browsers, iPadOS desktop mode, Android and desktop Chrome, including dismissal and installed state. Real browser installation was not exercised.

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5.0)

## Scenarios and presentation
Safari on iPhone shows the Share instructions; Chrome on Android or desktop shows a one-tap Add button; an application already on the home screen or dismissed within three days shows nothing; the desktop wrapper skips the service worker and banner.

## Updates and removal
Patch updates replace the owned files without migrating data; the service worker never caches, so a new deployment reaches installed copies at once. Removal deletes the owned sources and the application's imports; no application data is held.
