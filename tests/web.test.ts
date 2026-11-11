import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import { headTags, renderHeaders, renderManifest, validateSettings, resolveColour, SettingsError } from "../implementation/web/render.ts";
import { webHostConfig } from "../implementation/web/vite.ts";
import { bannerKind, bannerMarkup, startInstallBanner, DISMISS_MILLISECONDS } from "../implementation/web/install-banner.ts";
import { startShell } from "../implementation/web/runtime.ts";
import { shellConfig } from "../examples/consumer.ts";

const fixture = JSON.parse(readFileSync(new URL("fixtures/settings.json", import.meta.url), "utf8"));
const agents = JSON.parse(readFileSync(new URL("fixtures/agents.json", import.meta.url), "utf8"));
const { settings, colours } = fixture;
const now = 1_800_000_000_000;
const fresh = (agent: string, extra = {}) => ({ ...agents[agent], installed: false, now, dismissedAt: 0, ...extra });

const resolved = validateSettings(settings, colours);
const shell = (mode = "production") => webHostConfig({ mode, root: "/application/web", settings, colours, description: "Cards with friends" });
const emitted = (config: ReturnType<typeof shell>) => {
  const files: Record<string, string> = {};
  (config.plugins[0].generateBundle as (this: unknown) => void).call({ emitFile: (file: { fileName: string; source: string }) => { files[file.fileName] = file.source; return file.fileName; } });
  return files;
};

test("manifest carries the settings and parses as JSON", () => {
  const manifest = JSON.parse(renderManifest(resolved));
  assert.equal(manifest.name, "OurPoker");
  assert.equal(manifest.short_name, "OurPoker");
  assert.equal(manifest.theme_color, "#120a10");
  assert.equal(manifest.background_color, "#120a10");
  assert.equal(manifest.id, "https://ourpoker.example.com/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.deepEqual(manifest.icons.map((icon: { src: string }) => icon.src), ["icon-192.png", "icon.png"]);
});

test("the page head names the application, colour and icons, and links the manifest only where installable", () => {
  const tags = headTags(resolved);
  assert.deepEqual(tags[0], { tag: "meta", attrs: { charset: "UTF-8" }, injectTo: "head-prepend" });
  assert.ok(tags.some((tag) => tag.tag === "meta" && tag.attrs?.name === "theme-color" && tag.attrs.content === "#120a10"));
  assert.ok(tags.some((tag) => tag.tag === "title" && tag.children === "OurPoker"));
  assert.ok(tags.some((tag) => tag.tag === "link" && tag.attrs?.rel === "apple-touch-icon" && tag.attrs.href === "icon.png"));
  assert.ok(tags.some((tag) => tag.attrs?.rel === "manifest"));
  assert.ok(!headTags(resolved, false).some((tag) => tag.attrs?.rel === "manifest"));
});

test("the Vite configuration injects the head and emits the manifest, service worker and headers", () => {
  const config = shell();
  assert.equal(config.base, "./");
  assert.equal(config.build.outDir, "dist");
  assert.deepEqual(config.server.fs.allow, ["/application"]);
  assert.equal(config.define["import.meta.env.VITE_APPLICATION_ID"], JSON.stringify("ourpoker"));
  assert.equal(config.define["import.meta.env.VITE_DESKTOP"], JSON.stringify("0"));
  const page = config.plugins[0].transformIndexHtml.handler("<html><head></head><body></body></html>");
  assert.deepEqual(page.tags, headTags(resolved));
  const files = emitted(config);
  assert.deepEqual(Object.keys(files).sort(), ["_headers", "manifest.webmanifest", "sw.js"]);
  assert.equal(JSON.parse(files["manifest.webmanifest"]).description, "Cards with friends");
  assert.equal(files["sw.js"], readFileSync(new URL("../implementation/web/public/sw.js", import.meta.url), "utf8"));
  assert.equal(files["_headers"], renderHeaders());
});

test("the desktop build has the head without the manifest and emits no installable files", () => {
  const config = shell("desktop");
  assert.equal(config.build.outDir, "dist-desktop");
  assert.equal(config.define["import.meta.env.VITE_DESKTOP"], JSON.stringify("1"));
  assert.ok(!config.plugins[0].transformIndexHtml.handler("").tags.some((tag) => tag.attrs?.rel === "manifest"));
  assert.deepEqual(emitted(config), {});
});

test("the development server answers the manifest and service worker", () => {
  let handler: ((request: { url?: string }, response: { setHeader(n: string, v: string): void; end(b: string): void }, next: () => void) => void) | null = null;
  shell().plugins[0].configureServer({ middlewares: { use: (fn) => { handler = fn; } } });
  const answer = (url: string) => {
    const result = { type: "", body: "", next: false };
    handler!({ url }, { setHeader: (_name, value) => { result.type = value; }, end: (body) => { result.body = body; } }, () => { result.next = true; });
    return result;
  };
  assert.equal(answer("/manifest.webmanifest?v=1").type, "application/manifest+json");
  assert.match(answer("/sw.js").body, /skipWaiting/);
  assert.equal(answer("/src/main.ts").next, true);
});

test("headers keep the application out of search results", () => {
  assert.equal(renderHeaders(), "/*\n  X-Robots-Tag: noindex\n");
});

test("settings.ts is rendered by aepm at install from every setting, each in a quoted string", { skip: !existsSync(new URL("../component.json", import.meta.url)) && "component.json is not in this copy" }, () => {
  const manifest = JSON.parse(readFileSync(new URL("../component.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.artefacts.find((item: { source: string }) => item.source === "implementation/web/settings.ts"),
    { source: "implementation/web/settings.ts", destination: "components/web-host/web/settings.ts", template: true, executable: false });
  const text = readFileSync(new URL("../implementation/web/settings.ts", import.meta.url), "utf8");
  const tokens = [...text.matchAll(/"\{\{([A-Za-z]+)\}\}"/g)].map((match) => match[1]);
  assert.deepEqual(tokens, manifest.collect.map((item: { id: string }) => item.id));
  assert.equal([...text.matchAll(/\{\{/g)].length, tokens.length);
});

test("invalid settings are refused", () => {
  const bad = (change: Record<string, string>) => assert.throws(() => validateSettings({ ...settings, ...change }, colours), SettingsError);
  bad({ applicationName: "<script>" });
  bad({ applicationId: "Has Space" });
  bad({ shortName: "A very long short name" });
  bad({ iconPath: "../icon" });
  bad({ webAddress: "ftp://example.com" });
  bad({ themeColour: "unknownColour" });
  bad({ backgroundColour: "#12" });
});

test("colours are #rrggbb or a theme colour name", () => {
  assert.equal(resolveColour("c", "#ABCDEF"), "#abcdef");
  assert.equal(resolveColour("c", "midnight", colours), "#120a10");
  assert.throws(() => resolveColour("c", "midnight"), SettingsError);
  assert.throws(() => resolveColour("c", "constructor", {}), SettingsError);
});

test("service worker takes control at once and does not cache", () => {
  const listeners: Record<string, (event: { waitUntil(value: unknown): void }) => void> = {};
  const calls: string[] = [];
  const self = {
    addEventListener: (type: string, listener: (event: { waitUntil(value: unknown): void }) => void) => { listeners[type] = listener; },
    skipWaiting: () => { calls.push("skipWaiting"); return "skipped"; },
    clients: { claim: () => { calls.push("claim"); return "claimed"; } },
  };
  vm.runInNewContext(readFileSync(new URL("../implementation/web/public/sw.js", import.meta.url), "utf8"), { self });
  assert.deepEqual(Object.keys(listeners).sort(), ["activate", "fetch", "install"]);
  listeners.install({ waitUntil() {} });
  let waited: unknown;
  listeners.activate({ waitUntil: (value) => { waited = value; } });
  assert.deepEqual(calls, ["skipWaiting", "claim"]);
  assert.equal(waited, "claimed");
  assert.equal(listeners.fetch({ waitUntil() {} }), undefined);
});

test("banner kind follows the browser and the dismissal window", () => {
  assert.equal(bannerKind(fresh("iphoneSafari"), false), "safari");
  assert.equal(bannerKind(fresh("ipadDesktopMode"), false), "safari");
  assert.equal(bannerKind(fresh("iphoneInApp"), false), "in-app");
  assert.equal(bannerKind(fresh("iphoneChrome"), false), "none");
  assert.equal(bannerKind(fresh("androidChrome"), false), "android");
  assert.equal(bannerKind(fresh("androidChrome"), true), "install");
  assert.equal(bannerKind(fresh("desktopChrome"), false), "none");
  assert.equal(bannerKind(fresh("desktopChrome"), true), "install");
  assert.equal(bannerKind(fresh("androidChrome", { installed: true }), true), "none");
  assert.equal(bannerKind(fresh("androidChrome", { dismissedAt: now - DISMISS_MILLISECONDS + 1 }), true), "none");
  assert.equal(bannerKind(fresh("androidChrome", { dismissedAt: now - DISMISS_MILLISECONDS }), true), "install");
});

test("banner markup escapes the application name", () => {
  assert.match(bannerMarkup("android", "A<b>&"), /Add A&lt;b>&amp; to your home screen/);
});

interface FakeNode { attributes: Record<string, string>; innerHTML: string; parentNode: FakeBody | null; listeners: Record<string, (event: unknown) => void> }
interface FakeBody { children: FakeNode[]; appendChild(node: FakeNode): void; removeChild(node: FakeNode): void }

function fakeBrowser(agent: string, options: { standalone?: boolean; dismissedAt?: number } = {}) {
  const storage: Record<string, string> = options.dismissedAt ? { "install-banner-dismissed": String(options.dismissedAt) } : {};
  const windowListeners: Record<string, (event: any) => void> = {};
  const body: FakeBody = {
    children: [],
    appendChild(node) { node.parentNode = body; body.children.push(node); },
    removeChild(node) { body.children = body.children.filter((child) => child !== node); node.parentNode = null; },
  };
  const host = {
    matchMedia: () => ({ matches: options.standalone === true }),
    navigator: { userAgent: agents[agent].userAgent, platform: agents[agent].platform, maxTouchPoints: agents[agent].maxTouchPoints },
    localStorage: { getItem: (key: string) => storage[key] ?? null, setItem: (key: string, value: string) => { storage[key] = value; } },
    document: {
      readyState: "complete", body, title: "Fallback title",
      querySelector: (selector: string) => selector.includes("application-name") ? { content: "OurPoker" } : null,
      createElement: () => {
        const node: FakeNode & Record<string, unknown> = {
          attributes: {}, innerHTML: "", parentNode: null, listeners: {},
          setAttribute(name: string, value: string) { node.attributes[name] = value; },
          attachShadow() { return { get innerHTML() { return node.innerHTML; }, set innerHTML(value: string) { node.innerHTML = value; }, addEventListener(type: string, listener: (event: unknown) => void) { node.listeners[type] = listener; } }; },
        };
        return node;
      },
      addEventListener() {},
    },
    addEventListener: (type: string, listener: (event: any) => void) => { windowListeners[type] = listener; },
    now: () => now,
  };
  return { host: host as any, storage, windowListeners, body };
}

test("banner shows for Safari, dismisses for three days, and stays away when installed", () => {
  const safari = fakeBrowser("iphoneSafari");
  startInstallBanner(safari.host);
  assert.equal(safari.body.children.length, 1);
  assert.match(safari.body.children[0].innerHTML, /Add OurPoker to your home screen/);
  safari.body.children[0].listeners.click({ target: { getAttribute: () => "close" } });
  assert.equal(safari.body.children.length, 0);
  assert.equal(safari.storage["install-banner-dismissed"], String(now));
  const again = fakeBrowser("iphoneSafari", { dismissedAt: now - 1000 });
  startInstallBanner(again.host);
  assert.equal(again.body.children.length, 0);
  const installed = fakeBrowser("iphoneSafari", { standalone: true });
  startInstallBanner(installed.host);
  assert.equal(installed.body.children.length, 0);
  const desktop = fakeBrowser("desktopChrome");
  startInstallBanner(desktop.host);
  assert.equal(desktop.body.children.length, 0);
});

test("install prompt is deferred until the Add button is pressed", async () => {
  const browser = fakeBrowser("desktopChrome");
  startInstallBanner(browser.host);
  let prompted = 0;
  let prevented = 0;
  const choice = Promise.resolve({ outcome: "accepted" });
  browser.windowListeners.beforeinstallprompt({ preventDefault: () => { prevented++; }, prompt: () => { prompted++; }, userChoice: choice });
  assert.equal(prevented, 1);
  assert.equal(browser.body.children.length, 1);
  assert.match(browser.body.children[0].innerHTML, /data-act="install"/);
  browser.body.children[0].listeners.click({ target: { getAttribute: () => "install" } });
  assert.equal(prompted, 1);
  await choice;
  await Promise.resolve();
  assert.equal(browser.body.children.length, 0);
  browser.windowListeners.appinstalled({});
  assert.equal(browser.storage["install-banner-dismissed"], String(now));
});

test("shell start registers the service worker, and the desktop wrapper does neither", async () => {
  const registered: string[] = [];
  const browser = fakeBrowser("androidChrome");
  (browser.host.navigator as any).serviceWorker = { register: async (url: string) => { registered.push(url); } };
  const handle = startShell(browser.host);
  assert.equal(await handle.serviceWorker, true);
  assert.deepEqual(registered, ["./sw.js"]);
  assert.equal(browser.body.children.length, 1);
  const failing = fakeBrowser("androidChrome");
  (failing.host.navigator as any).serviceWorker = { register: async () => { throw new Error("blocked"); } };
  assert.equal(await startShell(failing.host).serviceWorker, false);
  const desktop = fakeBrowser("androidChrome");
  (desktop.host.navigator as any).serviceWorker = { register: async (url: string) => { registered.push(url); } };
  assert.equal(await startShell(desktop.host, { desktop: true }).serviceWorker, false);
  assert.equal(desktop.body.children.length, 0);
  assert.equal(registered.length, 1);
  assert.equal(await startShell(fakeBrowser("androidChrome").host).serviceWorker, false);
});

test("consumer builds the shell configuration with the theme's colours", () => {
  const config = shellConfig(settings, colours);
  assert.equal(config.build.outDir, "dist");
  assert.deepEqual(Object.keys(emitted(config)).sort(), ["_headers", "manifest.webmanifest", "sw.js"]);
});
