import { randomUUID } from "node:crypto";
import { databaseConfigured, withDatabase } from "@/lib/database";

export type ShopCategory = {
  id: number;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  published: boolean;
};

export type ShopVariant = {
  id: number;
  productId: number;
  label: string;
  sku: string;
  priceCents: number;
  inventoryCount: number;
  published: boolean;
  sortOrder: number;
};

export type ShopProduct = {
  id: number;
  slug: string;
  categoryId: number | null;
  categorySlug: string;
  categoryName: string;
  name: string;
  description: string;
  imageUrl: string;
  published: boolean;
  featured: boolean;
  sortOrder: number;
  variants: ShopVariant[];
};

export type ShopCatalog = {
  categories: ShopCategory[];
  products: ShopProduct[];
};

export type ShopVariantInput = {
  label: string;
  sku?: string;
  priceCents: number;
  inventoryCount: number;
  published?: boolean;
  sortOrder?: number;
};

export type ShopProductInput = {
  id?: number;
  categoryId?: number | null;
  categorySlug?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  published?: boolean;
  featured?: boolean;
  sortOrder?: number;
  variants: ShopVariantInput[];
};

const defaultCategories = ["Apparel", "Signs", "Glasses", "Gift Cards", "Other"];

export function shopSlug(value: string) {
  return value.toLowerCase().trim().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || randomUUID().slice(0, 8);
}

export function dollarsToCents(value: unknown) {
  const number = typeof value === "number" ? value : Number(String(value || "").replace(/[$,]/g, ""));
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number * 100);
}

function toBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["true", "on", "1", "yes"].includes(value.toLowerCase());
  return fallback;
}

function intValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function categoryFromRow(row: Record<string, unknown>): ShopCategory {
  return { id: Number(row.id), slug: String(row.slug || ""), name: String(row.name || ""), description: String(row.description || ""), sortOrder: Number(row.sort_order || 0), published: row.published !== false };
}

function variantFromRow(row: Record<string, unknown>): ShopVariant {
  return { id: Number(row.id), productId: Number(row.product_id), label: String(row.label || ""), sku: String(row.sku || ""), priceCents: Number(row.price_cents || 0), inventoryCount: Number(row.inventory_count || 0), published: row.published !== false, sortOrder: Number(row.sort_order || 0) };
}

async function ensureDefaultCategories() {
  if (!databaseConfigured()) return;
  await withDatabase(async (client) => {
    for (let index = 0; index < defaultCategories.length; index++) {
      const name = defaultCategories[index];
      await client.query("INSERT INTO website.shop_categories (slug,name,description,sort_order,published) VALUES ($1,$2,$3,$4,true) ON CONFLICT (slug) DO NOTHING", [shopSlug(name), name, "", index * 10]);
    }
  });
}

export async function getShopCatalog(options: { manager?: boolean } = {}): Promise<ShopCatalog> {
  if (!databaseConfigured()) return { categories: [], products: [] };
  await ensureDefaultCategories();
  return withDatabase(async (client) => {
    const categoryResult = await client.query("SELECT * FROM website.shop_categories " + (options.manager ? "" : "WHERE published=true ") + "ORDER BY sort_order, name");
    const productResult = await client.query("SELECT p.*, c.slug AS category_slug, c.name AS category_name FROM website.shop_products p LEFT JOIN website.shop_categories c ON c.id=p.category_id " + (options.manager ? "" : "WHERE p.published=true ") + "ORDER BY COALESCE(c.sort_order, 9999), c.name NULLS LAST, p.sort_order, p.name");
    const productIds = productResult.rows.map((row) => Number(row.id));
    const variantResult = productIds.length ? await client.query("SELECT * FROM website.shop_product_variants WHERE product_id=ANY($1::bigint[]) " + (options.manager ? "" : "AND published=true AND inventory_count > 0 ") + "ORDER BY sort_order, label", [productIds]) : { rows: [] as Record<string, unknown>[] };
    const variantsByProduct = new Map<number, ShopVariant[]>();
    for (const row of variantResult.rows) {
      const variant = variantFromRow(row);
      variantsByProduct.set(variant.productId, [...(variantsByProduct.get(variant.productId) || []), variant]);
    }
    const products = productResult.rows.map((row) => ({
      id: Number(row.id),
      slug: String(row.slug || ""),
      categoryId: row.category_id === null ? null : Number(row.category_id),
      categorySlug: String(row.category_slug || "uncategorized"),
      categoryName: String(row.category_name || "Uncategorized"),
      name: String(row.name || ""),
      description: String(row.description || ""),
      imageUrl: String(row.image_url || ""),
      published: row.published !== false,
      featured: row.featured === true,
      sortOrder: Number(row.sort_order || 0),
      variants: variantsByProduct.get(Number(row.id)) || [],
    })).filter((product) => options.manager || product.variants.length > 0);
    return { categories: categoryResult.rows.map(categoryFromRow), products };
  });
}

export async function saveShopCategory(input: { id?: number; name: string; description?: string; sortOrder?: unknown; published?: unknown }) {
  const name = input.name.trim();
  if (!name) throw new Error("Catalog name is required.");
  return withDatabase(async (client) => {
    if (input.id) await client.query("UPDATE website.shop_categories SET name=$2, description=$3, sort_order=$4, published=$5, updated_at=now() WHERE id=$1", [input.id, name, input.description || "", intValue(input.sortOrder), toBoolean(input.published, true)]);
    else await client.query("INSERT INTO website.shop_categories (slug,name,description,sort_order,published) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, sort_order=EXCLUDED.sort_order, published=EXCLUDED.published, updated_at=now()", [shopSlug(name), name, input.description || "", intValue(input.sortOrder), toBoolean(input.published, true)]);
    return getShopCatalog({ manager: true });
  });
}

export async function deleteShopCategory(id: number) {
  return withDatabase(async (client) => {
    await client.query("UPDATE website.shop_products SET category_id=NULL, updated_at=now() WHERE category_id=$1", [id]);
    await client.query("DELETE FROM website.shop_categories WHERE id=$1", [id]);
    return getShopCatalog({ manager: true });
  });
}

async function categoryIdForInput(client: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }, input: ShopProductInput) {
  if (input.categoryId) return input.categoryId;
  if (input.categorySlug) {
    const result = await client.query("SELECT id FROM website.shop_categories WHERE slug=$1", [input.categorySlug]);
    if (result.rows[0]) return Number(result.rows[0].id);
  }
  const fallback = await client.query("SELECT id FROM website.shop_categories ORDER BY sort_order, name LIMIT 1");
  return fallback.rows[0] ? Number(fallback.rows[0].id) : null;
}

function normalizeProductInput(input: ShopProductInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Product name is required.");
  const variants = input.variants.filter((variant) => variant.label.trim()).map((variant, index) => ({ label: variant.label.trim().slice(0, 80), sku: (variant.sku || "").trim().slice(0, 80), priceCents: Math.max(0, Math.floor(variant.priceCents)), inventoryCount: Math.max(0, Math.floor(variant.inventoryCount)), published: variant.published !== false, sortOrder: variant.sortOrder ?? index * 10 }));
  if (!variants.length) throw new Error("Add at least one product option or size.");
  if (variants.some((variant) => variant.priceCents < 100)) throw new Error("Every product option needs a price of at least $1.00.");
  return { ...input, name, variants };
}

export async function saveShopProduct(input: ShopProductInput) {
  const normalized = normalizeProductInput(input);
  await ensureDefaultCategories();
  return withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      const categoryId = await categoryIdForInput(client, normalized);
      let productId = normalized.id;
      if (productId) {
        const current = await client.query("SELECT image_url FROM website.shop_products WHERE id=$1", [productId]);
        if (!current.rows[0]) throw new Error("Product not found.");
        await client.query("UPDATE website.shop_products SET category_id=$2, name=$3, description=$4, image_url=$5, published=$6, featured=$7, sort_order=$8, updated_at=now() WHERE id=$1", [productId, categoryId, normalized.name, normalized.description || "", normalized.imageUrl || current.rows[0].image_url || "", normalized.published !== false, normalized.featured === true, intValue(normalized.sortOrder),]);
        await client.query("DELETE FROM website.shop_product_variants WHERE product_id=$1", [productId]);
      } else {
        const inserted = await client.query("INSERT INTO website.shop_products (slug,category_id,name,description,image_url,published,featured,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [shopSlug(normalized.name), categoryId, normalized.name, normalized.description || "", normalized.imageUrl || "", normalized.published !== false, normalized.featured === true, intValue(normalized.sortOrder)]);
        productId = Number(inserted.rows[0].id);
      }
      for (const variant of normalized.variants) await client.query("INSERT INTO website.shop_product_variants (product_id,label,sku,price_cents,inventory_count,published,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)", [productId, variant.label, variant.sku, variant.priceCents, variant.inventoryCount, variant.published, variant.sortOrder]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
    return getShopCatalog({ manager: true });
  }, { skipSchema: true });
}

export async function deleteShopProduct(id: number) {
  return withDatabase(async (client) => {
    await client.query("DELETE FROM website.shop_products WHERE id=$1", [id]);
    return getShopCatalog({ manager: true });
  });
}

export async function getShopVariantForCheckout(variantId: number) {
  return withDatabase(async (client) => {
    const result = await client.query("SELECT v.*, p.name AS product_name, p.slug AS product_slug, p.published AS product_published, p.description AS product_description FROM website.shop_product_variants v JOIN website.shop_products p ON p.id=v.product_id WHERE v.id=$1", [variantId]);
    const row = result.rows[0];
    if (!row || row.product_published !== true || row.published !== true || Number(row.inventory_count) < 1) throw new Error("That shop item is not available.");
    return { variant: variantFromRow(row), productName: String(row.product_name || ""), productSlug: String(row.product_slug || ""), productDescription: String(row.product_description || "") };
  });
}

export async function recordShopCheckout(input: { stripeSessionId: string; variantId: number; quantity: number; customerEmail?: string; amountCents: number }) {
  const item = await getShopVariantForCheckout(input.variantId);
  return withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      const order = await client.query("INSERT INTO website.shop_orders (stripe_session_id,customer_email,status,amount_total_cents,metadata) VALUES ($1,$2,'pending',$3,$4::jsonb) ON CONFLICT (stripe_session_id) DO UPDATE SET customer_email=EXCLUDED.customer_email, amount_total_cents=EXCLUDED.amount_total_cents RETURNING id", [input.stripeSessionId, input.customerEmail || null, input.amountCents, JSON.stringify({ source: "shop-new" })]);
      await client.query("INSERT INTO website.shop_order_items (order_id,product_id,variant_id,product_name,variant_label,quantity,unit_price_cents) VALUES ($1,$2,$3,$4,$5,$6,$7)", [Number(order.rows[0].id), item.variant.productId, item.variant.id, item.productName, item.variant.label, input.quantity, item.variant.priceCents]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }, { skipSchema: true });
}

export async function markShopOrderPaid(sessionId: string) {
  if (!sessionId) return;
  await withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      const order = await client.query("UPDATE website.shop_orders SET status='paid', paid_at=now(), updated_at=now() WHERE stripe_session_id=$1 RETURNING id", [sessionId]);
      const orderId = order.rows[0]?.id;
      if (orderId) {
        const items = await client.query("SELECT variant_id, quantity FROM website.shop_order_items WHERE order_id=$1", [orderId]);
        for (const item of items.rows) await client.query("UPDATE website.shop_product_variants SET inventory_count=GREATEST(inventory_count-$1,0), updated_at=now() WHERE id=$2", [Number(item.quantity || 0), Number(item.variant_id)]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}
