import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { headTags, renderHeaders, renderManifest, validateSettings, type ShellOptions, type WebShellSettings } from "./render.ts";

// The application's Vite configuration for the installable web shell. The application's vite.config.ts returns
// webHostConfig({ mode, root, settings: webHostSettings, colours }) (settings from ./settings.ts, colours from the theme).
// The web build writes dist/ with the page head, manifest.webmanifest, _headers and sw.js; the desktop build
// (mode "desktop" or VITE_DESKTOP=1) writes dist-desktop/ with the head only: no manifest, no service worker.

export interface WebHostOptions extends ShellOptions {
  mode: string;
  // The application's web folder (where index.html is); its parent is served too, for the components folder.
  root: string;
  settings: WebShellSettings;
}

interface EmitContext { emitFile(file: { type: "asset"; fileName: string; source: string }): string }
interface Middleware { use(handler: (request: { url?: string }, response: { setHeader(name: string, value: string): void; end(body: string): void }, next: () => void) => void): void }

export function webHostConfig(options: WebHostOptions) {
  const settings = validateSettings(options.settings, options.colours);
  const desktop = options.mode === "desktop" || process.env.VITE_DESKTOP === "1";
  const files: Record<string, { type: string; text: string }> = desktop ? {} : {
    "manifest.webmanifest": { type: "application/manifest+json", text: renderManifest(settings, options) },
    "sw.js": { type: "text/javascript", text: readFileSync(new URL("./public/sw.js", import.meta.url), "utf8") },
    "_headers": { type: "text/plain", text: renderHeaders() },
  };
  const plugin = {
    name: "web-host",
    transformIndexHtml: { order: "pre" as const, handler: (html: string) => ({ html, tags: headTags(settings, !desktop) }) },
    configureServer(server: { middlewares: Middleware }) {
      server.middlewares.use((request, response, next) => {
        const file = files[(request.url ?? "").split("?")[0].replace(/^\//, "")];
        if (!file) return next();
        response.setHeader("content-type", file.type);
        response.end(file.text);
      });
    },
    generateBundle(this: EmitContext) {
      for (const [fileName, file] of Object.entries(files)) this.emitFile({ type: "asset", fileName, source: file.text });
    },
  };
  return {
    base: "./",
    root: options.root,
    server: { fs: { allow: [dirname(options.root.replace(/\/+$/, ""))] } },
    define: {
      "import.meta.env.VITE_DESKTOP": JSON.stringify(desktop ? "1" : "0"),
      "import.meta.env.VITE_APPLICATION_ID": JSON.stringify(settings.applicationId),
    },
    publicDir: "public",
    build: { target: "es2022", outDir: desktop ? "dist-desktop" : "dist" },
    plugins: [plugin],
  };
}
