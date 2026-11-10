import { promises as fs } from "node:fs";
import path from "node:path";
import { databaseConfigured, withDatabase } from "@/lib/database";
import {resolveScheduledSiteTheme} from '@/lib/site-skin-schedule';
import { defaultSiteTheme, parseSiteTheme } from "@/lib/site-skins";

const key = "site_theme";
const file = () => process.env.SITE_THEME_DATA_FILE || path.join(process.cwd(), "data", "site-theme.json");

export async function getStoredSiteTheme() {
  if (databaseConfigured()) return withDatabase(async client => {
    const result = await client.query("SELECT value FROM website.settings WHERE key=$1", [key]);
    return result.rows[0] ? parseSiteTheme(result.rows[0].value) : structuredClone(defaultSiteTheme);
  }, { skipSchema: true });
  try { return parseSiteTheme(JSON.parse(await fs.readFile(file(), "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(defaultSiteTheme); throw error; }
}

export async function setSiteTheme(input: unknown) {
  const next = parseSiteTheme(input, await getStoredSiteTheme());
  const body=input as Partial<typeof next>;
  if(next.automaticSeasonal&&body.skin!==undefined&&body.manualOverrideUntil===undefined)next.manualOverrideUntil=next.expiresAt&&Date.parse(next.expiresAt)>Date.now()?next.expiresAt:new Date(Date.now()+86400000).toISOString();
  if (next.skin !== "classic" && next.expiresAt && Date.parse(next.expiresAt) <= Date.now() && (!next.automaticSeasonal||body.skin!==undefined)) throw new Error("The automatic turn-off time has passed. Choose a future time or leave it blank.");
  next.updatedAt = new Date().toISOString();
  if (databaseConfigured()) await withDatabase(async client => {
    await client.query("INSERT INTO website.settings(key,value,description,updated_at) VALUES($1,$2::jsonb,$3,now()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()", [key, JSON.stringify(next), "Public website skin and seasonal promotion"]);
  });
  else {
    await fs.mkdir(path.dirname(file()), { recursive: true });
    const temporary = file() + "." + process.pid + "." + Date.now() + ".tmp";
    await fs.writeFile(temporary, JSON.stringify(next, null, 2) + "\n");
    await fs.rename(temporary, file());
  }
  return next;
}

export async function getSiteTheme(){return resolveScheduledSiteTheme(await getStoredSiteTheme());}
