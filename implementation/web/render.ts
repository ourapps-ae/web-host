// The installable web shell's settings and the files and page head rendered from them at build time.

export interface WebShellSettings {
  applicationId: string;
  applicationName: string;
  shortName: string;
  themeColour: string;
  backgroundColour: string;
  iconPath: string;
  webAddress: string;
}

export class SettingsError extends Error {}

// The same grammars aepm applies to collected string settings.
const GRAMMARS = {
  identifier: /^[A-Za-z][A-Za-z0-9_]{0,63}$/,
  slug: /^[a-z][a-z0-9-]{0,63}$/,
  label: /^[A-Za-z][A-Za-z0-9 -]{0,63}$/,
  address: /^https?:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9_/-]*)?$/,
} as const;
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

function check(name: string, value: unknown, grammar: keyof typeof GRAMMARS): string {
  if (typeof value !== "string" || !GRAMMARS[grammar].test(value)) throw new SettingsError(`${name} must be a ${grammar}`);
  return value;
}

export function resolveColour(name: string, value: unknown, colours: Record<string, string> = {}): string {
  if (typeof value !== "string") throw new SettingsError(`${name} must be a string`);
  if (HEX_COLOUR.test(value)) return value.toLowerCase();
  if (GRAMMARS.identifier.test(value) && Object.hasOwn(colours, value) && HEX_COLOUR.test(colours[value])) return colours[value].toLowerCase();
  throw new SettingsError(`${name} must be #rrggbb or the name of a theme colour`);
}

export interface ResolvedSettings extends WebShellSettings {
  icon192: string;
  icon512: string;
}

export function validateSettings(settings: WebShellSettings, colours: Record<string, string> = {}): ResolvedSettings {
  const iconBase = check("iconPath", settings.iconPath, "slug");
  const address = check("webAddress", settings.webAddress, "address").replace(/\/+$/, "");
  const shortName = check("shortName", settings.shortName, "label");
  if (shortName.length > 12) throw new SettingsError("shortName should be at most 12 characters so home screens do not truncate it");
  return {
    applicationId: check("applicationId", settings.applicationId, "slug"),
    applicationName: check("applicationName", settings.applicationName, "label"),
    shortName,
    themeColour: resolveColour("themeColour", settings.themeColour, colours),
    backgroundColour: resolveColour("backgroundColour", settings.backgroundColour, colours),
    iconPath: iconBase,
    webAddress: address + "/",
    icon192: `${iconBase}-192.png`,
    icon512: `${iconBase}.png`,
  };
}

export interface ShellOptions {
  // Colour names from the theme component, used when a colour setting is a name rather than #rrggbb.
  colours?: Record<string, string>;
  description?: string;
}

// One element for the page head, in the form Vite's transformIndexHtml takes.
export interface HeadTag {
  tag: string;
  attrs?: Record<string, string>;
  children?: string;
  injectTo: "head-prepend" | "head";
}

export function renderManifest(settings: ResolvedSettings, options: ShellOptions = {}): string {
  const manifest = {
    id: settings.webAddress,
    name: settings.applicationName,
    short_name: settings.shortName,
    description: options.description ?? settings.applicationName,
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: settings.backgroundColour,
    theme_color: settings.themeColour,
    icons: [
      { src: settings.icon192, sizes: "192x192", type: "image/png" },
      { src: settings.icon512, sizes: "512x512", type: "image/png" },
    ],
  };
  return JSON.stringify(manifest, null, 2) + "\n";
}

export function renderHeaders(): string {
  return "/*\n  X-Robots-Tag: noindex\n";
}

// The head of the start page: character set, viewport, colours, names and icons; the manifest link only where the page is installable.
export function headTags(settings: ResolvedSettings, installable = true): HeadTag[] {
  const meta = (attrs: Record<string, string>): HeadTag => ({ tag: "meta", attrs, injectTo: "head" });
  const tags: HeadTag[] = [
    { tag: "meta", attrs: { charset: "UTF-8" }, injectTo: "head-prepend" },
    meta({ name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" }),
    meta({ name: "robots", content: "noindex, nofollow" }),
    meta({ name: "theme-color", content: settings.themeColour }),
    meta({ name: "application-name", content: settings.applicationName }),
    meta({ name: "apple-mobile-web-app-capable", content: "yes" }),
    meta({ name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" }),
    meta({ name: "apple-mobile-web-app-title", content: settings.shortName }),
    { tag: "title", children: settings.applicationName, injectTo: "head" },
    { tag: "link", attrs: { rel: "icon", href: settings.icon512, type: "image/png" }, injectTo: "head" },
    { tag: "link", attrs: { rel: "apple-touch-icon", href: settings.icon512 }, injectTo: "head" },
  ];
  if (installable) tags.push({ tag: "link", attrs: { rel: "manifest", href: "./manifest.webmanifest" }, injectTo: "head" });
  return tags;
}
