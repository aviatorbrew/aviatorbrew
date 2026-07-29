import { promises as fs } from "fs";
import path from "path";
import { beyondBeer, type BeyondBeer } from "@/data/site";
import { normalizeBeverageImageUrl } from "@/lib/beverage-images";

export type ManagedBeyondBeer = BeyondBeer & { id: string; createdAt: string };
export type PortalBeyondBeer = ManagedBeyondBeer & { source: "catalog" | "managed" };

const dataFile = () => process.env.MANAGED_BEVERAGES_DATA_FILE || path.join(process.cwd(), "data", "managed-beverages.json");
const overridesFile = () => process.env.BEVERAGE_OVERRIDES_DATA_FILE || path.join(process.cwd(), "data", "beverage-overrides.json");

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
async function readManaged(): Promise<ManagedBeyondBeer[]> {
  const stored = await readJson<unknown>(dataFile(), []);
  return Array.isArray(stored) ? stored.filter((item): item is ManagedBeyondBeer => Boolean(item && typeof item === "object" && typeof (item as ManagedBeyondBeer).id === "string")) : [];
}
async function readOverrides(): Promise<BeyondBeer[]> {
  const stored = await readJson<unknown>(overridesFile(), []);
  return Array.isArray(stored) ? stored.filter((item): item is BeyondBeer => Boolean(item && typeof item === "object" && typeof (item as BeyondBeer).slug === "string")) : [];
}
function normalizeBeverageImage<T extends BeyondBeer>(item: T): T {
  return { ...item, image: normalizeBeverageImageUrl(item.image) };
}

function mergeCatalog(overrides: BeyondBeer[]) {
  const bySlug = new Map(overrides.map((item) => [item.slug, item]));
  return beyondBeer.map((item) => normalizeBeverageImage({ ...item, ...(bySlug.get(item.slug) || {}) }));
}

export async function getAllBeyondBeer(): Promise<BeyondBeer[]> {
  const [managed, overrides] = await Promise.all([readManaged(), readOverrides()]);
  return [...mergeCatalog(overrides), ...managed.map(normalizeBeverageImage)];
}
export async function getPortalBeyondBeer(): Promise<PortalBeyondBeer[]> {
  const [managed, overrides] = await Promise.all([readManaged(), readOverrides()]);
  return [...mergeCatalog(overrides).map((item) => ({ ...item, id: "catalog_" + item.slug, createdAt: "", source: "catalog" as const })), ...managed.map((item) => ({ ...normalizeBeverageImage(item), source: "managed" as const }))];
}
export async function getPortalBeyondBeerItem(id: string) { return (await getPortalBeyondBeer()).find((item) => item.id === id) || null; }

export async function addManagedBeyondBeer(item: BeyondBeer) {
  const items = await readManaged();
  const existing = await getAllBeyondBeer();
  if (existing.some((current) => current.slug === item.slug)) throw new Error("A beverage with that name already exists.");
  const next = { ...item, id: "beverage_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8), createdAt: new Date().toISOString() } satisfies ManagedBeyondBeer;
  items.push(next);
  await writeJson(dataFile(), items);
  return next;
}

export async function updatePortalBeyondBeer(id: string, item: BeyondBeer) {
  if (id.startsWith("catalog_")) {
    const slug = id.slice("catalog_".length);
    if (!beyondBeer.some((current) => current.slug === slug)) throw new Error("Core beverage not found.");
    const overrides = await readOverrides();
    const next = [...overrides.filter((current) => current.slug !== slug), { ...item, slug }];
    await writeJson(overridesFile(), next);
    return;
  }
  const items = await readManaged();
  const index = items.findIndex((current) => current.id === id);
  if (index < 0) throw new Error("Beverage not found.");
  items[index] = { ...items[index], ...item, slug: items[index].slug };
  await writeJson(dataFile(), items);
}

export async function deleteManagedBeyondBeer(id: string) {
  const items = await readManaged();
  if (!items.some((item) => item.id === id)) throw new Error("Added beverage not found.");
  await writeJson(dataFile(), items.filter((item) => item.id !== id));
}
