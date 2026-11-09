// A one-tap "add to home screen" banner. Shows only in a normal browser tab, never once the
// application runs from the home screen, and stays away for three days after it is dismissed.

export type BannerKind = "none" | "install" | "safari" | "in-app" | "android";

export interface BannerEnvironment {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  // True when the page already runs from the home screen (display-mode standalone or navigator.standalone).
  installed: boolean;
  now: number;
  dismissedAt: number;
}

export const DISMISS_MILLISECONDS = 3 * 24 * 60 * 60 * 1000;

export function bannerKind(env: BannerEnvironment, hasInstallPrompt: boolean): BannerKind {
  if (env.installed || env.now - env.dismissedAt < DISMISS_MILLISECONDS) return "none";
  const ua = env.userAgent;
  const otherIosBrowser = /CriOS|FxiOS|EdgiOS/.test(ua);
  const ios = /iPhone|iPad|iPod/.test(ua) || (env.platform === "MacIntel" && env.maxTouchPoints > 1);
  const safari = ios && /Safari\//.test(ua) && !otherIosBrowser;
  if (hasInstallPrompt) return "install";
  if (safari) return "safari";
  if (ios && !safari && !otherIosBrowser) return "in-app";
  if (/Android/.test(ua)) return "android";
  return "none";
}

export interface BannerText {
  install(name: string): string;
  safari(name: string): string;
  inApp(name: string): string;
  android(name: string): string;
  addButton: string;
  closeLabel: string;
  dialogLabel: string;
}

export function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

const SHARE_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a1 1 0 001 1h12a1 1 0 001-1v-7"/></svg>';

// Names are escaped by the caller of these functions through escapeText.
export const englishText: BannerText = {
  install: (name) => `<b>Add ${name} to your home screen</b><span>One tap, then it opens like an app and keeps its permissions.</span>`,
  safari: (name) => `<b>Add ${name} to your home screen</b><span>Tap ${SHARE_ICON} Share below, then <em>Add to Home Screen</em>, then <em>Add</em>. After that it opens like an app and remembers camera and microphone permission.</span>`,
  inApp: () => "<b>Open in Safari first</b><span>This browser cannot add apps to the home screen. Tap the menu and choose <em>Open in Safari</em>, then add it from there.</span>",
  android: (name) => `<b>Add ${name} to your home screen</b><span>Tap the browser menu (three dots), then <em>Add to Home screen</em> or <em>Install app</em>.</span>`,
  addButton: "Add",
  closeLabel: "Not now",
  dialogLabel: "Add to home screen",
};

const STYLE =
  ":host{all:initial}" +
  '.b{position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483647;display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:16px;background:#1d1d1f;color:#f5f5f7;font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.35);animation:up .35s cubic-bezier(.2,.8,.2,1)}' +
  "@keyframes up{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}" +
  ".t{flex:1;min-width:0}.t b{display:block;font-size:15px;margin-bottom:2px}.t span{color:#c7c7cc}.t em{font-style:normal;color:#fff;font-weight:600}" +
  "button{font:inherit;border:0;border-radius:999px;padding:9px 16px;cursor:pointer;background:#0a84ff;color:#fff;font-weight:600;flex:none}" +
  "button.x{background:transparent;color:#8e8e93;padding:6px 8px;font-size:20px;line-height:1}";

export function bannerMarkup(kind: Exclude<BannerKind, "none">, name: string, text: BannerText = englishText): string {
  const safe = escapeText(name);
  const body = kind === "install" ? text.install(safe) + `<button data-act="install">${text.addButton}</button>`
    : kind === "safari" ? text.safari(safe)
    : kind === "in-app" ? text.inApp(safe)
    : text.android(safe);
  return `<style>${STYLE}</style><div class="b" role="dialog" aria-label="${text.dialogLabel}"><div class="t">${body}</div><button class="x" data-act="close" aria-label="${text.closeLabel}">&times;</button></div>`;
}

// The parts of the browser the banner uses, so it can run against a fake.
export interface BannerHost {
  matchMedia(query: string): { matches: boolean };
  navigator: { userAgent: string; platform: string; maxTouchPoints: number; standalone?: boolean };
  localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  document: {
    readyState: string;
    body: { appendChild(node: unknown): unknown } | null;
    title: string;
    querySelector(selector: string): { content?: string } | null;
    createElement(tag: string): BannerElement;
    addEventListener(type: string, listener: () => void): void;
  };
  addEventListener(type: string, listener: (event: any) => void): void;
  now(): number;
}

export interface BannerElement {
  setAttribute(name: string, value: string): void;
  attachShadow?(init: { mode: string }): BannerRoot;
  parentNode?: { removeChild(node: unknown): unknown } | null;
  innerHTML?: string;
  addEventListener?(type: string, listener: (event: any) => void): void;
}

export interface BannerRoot {
  innerHTML: string;
  addEventListener(type: string, listener: (event: any) => void): void;
}

export interface BannerOptions {
  storageKey?: string;
  applicationName?: string;
  text?: BannerText;
}

// Starts listening and shows the banner when it applies. Returns a function that removes it.
export function startInstallBanner(host: BannerHost, options: BannerOptions = {}): () => void {
  const key = options.storageKey ?? "install-banner-dismissed";
  const nav = host.navigator;
  const installed = host.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  if (installed) return () => {};
  const text = options.text ?? englishText;
  const name = options.applicationName
    ?? host.document.querySelector('meta[name="application-name"]')?.content
    ?? host.document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content
    ?? (host.document.title || "this app");
  let deferred: { prompt(): void; userChoice: Promise<unknown>; preventDefault(): void } | null = null;
  let element: BannerElement | null = null;

  const remove = () => {
    element?.parentNode?.removeChild(element);
    element = null;
  };

  const render = () => {
    if (!host.document.body) return;
    remove();
    const kind = bannerKind({ userAgent: nav.userAgent, platform: nav.platform, maxTouchPoints: nav.maxTouchPoints, installed: false, now: host.now(), dismissedAt: Number(host.localStorage.getItem(key) ?? 0) }, deferred !== null);
    if (kind === "none") return;
    const created = host.document.createElement("div");
    created.setAttribute("data-install-banner", "");
    const root: BannerRoot = created.attachShadow ? created.attachShadow({ mode: "closed" }) : (created as unknown as BannerRoot);
    root.innerHTML = bannerMarkup(kind, name, text);
    root.addEventListener("click", (event) => {
      const action = event.target?.getAttribute?.("data-act");
      if (action === "close") {
        host.localStorage.setItem(key, String(host.now()));
        remove();
      } else if (action === "install" && deferred) {
        const prompt = deferred;
        prompt.prompt();
        void prompt.userChoice.then(() => {
          deferred = null;
          remove();
        });
      }
    });
    element = created;
    host.document.body.appendChild(created);
  };

  host.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event;
    render();
  });
  host.addEventListener("appinstalled", () => {
    remove();
    host.localStorage.setItem(key, String(host.now()));
  });
  if (host.document.readyState === "loading") host.document.addEventListener("DOMContentLoaded", render);
  else render();
  return remove;
}
