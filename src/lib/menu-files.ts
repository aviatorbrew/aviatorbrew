import { promises as fs } from "node:fs";
import path from "node:path";

export const menuFileTypes = new Set(["food", "drinks"]);
export type PublishedMenuFile = { name: string; url: string };

const apiPrefix = "/api/menu-files/";
const publicMenuExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);

function configuredMenuRoot() {
  const configured = String(process.env.MENU_FILES_DIRECTORY || "").trim();
  if (configured) return path.resolve(configured);
  return process.env.RENDER ? "/var/data/aviatorbrew/menus" : "";
}

export function menuWriteRoot() {
  return configuredMenuRoot() || path.join(process.cwd(), "public", "media", "menus");
}

export function menuRoots() {
  return [
    configuredMenuRoot(),
    path.join(process.cwd(), "public", "media", "menus"),
    path.join(process.cwd(), ".next", "standalone", "public", "media", "menus"),
    path.join(process.cwd(), "..", "..", "public", "media", "menus"),
  ].filter(Boolean);
}

export function menuDirectory(location: string, type: string) {
  return path.join(menuWriteRoot(), location, type);
}

export function menuSearchPaths(location: string, type: string, filename: string) {
  const safe = path.basename(filename);
  return [...new Set(menuRoots().map((root) => path.join(root, location, type, safe)))];
}

export function menuPublicUrl(location: string, type: string, fileName: string) {
  return apiPrefix + [location, type, path.basename(fileName)].map(encodeURIComponent).join("/");
}


function menuFileVersion(name: string, fallback: number) {
  const match = name.match(/^\d{10,}-/)?.[0];
  const version = match ? Number(match.slice(0, -1)) : fallback;
  return Number.isFinite(version) ? version : fallback;
}

export async function latestPublicMenu(location: string, type: string): Promise<PublishedMenuFile | null> {
  const candidates: Array<{ name: string; mtimeMs: number }> = [];
  for (const root of menuRoots()) {
    const directory = path.join(root, location, type);
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const files = await Promise.all(entries.filter((entry) => entry.isFile() && publicMenuExtensions.has(path.extname(entry.name).toLowerCase())).map(async (entry) => ({ name: entry.name, mtimeMs: (await fs.stat(path.join(directory, entry.name))).mtimeMs })));
      candidates.push(...files);
    } catch {}
  }
  candidates.sort((a, b) => menuFileVersion(b.name, b.mtimeMs) - menuFileVersion(a.name, a.mtimeMs) || b.mtimeMs - a.mtimeMs);
  const current = candidates[0];
  return current ? { name: current.name, url: menuPublicUrl(location, type, current.name) } : null;
}
