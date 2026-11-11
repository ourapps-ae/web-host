# Web host instructions

## For the agent
Select `ourapps-ae/web-host` when the recipe's targets include `web`. Connect the `theme` requirement to the theme component so colour names resolve. Pass the answers for application name, short name, colours, icon and web address as settings. Provide the 512 and 192 pixel icons in the application's `public/` folder.

- Select package `ourapps-ae/web-host` version `0.4.0`.
- Settings to configure:
  - `applicationId` (string, slug; required)
  - `applicationName` (string, label; required)
  - `shortName` (string, label; required)
  - `themeColour` (string, identifier; required)
  - `backgroundColour` (string, identifier; required)
  - `iconPath` (string, slug; optional; default `icon`)
  - `webAddress` (string, address; required)
- Connect the provided `web-shell` (ae/web-shell 1.0.0) to the consumer that needs it.
- Supply `theme` (ae/theme 1.0.0) from the component that provides it.
- No accounts or keys are needed.

## For the developer

- Theme: the `theme` port is described in `interfaces/required-theme.json` (the theme component's interface document); feed theme `colourTable` into the `colours` option of `webHostConfig`. The provided interface `interfaces/web-shell.json` is an OpenRPC 1.3.2 document.
Supply the application's own `index.html` (the body and `<script type="module" src="/src/main.ts">`), `src/main.ts`, screens and the two icon files in `public/`. Its `vite.config.ts` returns `webHostConfig({ mode, root, settings: webHostSettings, colours })` (`webHostSettings` from the installed `web/settings.ts`, which aepm renders). Then `vite build` (or `vite build --mode desktop` for the desktop wrapper). Serve `dist/` over https at the web address. Supply no accounts or keys to this component; the hosting account is configured where the files are published. To check installability open the deployed address in Chrome (Application panel, Manifest) or Safari (Share, Add to Home Screen).

## How to check
From the component directory:

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5.0)
- `python3.12 -B /Users/george/Projects/com/my/tools/check_component.py components/web-host` validates the manifest, sidecars and runs the required-local suite.
