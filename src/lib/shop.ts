import { randomUUID } from "node:crypto";
import { databaseConfigured, withDatabase } from "@/lib/database";
import { sendMail } from "@/lib/mail";

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
  compareAtPriceCents: number | null;
  inventoryCount: number;
  published: boolean;
  sortOrder: number;
  weightOunces: number;
  requiresShipping: boolean;
  trackInventory: boolean;
  availableForSale: boolean;
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
  imageUrls: string[];
  published: boolean;
  featured: boolean;
  sortOrder: number;
  source: string;
  sourceId: string;
  variants: ShopVariant[];
};

export type ShopSettings = {
  bonusEnabled: boolean;
  bonusThresholdCents: number;
  bonusVariantId: number | null;
  bonusLabel: string;
  orderNotificationEmail: string;
  shippingProvider: string;
  originName: string;
  originStreet1: string;
  originStreet2: string;
  originCity: string;
  originState: string;
  originZip: string;
  originCountry: string;
  originPhone: string;
  parcelLength: number;
  parcelWidth: number;
  parcelHeight: number;
};

export type ShopOrderItem = {
  productName: string;
  variantLabel: string;
  quantity: number;
  unitPriceCents: number;
  isBonus: boolean;
};

export type ShopOrder = {
  id: number;
  stripeSessionId: string;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  status: string;
  subtotalCents: number;
  shippingCents: number;
  amountTotalCents: number;
  shippingProvider: string;
  shippingService: string;
  shippingRateId: string;
  shippingAddress: Record<string, unknown>;
  isTestOrder: boolean;
  notificationSentAt: string;
  customerAcknowledgementSentAt: string;
  shipmentTrackingUrl: string;
  shipmentNote: string;
  shipmentEmailSentAt: string;
  shippedAt: string;
  createdAt: string;
  paidAt: string;
  items: ShopOrderItem[];
};

export type ShopCatalog = {
  categories: ShopCategory[];
  products: ShopProduct[];
  settings?: ShopSettings;
  orders?: ShopOrder[];
};

export type ShopVariantInput = {
  label: string;
  sku?: string;
  priceCents: number;
  compareAtPriceCents?: number | null;
  inventoryCount: number;
  published?: boolean;
  sortOrder?: number;
  weightOunces?: number;
  requiresShipping?: boolean;
  trackInventory?: boolean;
  availableForSale?: boolean;
};

export type ShopProductInput = {
  id?: number;
  categoryId?: number | null;
  categorySlug?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  imageUrls?: string[];
  published?: boolean;
  featured?: boolean;
  sortOrder?: number;
  source?: string;
  sourceId?: string;
  variants: ShopVariantInput[];
};

export type ShopCartRequestItem = { variantId: number; quantity: number };

export type ShopCartItem = {
  variantId: number;
  productId: number;
  productName: string;
  variantLabel: string;
  imageUrl: string;
  unitPriceCents: number;
  quantity: number;
  weightOunces: number;
  requiresShipping: boolean;
  isBonus: boolean;
};

export type PreparedShopCart = {
  items: ShopCartItem[];
  merchandiseItems: ShopCartItem[];
  bonusItem: ShopCartItem | null;
  subtotalCents: number;
  shippingWeightOunces: number;
  requiresShipping: boolean;
  settings: ShopSettings;
};

const defaultCategories = ["Apparel", "Signs", "Glassware", "Gift Cards", "Beverages", "Event Payments", "Other"];

export function shopSlug(value: string) {
  return value.toLowerCase().trim().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || randomUUID().slice(0, 8);
}

export function dollarsToCents(value: unknown) {
  const number = typeof value === "number" ? value : Number(String(value || "").replace(/[$,]/g, ""));
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number * 100);
}

export function shopVariantAvailable(variant: Pick<ShopVariant, "published" | "trackInventory" | "inventoryCount" | "availableForSale">) {
  return variant.published && variant.availableForSale && (!variant.trackInventory || variant.inventoryCount > 0);
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

function decimalValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function categoryFromRow(row: Record<string, unknown>): ShopCategory {
  return { id: Number(row.id), slug: String(row.slug || ""), name: String(row.name || ""), description: String(row.description || ""), sortOrder: Number(row.sort_order || 0), published: row.published !== false };
}

function variantFromRow(row: Record<string, unknown>): ShopVariant {
  return {
    id: Number(row.id),
    productId: Number(row.product_id),
    label: String(row.label || ""),
    sku: String(row.sku || ""),
    priceCents: Number(row.price_cents || 0),
    compareAtPriceCents: row.compare_at_price_cents === null || row.compare_at_price_cents === undefined ? null : Number(row.compare_at_price_cents),
    inventoryCount: Number(row.inventory_count || 0),
    published: row.published !== false,
    sortOrder: Number(row.sort_order || 0),
    weightOunces: Number(row.weight_ounces || 0),
    requiresShipping: row.requires_shipping !== false,
    trackInventory: row.track_inventory !== false,
    availableForSale: row.available_for_sale !== false,
  };
}

function normalizeShopImageUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/api/shop-product-images/")) return raw;
  if (raw.startsWith("/media/shop-products/") || raw.startsWith("/public/media/shop-products/")) return "/api/shop-product-images/" + encodeURIComponent(raw.split("/").filter(Boolean).pop() || "");
  try {
    const url = new URL(raw);
    if (url.pathname.includes("/media/shop-products/") || url.pathname.includes("/shop-product-images/")) return "/api/shop-product-images/" + encodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
  } catch {}
  return raw;
}

function normalizeShopImageUrls(values: unknown[]) {
  return values.map(normalizeShopImageUrl).filter((value, index, all) => value && all.indexOf(value) === index);
}

function settingsFromRow(row: Record<string, unknown> | undefined): ShopSettings {
  return {
    bonusEnabled: row?.bonus_enabled !== false,
    bonusThresholdCents: Number(row?.bonus_threshold_cents || 2000),
    bonusVariantId: row?.bonus_variant_id === null || row?.bonus_variant_id === undefined ? null : Number(row.bonus_variant_id),
    bonusLabel: String(row?.bonus_label || "Free Aviator sticker"),
    orderNotificationEmail: String(row?.order_notification_email || "orders@aviatorbrew.com"),
    shippingProvider: String(row?.shipping_provider || "easypost"),
    originName: String(row?.origin_name || "Aviator Brewing Company"),
    originStreet1: String(row?.origin_street1 || "688 Brewing Drive"),
    originStreet2: String(row?.origin_street2 || ""),
    originCity: String(row?.origin_city || "Fuquay-Varina"),
    originState: String(row?.origin_state || "NC"),
    originZip: String(row?.origin_zip || "27526"),
    originCountry: String(row?.origin_country || "US"),
    originPhone: String(row?.origin_phone || "9195672337"),
    parcelLength: Number(row?.parcel_length || 12),
    parcelWidth: Number(row?.parcel_width || 10),
    parcelHeight: Number(row?.parcel_height || 6),
  };
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

async function getShopSettingsWithClient(client: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }) {
  const result = await client.query("SELECT * FROM website.shop_settings WHERE id=1");
  return settingsFromRow(result.rows[0]);
}

export async function getShopCatalog(options: { manager?: boolean; orderStart?: string; orderEnd?: string } = {}): Promise<ShopCatalog> {
  if (!databaseConfigured()) return { categories: [], products: [], settings: settingsFromRow(undefined), orders: [] };
  await ensureDefaultCategories();
  return withDatabase(async (client) => {
    const categoryResult = await client.query("SELECT * FROM website.shop_categories " + (options.manager ? "" : "WHERE published=true ") + "ORDER BY sort_order, name");
    const productResult = await client.query("SELECT p.*, c.slug AS category_slug, c.name AS category_name FROM website.shop_products p LEFT JOIN website.shop_categories c ON c.id=p.category_id " + (options.manager ? "" : "WHERE p.published=true ") + "ORDER BY COALESCE(c.sort_order, 9999), c.name NULLS LAST, p.sort_order, p.name");
    const productIds = productResult.rows.map((row) => Number(row.id));
    const variantResult = productIds.length ? await client.query("SELECT * FROM website.shop_product_variants WHERE product_id=ANY($1::bigint[]) " + (options.manager ? "" : "AND published=true ") + "ORDER BY sort_order, label", [productIds]) : { rows: [] as Record<string, unknown>[] };
    const variantsByProduct = new Map<number, ShopVariant[]>();
    for (const row of variantResult.rows) {
      const variant = variantFromRow(row);
      variantsByProduct.set(variant.productId, [...(variantsByProduct.get(variant.productId) || []), variant]);
    }
    const products = productResult.rows.map((row) => {
      const additional = Array.isArray(row.additional_image_urls) ? row.additional_image_urls.map(String) : [];
      const imageUrl = normalizeShopImageUrl(row.image_url);
      const imageUrls = normalizeShopImageUrls([imageUrl, ...additional]);
      return {
        id: Number(row.id),
        slug: String(row.slug || ""),
        categoryId: row.category_id === null ? null : Number(row.category_id),
        categorySlug: String(row.category_slug || "uncategorized"),
        categoryName: String(row.category_name || "Uncategorized"),
        name: String(row.name || ""),
        description: String(row.description || ""),
        imageUrl,
        imageUrls,
        published: row.published !== false,
        featured: row.featured === true,
        sortOrder: Number(row.sort_order || 0),
        source: String(row.source || "manager"),
        sourceId: String(row.source_id || ""),
        variants: variantsByProduct.get(Number(row.id)) || [],
      };
    }).filter((product) => options.manager || product.variants.length > 0);
    const settings = await getShopSettingsWithClient(client);
    let orders: ShopOrder[] | undefined;
    if (options.manager) {
      const filters: string[] = [];
      const values: unknown[] = [];
      const start = options.orderStart ? new Date(options.orderStart + "T00:00:00") : null;
      const end = options.orderEnd ? new Date(options.orderEnd + "T23:59:59.999") : null;
      if (start && Number.isFinite(start.getTime())) { values.push(start.toISOString()); filters.push("o.created_at >= $" + values.length); }
      if (end && Number.isFinite(end.getTime())) { values.push(end.toISOString()); filters.push("o.created_at <= $" + values.length); }
      const where = filters.length ? " WHERE " + filters.join(" AND ") : "";
      const orderResult = await client.query(`SELECT o.*, COALESCE(jsonb_agg(jsonb_build_object('productName',i.product_name,'variantLabel',i.variant_label,'quantity',i.quantity,'unitPriceCents',i.unit_price_cents,'isBonus',i.is_bonus) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL),'[]'::jsonb) AS items FROM website.shop_orders o LEFT JOIN website.shop_order_items i ON i.order_id=o.id${where} GROUP BY o.id ORDER BY o.created_at DESC LIMIT 500`, values);
      orders = orderResult.rows.map((row) => ({
        id: Number(row.id),
        stripeSessionId: String(row.stripe_session_id || ""),
        customerEmail: String(row.customer_email || ""),
        customerName: String(row.customer_name || ""),
        customerPhone: String(row.customer_phone || ""),
        status: String(row.status || ""),
        subtotalCents: Number(row.subtotal_cents || 0),
        shippingCents: Number(row.shipping_cents || 0),
        amountTotalCents: Number(row.amount_total_cents || 0),
        shippingProvider: String(row.shipping_provider || ""),
        shippingService: String(row.shipping_service || ""),
        shippingRateId: String(row.shipping_rate_id || ""),
        shippingAddress: row.shipping_address && typeof row.shipping_address === "object" ? row.shipping_address as Record<string, unknown> : {},
        isTestOrder: row.is_test_order === true,
        notificationSentAt: String(row.notification_sent_at || ""),
        customerAcknowledgementSentAt: String(row.customer_acknowledgement_sent_at || ""),
        shipmentTrackingUrl: String(row.shipment_tracking_url || ""),
        shipmentNote: String(row.shipment_note || ""),
        shipmentEmailSentAt: String(row.shipment_email_sent_at || ""),
        shippedAt: String(row.shipped_at || ""),
        createdAt: String(row.created_at || ""),
        paidAt: String(row.paid_at || ""),
        items: Array.isArray(row.items) ? row.items as ShopOrderItem[] : [],
      }));
    }
    return { categories: categoryResult.rows.map(categoryFromRow), products, settings, orders };
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
  const variants = input.variants.filter((variant) => variant.label.trim()).map((variant, index) => ({
    label: variant.label.trim().slice(0, 80),
    sku: (variant.sku || "").trim().slice(0, 80),
    priceCents: Math.max(0, Math.floor(variant.priceCents)),
    compareAtPriceCents: variant.compareAtPriceCents ? Math.max(0, Math.floor(variant.compareAtPriceCents)) : null,
    inventoryCount: Math.max(0, Math.floor(variant.inventoryCount)),
    published: variant.published !== false,
    sortOrder: variant.sortOrder ?? index * 10,
    weightOunces: Math.max(.1, decimalValue(variant.weightOunces, 8)),
    requiresShipping: variant.requiresShipping !== false,
    trackInventory: variant.trackInventory !== false,
    availableForSale: variant.availableForSale !== false,
  }));
  if (!variants.length) throw new Error("Add at least one product option or size.");
  if (variants.some((variant) => variant.priceCents < 100)) throw new Error("Every product option needs a price of at least $1.00.");
  return { ...input, name, variants };
}

function productImagesForSave(input: ShopProductInput, current?: Record<string, unknown>) {
  const currentAdditional = Array.isArray(current?.additional_image_urls) ? current.additional_image_urls : [];
  const submitted = normalizeShopImageUrls([...(input.imageUrls || []), input.imageUrl || ""]);
  const fallback = normalizeShopImageUrls([current?.image_url || "", ...currentAdditional]);
  const images = input.imageUrls ? submitted : submitted.length ? submitted : fallback;
  const primary = normalizeShopImageUrl(input.imageUrl) || images[0] || "";
  const ordered = normalizeShopImageUrls([primary, ...images]);
  return { primary: ordered[0] || "", additional: ordered.slice(1) };
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
        const current = await client.query("SELECT image_url,additional_image_urls,source,source_id FROM website.shop_products WHERE id=$1", [productId]);
        if (!current.rows[0]) throw new Error("Product not found.");
        const images = productImagesForSave(normalized, current.rows[0]);
        await client.query("UPDATE website.shop_products SET category_id=$2, name=$3, description=$4, image_url=$5, additional_image_urls=$6::jsonb, published=$7, featured=$8, sort_order=$9, source=$10, source_id=$11, updated_at=now() WHERE id=$1", [productId, categoryId, normalized.name, normalized.description || "", images.primary, JSON.stringify(images.additional), normalized.published !== false, normalized.featured === true, intValue(normalized.sortOrder), normalized.source || current.rows[0].source || "manager", normalized.sourceId || current.rows[0].source_id || null]);
        await client.query("DELETE FROM website.shop_product_variants WHERE product_id=$1", [productId]);
      } else {
        const images = productImagesForSave(normalized);
        const inserted = await client.query("INSERT INTO website.shop_products (slug,category_id,name,description,image_url,additional_image_urls,published,featured,sort_order,source,source_id) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING id", [shopSlug(normalized.name), categoryId, normalized.name, normalized.description || "", images.primary, JSON.stringify(images.additional), normalized.published !== false, normalized.featured === true, intValue(normalized.sortOrder), normalized.source || "manager", normalized.sourceId || null]);
        productId = Number(inserted.rows[0].id);
      }
      for (const variant of normalized.variants) await client.query("INSERT INTO website.shop_product_variants (product_id,label,sku,price_cents,compare_at_price_cents,inventory_count,published,sort_order,weight_ounces,requires_shipping,track_inventory,available_for_sale) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", [productId, variant.label, variant.sku, variant.priceCents, variant.compareAtPriceCents, variant.inventoryCount, variant.published, variant.sortOrder, variant.weightOunces, variant.requiresShipping, variant.trackInventory, variant.availableForSale]);
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

export async function saveShopSettings(input: Partial<ShopSettings>) {
  return withDatabase(async (client) => {
    const current = await getShopSettingsWithClient(client);
    const next = { ...current, ...input };
    const orderNotificationEmail = next.orderNotificationEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(orderNotificationEmail)) throw new Error("Enter a valid shop order notification email.");
    await client.query(`UPDATE website.shop_settings SET bonus_enabled=$1,bonus_threshold_cents=$2,bonus_variant_id=$3,bonus_label=$4,shipping_provider='easypost',origin_name=$5,origin_street1=$6,origin_street2=$7,origin_city=$8,origin_state=$9,origin_zip=$10,origin_country=$11,origin_phone=$12,parcel_length=$13,parcel_width=$14,parcel_height=$15,order_notification_email=$16,updated_at=now() WHERE id=1`, [
      next.bonusEnabled, intValue(next.bonusThresholdCents, 2000), next.bonusVariantId || null, next.bonusLabel.trim() || "Free Aviator sticker", next.originName.trim(), next.originStreet1.trim(), next.originStreet2.trim(), next.originCity.trim(), next.originState.trim().toUpperCase(), next.originZip.trim(), next.originCountry.trim().toUpperCase() || "US", next.originPhone.trim(), decimalValue(next.parcelLength, 12), decimalValue(next.parcelWidth, 10), decimalValue(next.parcelHeight, 6), orderNotificationEmail,
    ]);
    return getShopCatalog({ manager: true });
  });
}

function normalizeCartRequests(items: ShopCartRequestItem[]) {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw new Error("Your cart is empty or too large.");
  const combined = new Map<number, number>();
  for (const raw of items) {
    const variantId = Number(raw.variantId);
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(variantId) || variantId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 25) throw new Error("Choose valid shop items and quantities.");
    combined.set(variantId, (combined.get(variantId) || 0) + quantity);
  }
  if ([...combined.values()].some((quantity) => quantity > 25)) throw new Error("A cart option is over the 25 item limit.");
  return [...combined].map(([variantId, quantity]) => ({ variantId, quantity }));
}

export async function prepareShopCart(rawItems: ShopCartRequestItem[]): Promise<PreparedShopCart> {
  const requests = normalizeCartRequests(rawItems);
  return withDatabase(async (client) => {
    const ids = requests.map((item) => item.variantId);
    const result = await client.query("SELECT v.*,p.name AS product_name,p.image_url,p.published AS product_published FROM website.shop_product_variants v JOIN website.shop_products p ON p.id=v.product_id WHERE v.id=ANY($1::bigint[])", [ids]);
    const rows = new Map(result.rows.map((row) => [Number(row.id), row]));
    const merchandiseItems = requests.map((request) => {
      const row = rows.get(request.variantId);
      if (!row || row.product_published !== true) throw new Error("A product in your cart is no longer available.");
      const variant = variantFromRow(row);
      if (!shopVariantAvailable(variant)) throw new Error(String(row.product_name || "An item") + " - " + variant.label + " is sold out.");
      if (variant.trackInventory && request.quantity > variant.inventoryCount) throw new Error("Only " + variant.inventoryCount + " of " + String(row.product_name || "that item") + " - " + variant.label + " are available.");
      return {
        variantId: variant.id,
        productId: variant.productId,
        productName: String(row.product_name || ""),
        variantLabel: variant.label,
        imageUrl: normalizeShopImageUrl(row.image_url),
        unitPriceCents: variant.priceCents,
        quantity: request.quantity,
        weightOunces: variant.weightOunces,
        requiresShipping: variant.requiresShipping,
        isBonus: false,
      } satisfies ShopCartItem;
    });
    const subtotalCents = merchandiseItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    const settings = await getShopSettingsWithClient(client);
    let bonusItem: ShopCartItem | null = null;
    if (settings.bonusEnabled && settings.bonusVariantId && subtotalCents > settings.bonusThresholdCents) {
      const bonusResult = await client.query("SELECT v.*,p.name AS product_name,p.image_url,p.published AS product_published FROM website.shop_product_variants v JOIN website.shop_products p ON p.id=v.product_id WHERE v.id=$1", [settings.bonusVariantId]);
      const row = bonusResult.rows[0];
      if (row && row.product_published === true) {
        const variant = variantFromRow(row);
        if (shopVariantAvailable(variant)) bonusItem = {
          variantId: variant.id,
          productId: variant.productId,
          productName: settings.bonusLabel,
          variantLabel: variant.label,
          imageUrl: normalizeShopImageUrl(row.image_url),
          unitPriceCents: 0,
          quantity: 1,
          weightOunces: variant.weightOunces,
          requiresShipping: variant.requiresShipping,
          isBonus: true,
        };
      }
    }
    const items = bonusItem ? [...merchandiseItems, bonusItem] : merchandiseItems;
    const shippingItems = items.filter((item) => item.requiresShipping);
    return {
      items,
      merchandiseItems,
      bonusItem,
      subtotalCents,
      shippingWeightOunces: Math.max(.1, shippingItems.reduce((sum, item) => sum + item.weightOunces * item.quantity, 0)),
      requiresShipping: shippingItems.length > 0,
      settings,
    };
  });
}

export async function recordShopCheckout(input: {
  stripeSessionId: string;
  cart: PreparedShopCart;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  shippingCents: number;
  shippingAddress?: Record<string, string>;
  shippingProvider?: string;
  shippingService?: string;
  shippingRateId?: string;
}) {
  return withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      const total = input.cart.subtotalCents + input.shippingCents;
      const order = await client.query("INSERT INTO website.shop_orders (stripe_session_id,customer_email,customer_name,customer_phone,status,amount_total_cents,subtotal_cents,shipping_cents,shipping_address,shipping_provider,shipping_service,shipping_rate_id,metadata) VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb) ON CONFLICT (stripe_session_id) DO UPDATE SET customer_email=EXCLUDED.customer_email,customer_name=EXCLUDED.customer_name,customer_phone=EXCLUDED.customer_phone,amount_total_cents=EXCLUDED.amount_total_cents,subtotal_cents=EXCLUDED.subtotal_cents,shipping_cents=EXCLUDED.shipping_cents,shipping_address=EXCLUDED.shipping_address,shipping_provider=EXCLUDED.shipping_provider,shipping_service=EXCLUDED.shipping_service,shipping_rate_id=EXCLUDED.shipping_rate_id RETURNING id", [input.stripeSessionId, input.customerEmail || null, input.customerName || null, input.customerPhone || null, total, input.cart.subtotalCents, input.shippingCents, JSON.stringify(input.shippingAddress || {}), input.shippingProvider || null, input.shippingService || null, input.shippingRateId || null, JSON.stringify({ source: "shop-new", bonusApplied: Boolean(input.cart.bonusItem) })]);
      const orderId = Number(order.rows[0].id);
      await client.query("DELETE FROM website.shop_order_items WHERE order_id=$1", [orderId]);
      for (const item of input.cart.items) await client.query("INSERT INTO website.shop_order_items (order_id,product_id,variant_id,product_name,variant_label,quantity,unit_price_cents,is_bonus) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [orderId, item.productId, item.variantId, item.productName, item.variantLabel, item.quantity, item.unitPriceCents, item.isBonus]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }, { skipSchema: true });
}

type ShopOrderNotificationJob = {
  complete: false;
  orderId: number;
  recipient: string;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  stripeSessionId: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  shippingService: string;
  shippingAddress: Record<string, unknown>;
  isTestOrder: boolean;
  items: ShopOrderItem[];
} | { complete: true };

function shopOrderMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function shopOrderAddress(address: Record<string, unknown>) {
  return [
    String(address.name || ""),
    String(address.street1 || ""),
    String(address.street2 || ""),
    [String(address.city || ""), String(address.state || ""), String(address.zip || "")].filter(Boolean).join(" "),
    String(address.country || ""),
  ].filter(Boolean).join("\n");
}

function validShopEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value);
}

function shopOrderItemLines(items: ShopOrderItem[]) {
  return items.map((item) => "- " + item.quantity + " x " + item.productName + " / " + item.variantLabel + " - " + (item.isBonus ? "FREE BONUS" : shopOrderMoney(item.unitPriceCents * item.quantity)));
}

function shopOrderHtmlList(items: ShopOrderItem[]) {
  return items.map((item) => "<li>" + item.quantity + " x " + item.productName + " / " + item.variantLabel + " - " + (item.isBonus ? "FREE BONUS" : shopOrderMoney(item.unitPriceCents * item.quantity)) + "</li>").join("");
}

async function sendShopCustomerOrderAcknowledgement(job: Exclude<ShopOrderNotificationJob, { complete: true }>) {
  if (!validShopEmail(job.customerEmail)) return true;
  const itemLines = shopOrderItemLines(job.items);
  const text = [
    job.isTestOrder ? "Aviator Shop test order received" : "Aviator Shop order received",
    "",
    "Order: #" + job.orderId,
    "",
    "Thanks" + (job.customerName ? ", " + job.customerName : "") + ". We received your order and the Aviator team has it in the fulfillment queue.",
    "",
    "Items:",
    ...itemLines,
    "",
    "Merchandise: " + shopOrderMoney(job.subtotalCents),
    "Shipping: " + shopOrderMoney(job.shippingCents),
    "Order total: " + shopOrderMoney(job.totalCents),
    "",
    job.isTestOrder ? "This is a manager test order. No payment was collected." : "We will send another email when your order ships.",
  ].join("\n");
  const html = "<!doctype html><html><body style=\"margin:0;background:#eef2f3;padding:28px 14px;font-family:Arial,sans-serif;color:#10243a\"><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\"><tr><td align=\"center\"><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:640px;background:#fff;border:1px solid #d5dfe3\"><tr><td style=\"padding:28px 32px;background:#102b3e;color:#fff\"><div style=\"color:#efb45f;font-size:12px;font-weight:800;text-transform:uppercase\">Aviator Shop</div><h1 style=\"margin:10px 0 0;font-size:28px\">" + (job.isTestOrder ? "Test order received" : "Order received") + "</h1></td></tr><tr><td style=\"padding:28px 32px\"><p style=\"font-size:16px;line-height:1.6\">Thanks" + (job.customerName ? ", " + job.customerName : "") + ". We received order #" + job.orderId + " and the Aviator team has it in the fulfillment queue.</p><ul style=\"line-height:1.8\">" + shopOrderHtmlList(job.items) + "</ul><p><strong>Merchandise:</strong> " + shopOrderMoney(job.subtotalCents) + "<br><strong>Shipping:</strong> " + shopOrderMoney(job.shippingCents) + "<br><strong>Total:</strong> " + shopOrderMoney(job.totalCents) + "</p><p style=\"color:#637783\">" + (job.isTestOrder ? "This is a manager test order. No payment was collected." : "We will send another email when your order ships.") + "</p></td></tr></table></td></tr></table></body></html>";
  const sent = await sendMail({ to: job.customerEmail, subject: (job.isTestOrder ? "TEST - " : "") + "Aviator Shop order #" + job.orderId + " received", text, html });
  if (!sent) return false;
  await withDatabase(async (client) => client.query("UPDATE website.shop_orders SET customer_acknowledgement_sent_at=COALESCE(customer_acknowledgement_sent_at,now()),updated_at=now() WHERE id=$1", [job.orderId]), { skipSchema: true });
  return true;
}

async function shopOrderEmailJobById(orderId: number): Promise<Exclude<ShopOrderNotificationJob, { complete: true }> | null> {
  return withDatabase(async (client) => {
    const order = await client.query("SELECT o.*,s.order_notification_email FROM website.shop_orders o CROSS JOIN website.shop_settings s WHERE o.id=$1 AND s.id=1", [orderId]);
    const row = order.rows[0];
    if (!row) return null;
    const itemResult = await client.query("SELECT product_name,variant_label,quantity,unit_price_cents,is_bonus FROM website.shop_order_items WHERE order_id=$1 ORDER BY id", [orderId]);
    const shippingAddress = row.shipping_address && typeof row.shipping_address === "object" ? row.shipping_address as Record<string, unknown> : {};
    return {
      complete: false,
      orderId: Number(row.id),
      recipient: String(row.order_notification_email || "orders@aviatorbrew.com"),
      customerEmail: String(row.customer_email || ""),
      customerName: String(row.customer_name || ""),
      customerPhone: String(row.customer_phone || ""),
      stripeSessionId: String(row.stripe_session_id || ""),
      subtotalCents: Number(row.subtotal_cents || 0),
      shippingCents: Number(row.shipping_cents || 0),
      totalCents: Number(row.amount_total_cents || 0),
      shippingService: String(row.shipping_service || ""),
      shippingAddress,
      isTestOrder: row.is_test_order === true,
      items: itemResult.rows.map((item) => ({
        productName: String(item.product_name || ""),
        variantLabel: String(item.variant_label || ""),
        quantity: Number(item.quantity || 0),
        unitPriceCents: Number(item.unit_price_cents || 0),
        isBonus: item.is_bonus === true,
      })),
    };
  }, { skipSchema: true });
}

async function sendShopOrderBackendNotification(job: Exclude<ShopOrderNotificationJob, { complete: true }>) {
  const itemLines = shopOrderItemLines(job.items);
  const address = shopOrderAddress(job.shippingAddress);
  const text = [
    job.isTestOrder ? "TEST ShopNew order" : "New paid ShopNew order",
    "",
    "Order: #" + job.orderId,
    "Stripe session: " + (job.stripeSessionId || "No Stripe session"),
    "",
    "Customer: " + (job.customerName || "Guest"),
    "Email: " + (job.customerEmail || "Not provided"),
    "Phone: " + (job.customerPhone || "Not provided"),
    "",
    "Ship to:",
    address || "No shipping address",
    "Service: " + (job.shippingService || "Not selected"),
    "",
    "Items:",
    ...itemLines,
    "",
    "Merchandise: " + shopOrderMoney(job.subtotalCents),
    "Shipping: " + shopOrderMoney(job.shippingCents),
    "Order total: " + shopOrderMoney(job.totalCents),
    job.isTestOrder ? "" : "",
    job.isTestOrder ? "MANAGER TEST ORDER - no payment was collected and inventory was not reduced." : "",
  ].filter((line, index, all) => line || all[index - 1] !== "").join("\n");
  const sent = await sendMail({
    to: job.recipient,
    subject: (job.isTestOrder ? "TEST ShopNew order #" : "Paid ShopNew order #") + job.orderId + " - " + shopOrderMoney(job.totalCents),
    text,
    replyTo: validShopEmail(job.customerEmail) ? job.customerEmail : undefined,
  });
  if (!sent) throw new Error("Shop order email is not configured.");
  await withDatabase(async (client) => client.query("UPDATE website.shop_orders SET notification_sent_at=COALESCE(notification_sent_at,now()),notification_claimed_at=NULL,updated_at=now() WHERE id=$1", [job.orderId]), { skipSchema: true });
  return true;
}

export async function markShopOrderPaid(sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  const job = await withDatabase(async (client): Promise<ShopOrderNotificationJob | null> => {
    await client.query("BEGIN");
    try {
      const newlyPaid = await client.query("UPDATE website.shop_orders SET status='paid', paid_at=COALESCE(paid_at,now()), updated_at=now() WHERE stripe_session_id=$1 AND status <> 'paid' RETURNING id", [sessionId]);
      const order = await client.query("SELECT o.*,s.order_notification_email FROM website.shop_orders o CROSS JOIN website.shop_settings s WHERE o.stripe_session_id=$1 AND s.id=1 FOR UPDATE OF o", [sessionId]);
      const row = order.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return null;
      }
      const orderId = Number(row.id);
      if (newlyPaid.rows[0]?.id) {
        const inventoryItems = await client.query("SELECT variant_id,quantity FROM website.shop_order_items WHERE order_id=$1", [orderId]);
        for (const item of inventoryItems.rows) await client.query("UPDATE website.shop_product_variants SET inventory_count=GREATEST(inventory_count-$1,0),available_for_sale=CASE WHEN track_inventory AND GREATEST(inventory_count-$1,0)=0 THEN false ELSE available_for_sale END,updated_at=now() WHERE id=$2 AND track_inventory=true", [Number(item.quantity || 0), Number(item.variant_id)]);
      }
      if (row.notification_sent_at) {
        await client.query("COMMIT");
        return { complete: true };
      }
      const claimed = await client.query("UPDATE website.shop_orders SET notification_claimed_at=now(),updated_at=now() WHERE id=$1 AND notification_sent_at IS NULL AND (notification_claimed_at IS NULL OR notification_claimed_at < now()-interval '10 minutes') RETURNING id", [orderId]);
      if (!claimed.rows[0]) {
        await client.query("COMMIT");
        return { complete: true };
      }
      const itemResult = await client.query("SELECT product_name,variant_label,quantity,unit_price_cents,is_bonus FROM website.shop_order_items WHERE order_id=$1 ORDER BY id", [orderId]);
      await client.query("COMMIT");
      const shippingAddress = row.shipping_address && typeof row.shipping_address === "object" ? row.shipping_address as Record<string, unknown> : {};
      return {
        complete: false,
        orderId,
        recipient: String(row.order_notification_email || "orders@aviatorbrew.com"),
        customerEmail: String(row.customer_email || ""),
        customerName: String(row.customer_name || ""),
        customerPhone: String(row.customer_phone || ""),
        stripeSessionId: String(row.stripe_session_id || ""),
        subtotalCents: Number(row.subtotal_cents || 0),
        shippingCents: Number(row.shipping_cents || 0),
        totalCents: Number(row.amount_total_cents || 0),
        shippingService: String(row.shipping_service || ""),
        shippingAddress,
        isTestOrder: row.is_test_order === true,
        items: itemResult.rows.map((item) => ({
          productName: String(item.product_name || ""),
          variantLabel: String(item.variant_label || ""),
          quantity: Number(item.quantity || 0),
          unitPriceCents: Number(item.unit_price_cents || 0),
          isBonus: item.is_bonus === true,
        })),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });

  if (!job) return false;
  if (job.complete) return true;
  const itemLines = job.items.map((item) => "- " + item.quantity + " x " + item.productName + " / " + item.variantLabel + " - " + (item.isBonus ? "FREE BONUS" : shopOrderMoney(item.unitPriceCents * item.quantity)));
  const address = shopOrderAddress(job.shippingAddress);
  const text = [
    "New paid ShopNew order",
    "",
    "Order: #" + job.orderId,
    "Stripe session: " + job.stripeSessionId,
    "",
    "Customer: " + (job.customerName || "Guest"),
    "Email: " + (job.customerEmail || "Not provided"),
    "Phone: " + (job.customerPhone || "Not provided"),
    "",
    "Ship to:",
    address || "No shipping address",
    "Service: " + (job.shippingService || "Not selected"),
    "",
    "Items:",
    ...itemLines,
    "",
    "Merchandise: " + shopOrderMoney(job.subtotalCents),
    "Shipping: " + shopOrderMoney(job.shippingCents),
    "Order total: " + shopOrderMoney(job.totalCents),
  ].join("\n");

  try {
    const sent = await sendMail({
      to: job.recipient,
      subject: "Paid ShopNew order #" + job.orderId + " - " + shopOrderMoney(job.totalCents),
      text,
      replyTo: /^\S+@\S+\.\S+$/.test(job.customerEmail) ? job.customerEmail : undefined,
    });
    if (!sent) throw new Error("Shop order email is not configured.");
    await withDatabase(async (client) => {
      await client.query("UPDATE website.shop_orders SET notification_sent_at=now(),updated_at=now() WHERE id=$1 AND notification_sent_at IS NULL", [job.orderId]);
    }, { skipSchema: true });
    await sendShopCustomerOrderAcknowledgement(job);
    return true;
  } catch (error) {
    console.error("shop.order_notification_failed", error instanceof Error ? error.message : "unknown error");
    await withDatabase(async (client) => {
      await client.query("UPDATE website.shop_orders SET notification_claimed_at=NULL,updated_at=now() WHERE id=$1 AND notification_sent_at IS NULL", [job.orderId]);
    }, { skipSchema: true }).catch(() => undefined);
    return false;
  }
}


function cleanShopText(value: unknown, max = 500) {
  return typeof value === "string" ? value.replace(/\0/g, "").trim().slice(0, max) : "";
}

export async function createManagerShopTestOrder(input: { customerEmail: string; customerName?: string; customerPhone?: string; variantId?: number; quantity?: number }) {
  const customerEmail = cleanShopText(input.customerEmail, 160).toLowerCase();
  if (!validShopEmail(customerEmail)) throw new Error("Enter a valid customer email for the test order.");
  const quantity = Math.max(1, Math.min(10, Math.floor(Number(input.quantity || 1))));
  const variantId = await withDatabase(async (client) => {
    if (input.variantId && Number.isInteger(input.variantId) && input.variantId > 0) return input.variantId;
    const result = await client.query("SELECT v.id FROM website.shop_product_variants v JOIN website.shop_products p ON p.id=v.product_id WHERE p.published=true AND v.published=true AND v.available_for_sale=true ORDER BY p.featured DESC, p.sort_order, p.name, v.sort_order LIMIT 1");
    return Number(result.rows[0]?.id || 0);
  }, { skipSchema: true });
  if (!variantId) throw new Error("Add at least one published shop product option before creating a test order.");
  const cart = await prepareShopCart([{ variantId, quantity }]);
  const customerName = cleanShopText(input.customerName, 140) || "Aviator Test Customer";
  const customerPhone = cleanShopText(input.customerPhone, 40);
  const stripeSessionId = "manager-test-" + Date.now().toString(36) + "-" + randomUUID();
  const shippingAddress = { name: customerName, street1: "688 Brewing Drive", street2: "", city: "Fuquay-Varina", state: "NC", zip: "27526", country: "US", phone: customerPhone };
  const orderId = await withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      const order = await client.query(
        "INSERT INTO website.shop_orders (stripe_session_id,customer_email,customer_name,customer_phone,status,amount_total_cents,subtotal_cents,shipping_cents,shipping_address,shipping_provider,shipping_service,shipping_rate_id,is_test_order,paid_at,metadata) VALUES ($1,$2,$3,$4,'test',$5,$6,0,$7::jsonb,'manager','Test order','manager-test',true,now(),$8::jsonb) RETURNING id",
        [stripeSessionId, customerEmail, customerName, customerPhone || null, cart.subtotalCents, cart.subtotalCents, JSON.stringify(shippingAddress), JSON.stringify({ source: "manager-test-order", bonusApplied: Boolean(cart.bonusItem) })],
      );
      const id = Number(order.rows[0].id);
      for (const item of cart.items) await client.query("INSERT INTO website.shop_order_items (order_id,product_id,variant_id,product_name,variant_label,quantity,unit_price_cents,is_bonus) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [id, item.productId, item.variantId, item.productName, item.variantLabel, item.quantity, item.unitPriceCents, item.isBonus]);
      await client.query("COMMIT");
      return id;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }, { skipSchema: true });
  const job = await shopOrderEmailJobById(orderId);
  if (!job) throw new Error("Test order was created, but could not be loaded for email testing.");
  await sendShopOrderBackendNotification(job);
  await sendShopCustomerOrderAcknowledgement(job);
  return getShopCatalog({ manager: true });
}

export async function updateShopOrder(input: { id: number; customerName?: string; customerEmail?: string; customerPhone?: string; status?: string; shippingService?: string; shippingTrackingUrl?: string; shipmentNote?: string }) {
  const id = Math.floor(Number(input.id || 0));
  if (!id) throw new Error("Choose a valid order.");
  const status = cleanShopText(input.status, 40).toLowerCase() || "pending";
  const allowedStatuses = new Set(["pending", "paid", "test", "processing", "shipped", "cancelled", "refunded"]);
  if (!allowedStatuses.has(status)) throw new Error("Choose a valid order status.");
  const customerEmail = cleanShopText(input.customerEmail, 160).toLowerCase();
  if (customerEmail && !validShopEmail(customerEmail)) throw new Error("Enter a valid customer email.");
  await withDatabase(async (client) => client.query(
    "UPDATE website.shop_orders SET customer_name=$2, customer_email=$3, customer_phone=$4, status=$5, shipping_service=$6, shipment_tracking_url=$7, shipment_note=$8, shipped_at=CASE WHEN $5='shipped' THEN COALESCE(shipped_at,now()) ELSE shipped_at END, updated_at=now() WHERE id=$1",
    [id, cleanShopText(input.customerName, 140) || null, customerEmail || null, cleanShopText(input.customerPhone, 40) || null, status, cleanShopText(input.shippingService, 120) || null, cleanShopText(input.shippingTrackingUrl, 500) || null, cleanShopText(input.shipmentNote, 1000)],
  ), { skipSchema: true });
  return getShopCatalog({ manager: true });
}

export async function deleteShopOrder(id: number) {
  const orderId = Math.floor(Number(id || 0));
  if (!orderId) throw new Error("Choose a valid order.");
  await withDatabase(async (client) => client.query("DELETE FROM website.shop_orders WHERE id=$1", [orderId]), { skipSchema: true });
  return getShopCatalog({ manager: true });
}

export async function sendShopOrderShipmentEmail(input: { id: number; trackingUrl: string; note?: string }) {
  const id = Math.floor(Number(input.id || 0));
  const trackingUrl = cleanShopText(input.trackingUrl, 500);
  if (!id) throw new Error("Choose a valid order.");
  if (!/^https?:\/\//i.test(trackingUrl)) throw new Error("Enter a full tracking or shipment URL starting with http:// or https://.");
  const note = cleanShopText(input.note, 1000);
  const job = await shopOrderEmailJobById(id);
  if (!job) throw new Error("Order not found.");
  if (!validShopEmail(job.customerEmail)) throw new Error("This order does not have a customer email address.");
  const text = [
    "Your Aviator Shop order has shipped",
    "",
    "Order: #" + id,
    "Tracking / shipment link: " + trackingUrl,
    note ? "" : "",
    note || "",
    "",
    "Thanks for ordering from Aviator Brewing Company.",
  ].filter((line, index, all) => line || all[index - 1] !== "").join("\n");
  const html = "<!doctype html><html><body style=\"margin:0;background:#eef2f3;padding:28px 14px;font-family:Arial,sans-serif;color:#10243a\"><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\"><tr><td align=\"center\"><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:640px;background:#fff;border:1px solid #d5dfe3\"><tr><td style=\"padding:28px 32px;background:#102b3e;color:#fff\"><div style=\"color:#efb45f;font-size:12px;font-weight:800;text-transform:uppercase\">Aviator Shop</div><h1 style=\"margin:10px 0 0;font-size:28px\">Your order has shipped</h1></td></tr><tr><td style=\"padding:28px 32px\"><p>Order #" + id + " is on the way.</p><p><a href=\"" + trackingUrl + "\" style=\"color:#a76125;font-weight:700\">View shipment / tracking</a></p>" + (note ? "<p style=\"white-space:pre-wrap\">" + note + "</p>" : "") + "<p style=\"color:#637783\">Thanks for ordering from Aviator Brewing Company.</p></td></tr></table></td></tr></table></body></html>";
  const sent = await sendMail({ to: job.customerEmail, subject: "Aviator Shop order #" + id + " shipped", text, html });
  if (!sent) throw new Error("Shop shipment email is not configured.");
  await withDatabase(async (client) => client.query("UPDATE website.shop_orders SET status='shipped', shipment_tracking_url=$2, shipment_note=$3, shipped_at=COALESCE(shipped_at,now()), shipment_email_sent_at=now(), updated_at=now() WHERE id=$1", [id, trackingUrl, note]), { skipSchema: true });
  return getShopCatalog({ manager: true });
}
