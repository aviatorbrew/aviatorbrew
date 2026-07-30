import { promises as fs } from "fs";
import path from "path";
import { beers, type Beer } from "@/data/site";
import { databaseConfigured, withDatabase } from "@/lib/database";
import { normalizeBeerImageUrl } from "@/lib/beer-images";

export type ManagedBeer = Beer & { id: string; createdAt: string; published?: boolean };
export type PortalBeer = ManagedBeer & { source: "catalog" | "managed"; published: boolean };

const dataFile = () => process.env.MANAGED_BEERS_DATA_FILE || path.join(process.cwd(), "data", "managed-beers.json");
const overridesFile = () => process.env.BEER_OVERRIDES_DATA_FILE || path.join(process.cwd(), "data", "beer-overrides.json");
const beverageType = "beer";

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
async function readManagedFile(): Promise<ManagedBeer[]> {
  const stored = await readJson<unknown>(dataFile(), []);
  return Array.isArray(stored) ? stored.filter((beer): beer is ManagedBeer => Boolean(beer && typeof beer === "object" && typeof (beer as ManagedBeer).id === "string")) : [];
}
async function readOverrideFile(): Promise<Beer[]> {
  const stored = await readJson<unknown>(overridesFile(), []);
  return Array.isArray(stored) ? stored.filter((beer): beer is Beer => Boolean(beer && typeof beer === "object" && typeof (beer as Beer).slug === "string")) : [];
}
function normalizeBeerImage<T extends Beer>(beer: T): T { return { ...beer, image: normalizeBeerImageUrl(beer.image) }; }
function metadataFor(beer: Beer, source: "catalog" | "managed", id?: string, createdAt?: string) {
  return { source, id, createdAt, category: beer.category, status: beer.status, image: beer.image };
}
function rowToPortalBeer(row: { slug: string; name: string; style: string | null; abv: string | null; description: string | null; image_url: string | null; published: boolean; metadata: unknown; created_at: Date | string | null }): PortalBeer {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Partial<ManagedBeer & { source: "catalog" | "managed" }> : {};
  const source = metadata.source === "catalog" ? "catalog" : "managed";
  const beer = normalizeBeerImage({ slug: row.slug, name: row.name, style: row.style || "Beer", abv: row.abv || "", category: metadata.category || "Ale", description: row.description || "", status: metadata.status || "Limited", image: row.image_url || metadata.image || "", published: row.published } as Beer);
  return { ...beer, id: metadata.id || (source === "catalog" ? "catalog_" + row.slug : "beer_" + row.slug), createdAt: metadata.createdAt || (row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at || ""), source, published: row.published };
}
async function readDatabasePortalBeers(): Promise<PortalBeer[] | null> {
  if (!databaseConfigured()) return null;
  return withDatabase(async (client) => {
    const result = await client.query("SELECT slug, name, style, abv, description, image_url, published, metadata, created_at FROM website.beverages WHERE beverage_type = $1 ORDER BY name", [beverageType]);
    return result.rows.map(rowToPortalBeer);
  });
}
async function upsertDatabaseBeer(id: string, beer: Beer, source: "catalog" | "managed", createdAt = new Date().toISOString()) {
  if (!databaseConfigured()) return false;
  await withDatabase(async (client) => {
    await client.query("INSERT INTO website.beverages (slug, name, beverage_type, style, abv, description, image_url, published, metadata, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now()) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, beverage_type=EXCLUDED.beverage_type, style=EXCLUDED.style, abv=EXCLUDED.abv, description=EXCLUDED.description, image_url=EXCLUDED.image_url, published=EXCLUDED.published, metadata=EXCLUDED.metadata, updated_at=now()", [beer.slug, beer.name, beverageType, beer.style, beer.abv, beer.description, beer.image, beer.published !== false, JSON.stringify(metadataFor(beer, source, id, createdAt))]);
  });
  return true;
}
async function deleteDatabaseBeer(id: string) {
  if (!databaseConfigured()) return false;
  const slug = id.startsWith("catalog_") ? id.slice("catalog_".length) : null;
  await withDatabase(async (client) => {
    if (slug) await client.query("UPDATE website.beverages SET published = false, updated_at = now() WHERE beverage_type = $1 AND slug = $2", [beverageType, slug]);
    else await client.query("DELETE FROM website.beverages WHERE beverage_type = $1 AND metadata->>'id' = $2", [beverageType, id]);
  });
  return true;
}
function mergeCatalog(overrides: Beer[], databaseItems: PortalBeer[] = []) {
  const bySlug = new Map(overrides.map((beer) => [beer.slug, beer]));
  for (const item of databaseItems.filter((beer) => beer.source === "catalog")) bySlug.set(item.slug, item);
  return beers.map((beer) => normalizeBeerImage({ ...beer, ...(bySlug.get(beer.slug) || {}) }));
}

const categoryOrder = ["IPA", "Lager", "Ale", "Dark Beer", "High Gravity", "Limited Release"];
const collator = new Intl.Collator("en-US", { sensitivity: "base", numeric: true });
function byName<T extends { name: string }>(a: T, b: T) { return collator.compare(a.name, b.name); }
function byCategoryThenName(a: Beer, b: Beer) {
  const categoryDelta = (categoryOrder.indexOf(a.category) === -1 ? 999 : categoryOrder.indexOf(a.category)) - (categoryOrder.indexOf(b.category) === -1 ? 999 : categoryOrder.indexOf(b.category));
  return categoryDelta || byName(a, b);
}

export async function getManagedBeers() { return readManagedFile(); }
export async function getAllBeers(): Promise<Beer[]> {
  const [managed, overrides, databaseItems] = await Promise.all([readManagedFile(), readOverrideFile(), readDatabasePortalBeers().catch(() => null)]);
  const db = databaseItems || [];
  const dbSlugs = new Set(db.map((beer) => beer.slug));
  return [...mergeCatalog(overrides, db), ...managed.filter((beer) => !dbSlugs.has(beer.slug)).map(normalizeBeerImage), ...db.filter((beer) => beer.source === "managed")].filter((beer) => beer.published !== false).sort(byCategoryThenName);
}
export async function getPortalBeers(): Promise<PortalBeer[]> {
  const [managed, overrides, databaseItems] = await Promise.all([readManagedFile(), readOverrideFile(), readDatabasePortalBeers().catch(() => null)]);
  const db = databaseItems || [];
  const dbSlugs = new Set(db.map((beer) => beer.slug));
  return [...mergeCatalog(overrides, db).map((beer) => ({ ...beer, id: "catalog_" + beer.slug, createdAt: "", source: "catalog" as const, published: beer.published !== false })), ...managed.filter((beer) => !dbSlugs.has(beer.slug)).map((beer) => ({ ...normalizeBeerImage(beer), source: "managed" as const, published: beer.published !== false })), ...db.filter((beer) => beer.source === "managed")].sort(byName);
}
export async function getPortalBeer(id: string) { return (await getPortalBeers()).find((beer) => beer.id === id) || null; }

export async function addManagedBeer(beer: Beer) {
  const existing = await getPortalBeers();
  if (existing.some((item) => item.slug === beer.slug)) throw new Error("A beer with that name already exists.");
  const item = { ...beer, id: "beer_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8), createdAt: new Date().toISOString() } satisfies ManagedBeer;
  if (!(await upsertDatabaseBeer(item.id, item, "managed", item.createdAt))) {
    const items = await readManagedFile();
    items.push(item);
    await writeJson(dataFile(), items);
  }
  return item;
}

export async function updatePortalBeer(id: string, beer: Beer) {
  if (id.startsWith("catalog_")) {
    const slug = id.slice("catalog_".length);
    if (!beers.some((item) => item.slug === slug)) throw new Error("Core beer not found.");
    const nextBeer = { ...beer, slug };
    if (!(await upsertDatabaseBeer(id, nextBeer, "catalog"))) {
      const overrides = await readOverrideFile();
      await writeJson(overridesFile(), [...overrides.filter((item) => item.slug !== slug), nextBeer]);
    }
    return;
  }
  const items = await readManagedFile();
  const existing = (await getPortalBeer(id)) || items.find((item) => item.id === id);
  if (!existing) throw new Error("Beer not found.");
  const nextBeer = { ...existing, ...beer, slug: existing.slug };
  if (!(await upsertDatabaseBeer(id, nextBeer, "managed", existing.createdAt))) {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Beer not found.");
    items[index] = { ...items[index], ...beer, slug: items[index].slug };
    await writeJson(dataFile(), items);
  }
}

export async function deleteManagedBeer(id: string) {
  if (await deleteDatabaseBeer(id)) {
    const items = await readManagedFile();
    if (items.some((item) => item.id === id)) await writeJson(dataFile(), items.filter((item) => item.id !== id));
    return;
  }
  const items = await readManagedFile();
  if (!items.some((item) => item.id === id)) throw new Error("Added beer not found.");
  await writeJson(dataFile(), items.filter((item) => item.id !== id));
}
