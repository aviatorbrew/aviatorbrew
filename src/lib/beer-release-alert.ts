import { promises as fs } from "node:fs";
import path from "node:path";

export type BeerReleaseAlert = {
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

export const beerReleaseAlertFile = () => process.env.BEER_RELEASE_ALERT_DATA_FILE || path.join(process.cwd(), "data", "beer-release-alert.json");
export const beerReleaseAlertAssetDirectory = () => process.env.BEER_RELEASE_ALERT_ASSET_DIRECTORY || path.join(process.cwd(), "data", "beer-release-alert-assets");

const emptyAlert: BeerReleaseAlert = { enabled: false, beerName: "", releaseDate: "", releaseTime: "", locations: "", specials: "", sellSheetUrl: "", updatedAt: "" };
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

function normalize(input: BeerReleaseAlertInput, existing: BeerReleaseAlert): BeerReleaseAlert {
  const releaseDate = input.releaseDate === undefined ? existing.releaseDate : clean(input.releaseDate, 10);
  const releaseTime = input.releaseTime === undefined ? existing.releaseTime : clean(input.releaseTime, 5);
  const sellSheetUrl = input.sellSheetUrl === undefined ? existing.sellSheetUrl : clean(input.sellSheetUrl, 500);
  if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) throw new Error("Use a valid beer release date.");
  if (releaseTime && !/^\d{2}:\d{2}$/.test(releaseTime)) throw new Error("Use a valid beer release time.");
  return {
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

export async function getBeerReleaseAlert(): Promise<BeerReleaseAlert> {
  try {
    const stored = JSON.parse(await fs.readFile(beerReleaseAlertFile(), "utf8")) as Partial<BeerReleaseAlert>;
    return { ...emptyAlert, ...stored, enabled: stored.enabled === true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyAlert;
    throw error;
  }
}

export async function saveBeerReleaseAlert(input: BeerReleaseAlertInput): Promise<BeerReleaseAlert> {
  const current = await getBeerReleaseAlert();
  const next = normalize(input, current);
  await fs.mkdir(path.dirname(beerReleaseAlertFile()), { recursive: true });
  const temp = beerReleaseAlertFile() + ".tmp";
  await fs.writeFile(temp, JSON.stringify(next, null, 2) + "\n", "utf8");
  await fs.rename(temp, beerReleaseAlertFile());
  return next;
}
