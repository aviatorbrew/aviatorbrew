import { promises as fs } from "fs";
import path from "path";
import { beers, type Beer } from "@/data/site";

export type ManagedBeer = Beer & { id: string; createdAt: string };
export type PortalBeer = ManagedBeer & { source: "catalog" | "managed" };

const dataFile = () => process.env.MANAGED_BEERS_DATA_FILE || path.join(process.cwd(), "data", "managed-beers.json");
const overridesFile = () => process.env.BEER_OVERRIDES_DATA_FILE || path.join(process.cwd(), "data", "beer-overrides.json");

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; }
}
async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + ".tmp";
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(temp, file);
}
async function readManaged(): Promise<ManagedBeer[]> {
  const stored = await readJson<unknown>(dataFile(), []);
  return Array.isArray(stored) ? stored.filter((beer): beer is ManagedBeer => Boolean(beer && typeof beer === "object" && typeof (beer as ManagedBeer).id === "string")) : [];
}
async function readOverrides(): Promise<Beer[]> {
  const stored = await readJson<unknown>(overridesFile(), []);
  return Array.isArray(stored) ? stored.filter((beer): beer is Beer => Boolean(beer && typeof beer === "object" && typeof (beer as Beer).slug === "string")) : [];
}
function mergeCatalog(overrides: Beer[]) {
  const bySlug = new Map(overrides.map((beer) => [beer.slug, beer]));
  return beers.map((beer) => ({ ...beer, ...(bySlug.get(beer.slug) || {}) }));
}

export async function getManagedBeers() { return readManaged(); }
export async function getAllBeers(): Promise<Beer[]> {
  const [managed, overrides] = await Promise.all([readManaged(), readOverrides()]);
  return [...mergeCatalog(overrides), ...managed];
}
export async function getPortalBeers(): Promise<PortalBeer[]> {
  const [managed, overrides] = await Promise.all([readManaged(), readOverrides()]);
  return [...mergeCatalog(overrides).map((beer) => ({ ...beer, id: "catalog_" + beer.slug, createdAt: "", source: "catalog" as const })), ...managed.map((beer) => ({ ...beer, source: "managed" as const }))];
}
export async function getPortalBeer(id: string) { return (await getPortalBeers()).find((beer) => beer.id === id) || null; }

export async function addManagedBeer(beer: Beer) {
  const items = await readManaged();
  const existing = await getAllBeers();
  if (existing.some((item) => item.slug === beer.slug)) throw new Error("A beer with that name already exists.");
  const item = { ...beer, id: "beer_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8), createdAt: new Date().toISOString() } satisfies ManagedBeer;
  items.push(item);
  await writeJson(dataFile(), items);
  return item;
}

export async function updatePortalBeer(id: string, beer: Beer) {
  if (id.startsWith("catalog_")) {
    const slug = id.slice("catalog_".length);
    if (!beers.some((item) => item.slug === slug)) throw new Error("Core beer not found.");
    const overrides = await readOverrides();
    const next = [...overrides.filter((item) => item.slug !== slug), { ...beer, slug }];
    await writeJson(overridesFile(), next);
    return;
  }
  const items = await readManaged();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Beer not found.");
  items[index] = { ...items[index], ...beer, slug: items[index].slug };
  await writeJson(dataFile(), items);
}

export async function deleteManagedBeer(id: string) {
  const items = await readManaged();
  if (!items.some((item) => item.id === id)) throw new Error("Added beer not found.");
  await writeJson(dataFile(), items.filter((item) => item.id !== id));
}
