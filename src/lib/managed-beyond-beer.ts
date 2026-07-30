import { promises as fs } from "fs";
import path from "path";
import { beyondBeer, type BeyondBeer } from "@/data/site";
import { databaseConfigured, withDatabase } from "@/lib/database";
import { normalizeBeverageImageUrl } from "@/lib/beverage-images";

export type ManagedBeyondBeer = BeyondBeer & { id: string; createdAt: string };
export type PortalBeyondBeer = ManagedBeyondBeer & { source: "catalog" | "managed" };

const dataFile = () => process.env.MANAGED_BEVERAGES_DATA_FILE || path.join(process.cwd(), "data", "managed-beverages.json");
const overridesFile = () => process.env.BEVERAGE_OVERRIDES_DATA_FILE || path.join(process.cwd(), "data", "beverage-overrides.json");
const beverageType = "beyond_beer";

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
async function readManagedFile(): Promise<ManagedBeyondBeer[]> {
  const stored = await readJson<unknown>(dataFile(), []);
  return Array.isArray(stored) ? stored.filter((item): item is ManagedBeyondBeer => Boolean(item && typeof item === "object" && typeof (item as ManagedBeyondBeer).id === "string")) : [];
}
async function readOverrideFile(): Promise<BeyondBeer[]> {
  const stored = await readJson<unknown>(overridesFile(), []);
  return Array.isArray(stored) ? stored.filter((item): item is BeyondBeer => Boolean(item && typeof item === "object" && typeof (item as BeyondBeer).slug === "string")) : [];
}
function normalizeBeverageImage<T extends BeyondBeer>(item: T): T { return { ...item, image: normalizeBeverageImageUrl(item.image) }; }
function rowToPortal(row: { slug: string; name: string; description: string | null; image_url: string | null; metadata: unknown; created_at: Date | string | null }): PortalBeyondBeer {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Partial<ManagedBeyondBeer & { source: "catalog" | "managed" }> : {};
  const source = metadata.source === "catalog" ? "catalog" : "managed";
  const item = normalizeBeverageImage({ slug: row.slug, name: row.name, category: metadata.category || "Soda", description: row.description || "", note: metadata.note || "", image: row.image_url || metadata.image || "" } as BeyondBeer);
  return { ...item, id: metadata.id || (source === "catalog" ? "catalog_" + row.slug : "beverage_" + row.slug), createdAt: metadata.createdAt || (row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at || ""), source };
}
async function readDatabasePortal(): Promise<PortalBeyondBeer[] | null> {
  if (!databaseConfigured()) return null;
  return withDatabase(async (client) => {
    const result = await client.query("SELECT slug, name, description, image_url, metadata, created_at FROM website.beverages WHERE beverage_type = $1 ORDER BY name", [beverageType]);
    return result.rows.map(rowToPortal);
  });
}
async function upsertDatabase(id: string, item: BeyondBeer, source: "catalog" | "managed", createdAt = new Date().toISOString()) {
  if (!databaseConfigured()) return false;
  await withDatabase(async (client) => {
    await client.query("INSERT INTO website.beverages (slug, name, beverage_type, style, abv, description, image_url, published, metadata, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8::jsonb,now()) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, beverage_type=EXCLUDED.beverage_type, style=EXCLUDED.style, abv=EXCLUDED.abv, description=EXCLUDED.description, image_url=EXCLUDED.image_url, published=true, metadata=EXCLUDED.metadata, updated_at=now()", [item.slug, item.name, beverageType, item.category, "", item.description, item.image, JSON.stringify({ source, id, createdAt, category: item.category, note: item.note, image: item.image })]);
  });
  return true;
}
async function deleteDatabase(id: string) {
  if (!databaseConfigured()) return false;
  const slug = id.startsWith("catalog_") ? id.slice("catalog_".length) : null;
  await withDatabase(async (client) => {
    if (slug) await client.query("UPDATE website.beverages SET published=false, updated_at=now() WHERE beverage_type=$1 AND slug=$2", [beverageType, slug]);
    else await client.query("DELETE FROM website.beverages WHERE beverage_type=$1 AND metadata->>'id'=$2", [beverageType, id]);
  });
  return true;
}
function mergeCatalog(overrides: BeyondBeer[], databaseItems: PortalBeyondBeer[] = []) {
  const bySlug = new Map(overrides.map((item) => [item.slug, item]));
  for (const item of databaseItems.filter((item) => item.source === "catalog")) bySlug.set(item.slug, item);
  return beyondBeer.map((item) => normalizeBeverageImage({ ...item, ...(bySlug.get(item.slug) || {}) }));
}

export async function getAllBeyondBeer(): Promise<BeyondBeer[]> {
  const [managed, overrides, databaseItems] = await Promise.all([readManagedFile(), readOverrideFile(), readDatabasePortal().catch(() => null)]);
  const db = databaseItems || [];
  const dbSlugs = new Set(db.map((item) => item.slug));
  return [...mergeCatalog(overrides, db), ...managed.filter((item) => !dbSlugs.has(item.slug)).map(normalizeBeverageImage), ...db.filter((item) => item.source === "managed")];
}
export async function getPortalBeyondBeer(): Promise<PortalBeyondBeer[]> {
  const [managed, overrides, databaseItems] = await Promise.all([readManagedFile(), readOverrideFile(), readDatabasePortal().catch(() => null)]);
  const db = databaseItems || [];
  const dbSlugs = new Set(db.map((item) => item.slug));
  return [...mergeCatalog(overrides, db).map((item) => ({ ...item, id: "catalog_" + item.slug, createdAt: "", source: "catalog" as const })), ...managed.filter((item) => !dbSlugs.has(item.slug)).map((item) => ({ ...normalizeBeverageImage(item), source: "managed" as const })), ...db.filter((item) => item.source === "managed")];
}
export async function getPortalBeyondBeerItem(id: string) { return (await getPortalBeyondBeer()).find((item) => item.id === id) || null; }

export async function addManagedBeyondBeer(item: BeyondBeer) {
  const existing = await getAllBeyondBeer();
  if (existing.some((current) => current.slug === item.slug)) throw new Error("A beverage with that name already exists.");
  const next = { ...item, id: "beverage_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8), createdAt: new Date().toISOString() } satisfies ManagedBeyondBeer;
  if (!(await upsertDatabase(next.id, next, "managed", next.createdAt))) {
    const items = await readManagedFile();
    items.push(next);
    await writeJson(dataFile(), items);
  }
  return next;
}

export async function updatePortalBeyondBeer(id: string, item: BeyondBeer) {
  if (id.startsWith("catalog_")) {
    const slug = id.slice("catalog_".length);
    if (!beyondBeer.some((current) => current.slug === slug)) throw new Error("Core beverage not found.");
    const next = { ...item, slug };
    if (!(await upsertDatabase(id, next, "catalog"))) {
      const overrides = await readOverrideFile();
      await writeJson(overridesFile(), [...overrides.filter((current) => current.slug !== slug), next]);
    }
    return;
  }
  const items = await readManagedFile();
  const existing = (await getPortalBeyondBeerItem(id)) || items.find((current) => current.id === id);
  if (!existing) throw new Error("Beverage not found.");
  const next = { ...existing, ...item, slug: existing.slug };
  if (!(await upsertDatabase(id, next, "managed", existing.createdAt))) {
    const index = items.findIndex((current) => current.id === id);
    if (index < 0) throw new Error("Beverage not found.");
    items[index] = { ...items[index], ...item, slug: items[index].slug };
    await writeJson(dataFile(), items);
  }
}

export async function deleteManagedBeyondBeer(id: string) {
  if (await deleteDatabase(id)) {
    const items = await readManagedFile();
    if (items.some((item) => item.id === id)) await writeJson(dataFile(), items.filter((item) => item.id !== id));
    return;
  }
  const items = await readManagedFile();
  if (!items.some((item) => item.id === id)) throw new Error("Added beverage not found.");
  await writeJson(dataFile(), items.filter((item) => item.id !== id));
}
