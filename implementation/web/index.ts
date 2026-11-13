// The entry module of web-host's web code: everything code outside the component may use.
// `ShellOptions` is the runtime's (startShell); the head and manifest options are `RenderOptions`.
export {
  SettingsError, headTags, renderHeaders, renderManifest, resolveColour, validateSettings,
  type HeadTag, type ResolvedSettings, type WebShellSettings, type ShellOptions as RenderOptions,
} from "./render.ts";
export * from "./runtime.ts";
export * from "./install-banner.ts";
export * from "./settings.ts";
