import { webHostConfig } from "../implementation/web/vite.ts";
import type { WebShellSettings } from "../implementation/web/render.ts";
import { startShell, type ShellHost } from "../implementation/web/runtime.ts";

// Build time: what an application's vite.config.ts returns, with the colour names resolved through a theme's colour table.
export function shellConfig(settings: WebShellSettings, colours: Record<string, string>, mode = "production") {
  return webHostConfig({ mode, root: "/application/web", settings, colours });
}

// Run time: what an application's main module does once, after its own start-up.
export function startApplication(host: ShellHost, desktop: boolean) {
  return startShell(host, { desktop });
}
