import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

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

async function readAlerts() {
  try { return fromStored(JSON.parse(await fs.readFile(beerReleaseAlertFile(), "utf8")) as unknown); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}

async function writeAlerts(alerts: BeerReleaseAlert[]) {
  const store: ReleaseAlertStore = { schemaVersion: 2, alerts: alerts.sort(sortAlerts) };
  await fs.mkdir(path.dirname(beerReleaseAlertFile()), { recursive: true });
  const temp = beerReleaseAlertFile() + ".tmp";
  await fs.writeFile(temp, JSON.stringify(store, null, 2) + "\n", "utf8");
  await fs.rename(temp, beerReleaseAlertFile());
  return store.alerts;
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
  if (index >= 0) alerts[index] = next;
  else alerts.push(next);
  await writeAlerts(alerts);
  return next;
}

export async function createBeerReleaseAlert(input: BeerReleaseAlertInput): Promise<BeerReleaseAlert> {
  const alerts = await readAlerts();
  const next = normalize({ ...input, id: randomUUID() });
  alerts.push(next);
  await writeAlerts(alerts);
  return next;
}

export async function deleteBeerReleaseAlert(id: string) {
  const cleanId = clean(id, 80);
  const alerts = await readAlerts();
  const next = alerts.filter((alert) => alert.id !== cleanId);
  if (next.length === alerts.length) throw new Error("Release alert not found.");
  await writeAlerts(next);
}
