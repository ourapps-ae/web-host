import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Build-time rendering of the installable web shell files from typed settings.

export interface WebShellSettings {
  applicationId: string;
  applicationName: string;
  shortName: string;
  themeColour: string;
  backgroundColour: string;
  iconPath: string;
  webAddress: string;
}

export interface RenderOptions {
  // Colour names from the theme component, used when a colour setting is a name rather than #rrggbb.
  colours?: Record<string, string>;
  description?: string;
  language?: string;
  // Module the page starts from, and the markup placed inside <body>.
  entry?: string;
  body?: string;
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

const ESCAPES: Record<string, (value: string) => string> = {
  json: (value) => JSON.stringify(value),
  html: (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
  raw: (value) => value,
};

// {{name}} inserts raw text; {{name:json}} and {{name:html}} escape for that context. Unknown names are errors.
const TOKEN = /\{\{([A-Za-z][A-Za-z0-9]*)(?::(json|html))?\}\}/g;

export function fill(template: string, values: Record<string, string>): string {
  if (template.replace(TOKEN, "").includes("{{")) throw new SettingsError("template has a malformed token");
  return template.replace(TOKEN, (_match, name: string, mode: string | undefined) => {
    if (!Object.hasOwn(values, name)) throw new SettingsError(`template names unknown value ${name}`);
    return ESCAPES[mode ?? "raw"](values[name]);
  });
}

function template(name: string): string {
  return readFileSync(new URL(`./templates/${name}.template`, import.meta.url), "utf8");
}

export function renderManifest(settings: ResolvedSettings, options: RenderOptions = {}): string {
  const text = fill(template("manifest.webmanifest"), { ...settings, description: options.description ?? settings.applicationName });
  JSON.parse(text);
  return text;
}

export function renderIndex(settings: ResolvedSettings, options: RenderOptions = {}): string {
  const language = options.language ?? "en";
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language)) throw new SettingsError("language must be a language tag");
  const entry = options.entry ?? "/src/main.ts";
  if (!/^[A-Za-z0-9_./-]+$/.test(entry)) throw new SettingsError("entry must be a plain module path");
  return fill(template("index.html"), { ...settings, language, entry, body: options.body ?? '    <div id="app"></div>' });
}

export function renderHeaders(): string {
  return template("_headers");
}

export function renderViteConfig(settings: ResolvedSettings): string {
  return fill(template("vite.config.ts"), { ...settings });
}

// Output path (relative to the web project) to file text.
export function renderShell(settings: WebShellSettings, options: RenderOptions = {}): Record<string, string> {
  const resolved = validateSettings(settings, options.colours);
  return {
    "index.html": renderIndex(resolved, options),
    "vite.config.ts": renderViteConfig(resolved),
    "public/manifest.webmanifest": renderManifest(resolved, options),
    "public/_headers": renderHeaders(),
    "public/sw.js": readFileSync(new URL("./public/sw.js", import.meta.url), "utf8"),
  };
}

export function writeShell(directory: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    const target = join(directory, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
}
