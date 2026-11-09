import { startInstallBanner, type BannerHost, type BannerOptions } from "./install-banner.ts";

// Start-up of the installable web shell in the browser.

export interface ShellHost extends BannerHost {
  navigator: BannerHost["navigator"] & { serviceWorker?: { register(url: string): Promise<unknown> } };
}

export interface ShellOptions {
  // True inside the desktop wrapper, which neither installs nor registers a service worker.
  desktop?: boolean;
  // Relative path so it works under any prefix.
  serviceWorkerUrl?: string;
  banner?: BannerOptions;
}

export interface ShellHandle {
  serviceWorker: Promise<boolean>;
  removeBanner: () => void;
}

export function startShell(host: ShellHost, options: ShellOptions = {}): ShellHandle {
  if (options.desktop) return { serviceWorker: Promise.resolve(false), removeBanner: () => {} };
  const register = host.navigator.serviceWorker;
  const serviceWorker = register
    ? register.register(options.serviceWorkerUrl ?? "./sw.js").then(() => true, () => false)
    : Promise.resolve(false);
  return { serviceWorker, removeBanner: startInstallBanner(host, options.banner) };
}

// The browser's own objects as a ShellHost.
export function browserHost(): ShellHost {
  return {
    matchMedia: (query) => window.matchMedia(query),
    navigator: navigator as ShellHost["navigator"],
    localStorage,
    document: document as unknown as ShellHost["document"],
    addEventListener: (type, listener) => window.addEventListener(type, listener),
    now: () => Date.now(),
  };
}
