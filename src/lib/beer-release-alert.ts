import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { databaseConfigured, withDatabase } from "@/lib/database";

export type BeerReleaseAlert = {
  id: string;
  enabled: boolean;
  beerName: string;
  releaseDate: string;
  releaseTime: string;
  locations: string;
  specials: string;
  sellSheetUrl: string;
  updatedAt: string;
};

export type BeerReleaseAlertInput = Partial<Omit<BeerReleaseAlert, "updatedAt">>;
type ReleaseAlertStore = { schemaVersion: 2; alerts: BeerReleaseAlert[] };

export const beerReleaseAlertFile = () => process.env.BEER_RELEASE_ALERT_DATA_FILE || path.join(process.cwd(), "data", "beer-release-alert.json");
export const beerReleaseAlertAssetDirectory = () => process.env.BEER_RELEASE_ALERT_ASSET_DIRECTORY || path.join(process.cwd(), "data", "beer-release-alert-assets");

const emptyAlert: BeerReleaseAlert = { id: "", enabled: false, beerName: "", releaseDate: "", releaseTime: "", locations: "", specials: "", sellSheetUrl: "", updatedAt: "" };
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const contentArea = "new_release_alerts";

function normalize(input: BeerReleaseAlertInput, existing: BeerReleaseAlert = emptyAlert): BeerReleaseAlert {
  const releaseDate = input.releaseDate === undefined ? existing.releaseDate : clean(input.releaseDate, 10);
  const releaseTime = input.releaseTime === undefined ? existing.releaseTime : clean(input.releaseTime, 5);
  const sellSheetUrl = input.sellSheetUrl === undefined ? existing.sellSheetUrl : clean(input.sellSheetUrl, 500);
  if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) throw new Error("Use a valid release date.");
  if (releaseTime && !/^\d{2}:\d{2}$/.test(releaseTime)) throw new Error("Use a valid release time.");
  return {
    id: clean(input.id, 80) || existing.id || randomUUID(),
    enabled: input.enabled === undefined ? existing.enabled : input.enabled === true,
    beerName: input.beerName === undefined ? existing.beerName : clean(input.beerName, 120),
    releaseDate,
    releaseTime,
    locations: input.locations === undefined ? existing.locations : clean(input.locations, 300),
    specials: input.specials === undefined ? existing.specials : clean(input.specials, 300),
    sellSheetUrl,
    updatedAt: new Date().toISOString(),
  };
}

function fromStored(value: unknown): BeerReleaseAlert[] {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!source) return [];
  if (Array.isArray(source.alerts)) return source.alerts.map((item) => normalize(item as BeerReleaseAlertInput)).sort(sortAlerts);
  if ("beerName" in source || "sellSheetUrl" in source || "enabled" in source) return [normalize({ ...(source as BeerReleaseAlertInput), id: clean(source.id, 80) || "legacy-release-alert" })];
  return [];
}

function sortAlerts(a: BeerReleaseAlert, b: BeerReleaseAlert) {
  const dateA = (a.releaseDate || "9999-99-99") + "T" + (a.releaseTime || "99:99");
  const dateB = (b.releaseDate || "9999-99-99") + "T" + (b.releaseTime || "99:99");
  return dateA.localeCompare(dateB) || b.updatedAt.localeCompare(a.updatedAt);
}

async function readFileAlerts() {
  try { return fromStored(JSON.parse(await fs.readFile(beerReleaseAlertFile(), "utf8")) as unknown); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}

async function writeFileAlerts(alerts: BeerReleaseAlert[]) {
  const store: ReleaseAlertStore = { schemaVersion: 2, alerts: alerts.sort(sortAlerts) };
  await fs.mkdir(path.dirname(beerReleaseAlertFile()), { recursive: true });
  const temp = beerReleaseAlertFile() + ".tmp";
  await fs.writeFile(temp, JSON.stringify(store, null, 2) + "\n", "utf8");
  await fs.rename(temp, beerReleaseAlertFile());
  return store.alerts;
}

function alertStart(alert: BeerReleaseAlert) {
  if (!alert.releaseDate) return null;
  return alert.releaseDate + "T" + (alert.releaseTime || "00:00") + ":00-05:00";
}

async function readDatabaseAlerts() {
  if (!databaseConfigured()) return null;
  return withDatabase(async (client) => {
    const result = await client.query(
      `SELECT slug, title, data, published, starts_at, updated_at
       FROM website.content_blocks
       WHERE area = $1
       ORDER BY starts_at NULLS LAST, updated_at DESC`,
      [contentArea],
    );
    return result.rows.map((row): BeerReleaseAlert => {
      const data = row.data && typeof row.data === "object" ? row.data as Partial<BeerReleaseAlert> : {};
      const startsAt = row.starts_at instanceof Date ? row.starts_at : row.starts_at ? new Date(row.starts_at) : null;
      return {
        id: clean(data.id || row.slug, 80),
        enabled: row.published === true,
        beerName: clean(data.beerName || row.title, 120),
        releaseDate: clean(data.releaseDate || (startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt.toISOString().slice(0, 10) : ""), 10),
        releaseTime: clean(data.releaseTime, 5),
        locations: clean(data.locations, 300),
        specials: clean(data.specials, 300),
        sellSheetUrl: clean(data.sellSheetUrl, 500),
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : clean(row.updated_at, 40),
      };
    }).sort(sortAlerts);
  });
}

async function upsertDatabaseAlert(alert: BeerReleaseAlert) {
  if (!databaseConfigured()) return false;
  await withDatabase(async (client) => {
    await client.query(
      `INSERT INTO website.content_blocks (area, slug, eyebrow, title, body, data, published, starts_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, now())
       ON CONFLICT (area, slug) DO UPDATE SET
         eyebrow = EXCLUDED.eyebrow,
         title = EXCLUDED.title,
         body = EXCLUDED.body,
         data = EXCLUDED.data,
         published = EXCLUDED.published,
         starts_at = EXCLUDED.starts_at,
         updated_at = now()`,
      [
        contentArea,
        alert.id,
        "New Release Alert",
        alert.beerName || "New Release Alert",
        alert.specials || "",
        JSON.stringify(alert),
        alert.enabled,
        alertStart(alert),
      ],
    );
  });
  return true;
}

async function deleteDatabaseAlert(id: string) {
  if (!databaseConfigured()) return false;
  await withDatabase(async (client) => {
    await client.query("DELETE FROM website.content_blocks WHERE area = $1 AND slug = $2", [contentArea, id]);
  });
  return true;
}

async function readAlerts() {
  const databaseAlerts = await readDatabaseAlerts();
  if (databaseAlerts) return databaseAlerts;
  if (databaseConfigured()) return [];
  throw new Error("New Release alerts require DATABASE_URL. Run the file-to-database import before using alerts.");
}

export async function getBeerReleaseAlerts(): Promise<BeerReleaseAlert[]> {
  return readAlerts();
}

export async function getPublishedBeerReleaseAlerts(): Promise<BeerReleaseAlert[]> {
  return (await readAlerts()).filter((alert) => alert.enabled && alert.beerName);
}

export async function getBeerReleaseAlert(): Promise<BeerReleaseAlert> {
  return (await readAlerts())[0] || emptyAlert;
}

export async function saveBeerReleaseAlert(input: BeerReleaseAlertInput): Promise<BeerReleaseAlert> {
  const alerts = await readAlerts();
  const id = clean(input.id, 80);
  const index = id ? alerts.findIndex((alert) => alert.id === id) : alerts.length ? 0 : -1;
  const existing = index >= 0 ? alerts[index] : emptyAlert;
  const next = normalize(input, existing);
  if (!(await upsertDatabaseAlert(next))) throw new Error("New Release alerts require DATABASE_URL.");
  return next;
}

export async function createBeerReleaseAlert(input: BeerReleaseAlertInput): Promise<BeerReleaseAlert> {
  const next = normalize({ ...input, id: randomUUID() });
  if (!(await upsertDatabaseAlert(next))) throw new Error("New Release alerts require DATABASE_URL.");
  return next;
}

export async function deleteBeerReleaseAlert(id: string) {
  const cleanId = clean(id, 80);
  const alerts = await readAlerts();
  const next = alerts.filter((alert) => alert.id !== cleanId);
  if (next.length === alerts.length) throw new Error("Release alert not found.");
  if (!(await deleteDatabaseAlert(cleanId))) throw new Error("New Release alerts require DATABASE_URL.");
}
