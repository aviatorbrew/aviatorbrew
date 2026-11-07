import { unstable_cache } from "next/cache";
import { getSiteTheme } from "@/lib/site-theme-store";
import { defaultSiteTheme } from "@/lib/site-skins";

const cachedTheme = unstable_cache(getSiteTheme, ["website-site-theme"], { revalidate: 30, tags: ["site-theme"] });
export async function getCachedSiteTheme() {
  try { return await cachedTheme(); }
  catch { console.error("Website skin settings are temporarily unavailable."); return structuredClone(defaultSiteTheme); }
}
