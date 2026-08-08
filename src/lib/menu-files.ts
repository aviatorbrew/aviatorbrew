import path from "node:path";

export const menuFileTypes = new Set(["food", "drinks"]);

const apiPrefix = "/api/menu-files/";

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

