import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderShell, writeShell, type WebShellSettings } from "../implementation/web/render.ts";
import { startShell, type ShellHost } from "../implementation/web/runtime.ts";

// Build time: write the shell files for an application whose colours come from a theme.
export function buildShell(settings: WebShellSettings, colours: Record<string, string>): { directory: string; files: string[] } {
  const directory = mkdtempSync(join(tmpdir(), "web-shell-"));
  const files = renderShell(settings, { colours });
  writeShell(directory, files);
  return { directory, files: Object.keys(files).sort() };
}

// Run time: what an application's main module does once, after its own start-up.
export function startApplication(host: ShellHost, desktop: boolean) {
  return startShell(host, { desktop });
}
