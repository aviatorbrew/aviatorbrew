import { randomUUID } from "node:crypto";
import { databaseConfigured, ensureDatabaseSchema, withDatabase } from "@/lib/database";
import { sendMail } from "@/lib/mail";
import { shopProductImageExists } from "@/lib/shop-image-storage";
import { getAllLocations } from "@/lib/managed-locations";

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
  reservedCount: number;
  availableInventoryCount: number;
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
  productType: "merchandise" | "ticket";
  ticketLocationSlug: string;
  ticketLocationName: string;
  ticketEventStartsAt: string;
  ticketSalesEndAt: string;
  ticketCapacity: number;
  ticketMaxPerOrder: number;
  ticketFullWidth: boolean;
  ticketPublishAsEvent: boolean;
  ticketSoldCount: number;
  ticketReservedCount: number;
  ticketAvailableCount: number;
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

export type ShopTicketPurchase = {
  id: number;
  orderId: number;
  productId: number | null;
  productName: string;
  variantLabel: string;
  locationSlug: string;
  eventStartsAt: string;
  purchaserName: string;
  purchaserEmail: string;
  purchaserPhone: string;
  partySize: number;
  paidAt: string;
};

export type ShopLocationOption = { slug: string; name: string };

export type ShopCatalog = {
  categories: ShopCategory[];
  products: ShopProduct[];
  settings?: ShopSettings;
  orders?: ShopOrder[];
  ticketPurchases?: ShopTicketPurchase[];
  locations?: ShopLocationOption[];
};

export type ShopVariantInput = {
  id?: number;
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
  productType?: "merchandise" | "ticket";
  ticketLocationSlug?: string;
  ticketEventStartsAt?: string;
  ticketSalesEndAt?: string;
  ticketCapacity?: number;
  ticketMaxPerOrder?: number;
  ticketFullWidth?: boolean;
  ticketPublishAsEvent?: boolean;
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
  productType: "merchandise" | "ticket";
  ticketLocationSlug: string;
  ticketEventStartsAt: string;
};

export type PreparedShopCart = {
  items: ShopCartItem[];
  merchandiseItems: ShopCartItem[];
  bonusItem: ShopCartItem | null;
  subtotalCents: number;
  shippingWeightOunces: number;
  requiresShipping: boolean;
  ticketOnly: boolean;
  settings: ShopSettings;
};

const defaultCategories = ["Apparel", "Signs", "Glassware", "Tickets", "Gift Cards", "Beverages", "Event Payments", "Other"];
const hiddenPublicShopProductSlugs = new Set(["e-gift-card"]);

export function shopSlug(value: string) {
  return value.toLowerCase().trim().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || randomUUID().slice(0, 8);
}

export function dollarsToCents(value: unknown) {
  const number = typeof value === "number" ? value : Number(String(value || "").replace(/[$,]/g, ""));
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number * 100);
}

export function shopVariantAvailable(variant: Pick<ShopVariant, "published" | "trackInventory" | "inventoryCount" | "availableForSale"> & Partial<Pick<ShopVariant, "availableInventoryCount">>) {
  const available = variant.availableInventoryCount ?? variant.inventoryCount;
  return variant.published && variant.availableForSale && (!variant.trackInventory || available > 0);
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

function wholeOunces(value: unknown, fallback = 8) {
  const number = Number(value);
  return Math.max(1, Math.round(Number.isFinite(number) && number > 0 ? number : fallback));
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
    reservedCount: Number(row.reserved_count || 0),
    availableInventoryCount: Math.max(0, Number(row.inventory_count || 0) - Number(row.reserved_count || 0)),
    published: row.published !== false,
    sortOrder: Number(row.sort_order || 0),
    weightOunces: wholeOunces(row.weight_ounces),
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

function fallbackShopImageUrl(productSlug: string) {
  const candidates = ["-1-transparent.png", "-1.png", "-1.jpg", "-1.jpeg", "-1.webp"].map((suffix) => productSlug + suffix);
  const found = candidates.find((filename) => shopProductImageExists("/api/shop-product-images/" + filename));
  return found ? "/api/shop-product-images/" + encodeURIComponent(found) : "";
}

function resolveShopImageUrl(value: unknown, productSlug: string) {
  const normalized = normalizeShopImageUrl(value);
  if (!normalized || shopProductImageExists(normalized)) return normalized;
  return fallbackShopImageUrl(productSlug) || normalized;
}

function resolvedShopCartImageUrl(row: Record<string, unknown>) {
  const slug = String(row.product_slug || row.slug || "");
  const additional = Array.isArray(row.additional_image_urls)
    ? row.additional_image_urls.map((url: unknown) => resolveShopImageUrl(url, slug))
    : [];
  return normalizeShopImageUrls([resolveShopImageUrl(row.image_url, slug), ...additional])[0] || "";
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
  if (!databaseConfigured() || process.env.SHOP_SEED_DEFAULT_CATEGORIES !== "true") return;
  await withDatabase(async (client) => {
    const existing = await client.query("SELECT COUNT(*) AS count FROM website.shop_categories");
    if (Number(existing.rows[0]?.count || 0) > 0) return;
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
  const locations = (await getAllLocations()).map((location) => ({ slug: location.slug, name: location.name }));
  if (!databaseConfigured()) return { categories: [], products: [], settings: settingsFromRow(undefined), orders: [], ticketPurchases: [], locations };
  await ensureDefaultCategories();
  return withDatabase(async (client) => {
    const categoryResult = await client.query("SELECT * FROM website.shop_categories " + (options.manager ? "" : "WHERE published=true ") + "ORDER BY sort_order, name");
    const productResult = await client.query("SELECT p.*,c.slug AS category_slug,c.name AS category_name,COALESCE((SELECT SUM(tp.party_size) FROM website.shop_ticket_purchases tp WHERE tp.product_id=p.id),0)::int AS ticket_sold_count,COALESCE((SELECT SUM(i.quantity) FROM website.shop_order_items i JOIN website.shop_orders o ON o.id=i.order_id WHERE i.product_id=p.id AND i.is_bonus=false AND o.status='pending' AND o.checkout_expires_at>now()),0)::int AS ticket_reserved_count FROM website.shop_products p LEFT JOIN website.shop_categories c ON c.id=p.category_id " + (options.manager ? "" : "WHERE p.published=true ") + "ORDER BY COALESCE(c.sort_order, 9999), c.name NULLS LAST, p.sort_order, p.name");
    const productIds = productResult.rows.map((row) => Number(row.id));
    const variantResult = productIds.length ? await client.query("SELECT v.*,COALESCE(r.reserved_count,0)::int AS reserved_count FROM website.shop_product_variants v LEFT JOIN (SELECT i.variant_id,SUM(i.quantity)::int AS reserved_count FROM website.shop_order_items i JOIN website.shop_orders o ON o.id=i.order_id WHERE o.status='pending' AND o.checkout_expires_at>now() AND i.is_bonus=false GROUP BY i.variant_id) r ON r.variant_id=v.id WHERE v.product_id=ANY($1::bigint[]) " + (options.manager ? "" : "AND v.published=true ") + "ORDER BY v.sort_order, v.label", [productIds]) : { rows: [] as Record<string, unknown>[] };
    const variantsByProduct = new Map<number, ShopVariant[]>();
    for (const row of variantResult.rows) {
      const variant = variantFromRow(row);
      variantsByProduct.set(variant.productId, [...(variantsByProduct.get(variant.productId) || []), variant]);
    }
    const products = productResult.rows.map((row) => {
      const slug = String(row.slug || "");
      const additional = Array.isArray(row.additional_image_urls) ? row.additional_image_urls.map((url: unknown) => resolveShopImageUrl(url, slug)) : [];
      const imageUrl = resolveShopImageUrl(row.image_url, slug);
      const imageUrls = normalizeShopImageUrls([imageUrl, ...additional]);
      return {
        id: Number(row.id),
        slug,
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
        productType: row.product_type === "ticket" ? "ticket" as const : "merchandise" as const,
        ticketLocationSlug: String(row.ticket_location_slug || ""),
        ticketLocationName: locations.find((location) => location.slug === String(row.ticket_location_slug || ""))?.name || "",
        ticketEventStartsAt: row.ticket_event_starts_at ? new Date(String(row.ticket_event_starts_at)).toISOString() : "",
        ticketSalesEndAt: row.ticket_sales_end_at ? new Date(String(row.ticket_sales_end_at)).toISOString() : "",
        ticketCapacity: Number(row.ticket_capacity || 0),
        ticketMaxPerOrder: Math.max(1, Number(row.ticket_max_per_order || 20)),
        ticketFullWidth: row.ticket_full_width === true,
        ticketPublishAsEvent: row.ticket_publish_as_event === true,
        ticketSoldCount: Number(row.ticket_sold_count || 0),
        ticketReservedCount: Number(row.ticket_reserved_count || 0),
        ticketAvailableCount: Math.max(0, Number(row.ticket_capacity || 0) - Number(row.ticket_sold_count || 0) - Number(row.ticket_reserved_count || 0)),
        variants: variantsByProduct.get(Number(row.id)) || [],
      };
    }).filter((product) => options.manager || (product.variants.length > 0 && !hiddenPublicShopProductSlugs.has(product.slug)));
    const settings = await getShopSettingsWithClient(client);
    let orders: ShopOrder[] | undefined;
    let ticketPurchases: ShopTicketPurchase[] | undefined;
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
      const ticketResult = await client.query("SELECT * FROM website.shop_ticket_purchases ORDER BY paid_at DESC, id DESC LIMIT 5000");
      ticketPurchases = ticketResult.rows.map((row) => ({ id: Number(row.id), orderId: Number(row.order_id), productId: row.product_id === null ? null : Number(row.product_id), productName: String(row.product_name || ""), variantLabel: String(row.variant_label || ""), locationSlug: String(row.location_slug || ""), eventStartsAt: String(row.event_starts_at || ""), purchaserName: String(row.purchaser_name || ""), purchaserEmail: String(row.purchaser_email || ""), purchaserPhone: String(row.purchaser_phone || ""), partySize: Number(row.party_size || 0), paidAt: String(row.paid_at || "") }));
    }
    return { categories: categoryResult.rows.map(categoryFromRow), products, settings, orders, ticketPurchases, locations };
  });
}

export async function getPublishedShopTicketEvents() {
  const { products } = await getShopCatalog();
  const now = Date.now();
  return products.filter((product) => {
    const eventTime = new Date(product.ticketEventStartsAt).getTime();
    return product.productType === "ticket" && product.ticketPublishAsEvent && Number.isFinite(eventTime) && eventTime >= now;
  }).sort((left, right) => new Date(left.ticketEventStartsAt).getTime() - new Date(right.ticketEventStartsAt).getTime());
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

export async function saveShopCategoryOrder(ids: number[]) {
  const orderedIds = ids.filter((id, index, all) => Number.isInteger(id) && id > 0 && all.indexOf(id) === index);
  if (!orderedIds.length) throw new Error("Choose at least one catalog to order.");
  return withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      for (let index = 0; index < orderedIds.length; index += 1) {
        await client.query("UPDATE website.shop_categories SET sort_order=$2, updated_at=now() WHERE id=$1", [orderedIds[index], index * 10]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
    return getShopCatalog({ manager: true });
  }, { skipSchema: true });
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

function normalizedDate(value: unknown, label: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw new Error(label + " is invalid.");
  return date.toISOString();
}

function currentInt(current: Record<string, unknown> | undefined, key: string, fallback = 0) {
  const value = current?.[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function normalizeProductInput(input: ShopProductInput, current?: Record<string, unknown>) {
  const name = input.name.trim();
  if (!name) throw new Error("Product name is required.");
  const productType = input.productType === "ticket" ? "ticket" as const : "merchandise" as const;
  const currentTicketLocationSlug = String(current?.ticket_location_slug || "").trim();
  const ticketLocationSlug = String(input.ticketLocationSlug === undefined ? currentTicketLocationSlug : input.ticketLocationSlug || "").trim().slice(0, 100);
  const ticketEventStartsAt = normalizedDate(input.ticketEventStartsAt === undefined ? current?.ticket_event_starts_at : input.ticketEventStartsAt, "Event date and time");
  const ticketSalesEndAt = normalizedDate(input.ticketSalesEndAt === undefined ? current?.ticket_sales_end_at : input.ticketSalesEndAt, "Ticket sales end date");
  const ticketCapacity = Math.max(0, Math.floor(Number(input.ticketCapacity === undefined ? currentInt(current, "ticket_capacity", 0) : input.ticketCapacity || 0)));
  const ticketMaxPerOrder = Math.max(1, Math.min(1000, Math.floor(Number(input.ticketMaxPerOrder === undefined ? currentInt(current, "ticket_max_per_order", 20) : input.ticketMaxPerOrder || 0))));
  const ticketFullWidth = productType === "ticket" && (input.ticketFullWidth === undefined ? current?.ticket_full_width === true : input.ticketFullWidth === true);
  const ticketPublishAsEvent = productType === "ticket" && (input.ticketPublishAsEvent === undefined ? current?.ticket_publish_as_event === true : input.ticketPublishAsEvent === true);
  if (productType === "ticket" && !ticketLocationSlug) throw new Error("Choose the event location for this ticket.");
  if (productType === "ticket" && !ticketEventStartsAt) throw new Error("Set the event date and time for this ticket.");
  if (productType === "ticket" && ticketCapacity < 1) throw new Error("Set the total number of tickets for sale.");
  if (productType === "ticket" && ticketMaxPerOrder > ticketCapacity) throw new Error("Maximum tickets per order cannot exceed the total ticket capacity.");
  if (productType === "ticket" && ticketSalesEndAt && new Date(ticketSalesEndAt) > new Date(ticketEventStartsAt)) throw new Error("Ticket sales must end before the event starts.");
  const variants = input.variants.filter((variant) => variant.label.trim()).map((variant, index) => ({
    id: variant.id && Number.isInteger(variant.id) && variant.id > 0 ? variant.id : undefined,
    label: variant.label.trim().slice(0, 80),
    sku: (variant.sku || "").trim().slice(0, 80),
    priceCents: Math.max(0, Math.floor(variant.priceCents)),
    compareAtPriceCents: variant.compareAtPriceCents ? Math.max(0, Math.floor(variant.compareAtPriceCents)) : null,
    inventoryCount: Math.max(0, Math.floor(variant.inventoryCount)),
    published: variant.published !== false,
    sortOrder: variant.sortOrder ?? index * 10,
    weightOunces: productType === "ticket" ? 1 : wholeOunces(variant.weightOunces),
    requiresShipping: productType === "ticket" ? false : variant.requiresShipping !== false,
    trackInventory: productType === "ticket" ? false : variant.trackInventory !== false,
    availableForSale: variant.availableForSale !== false,
  }));
  if (!variants.length) throw new Error("Add at least one product option or ticket type.");
  const hasInvalidSellablePrice = input.published !== false && variants.some((variant) => variant.published && variant.availableForSale && variant.priceCents < 100);
  if (hasInvalidSellablePrice) throw new Error("Every published option available for sale needs a price of at least $1.00. Unpublish the product to save it as a draft.");
  return { ...input, name, productType, ticketLocationSlug: productType === "ticket" ? ticketLocationSlug : "", ticketEventStartsAt: productType === "ticket" ? ticketEventStartsAt : "", ticketSalesEndAt: productType === "ticket" ? ticketSalesEndAt : "", ticketCapacity: productType === "ticket" ? ticketCapacity : 0, ticketMaxPerOrder: productType === "ticket" ? ticketMaxPerOrder : 20, ticketFullWidth, ticketPublishAsEvent, variants };
}

function productImagesForSave(input: ShopProductInput, current?: Record<string, unknown>) {
  const currentAdditional = Array.isArray(current?.additional_image_urls) ? current.additional_image_urls : [];
  const submitted = normalizeShopImageUrls([...(input.imageUrls || []), ...(input.imageUrls ? [] : [input.imageUrl || ""])]);
  const fallback = normalizeShopImageUrls([current?.image_url || "", ...currentAdditional]);
  const images = input.imageUrls ? submitted : submitted.length ? submitted : fallback;
  const primary = input.imageUrls ? images[0] || "" : normalizeShopImageUrl(input.imageUrl) || images[0] || "";
  const ordered = normalizeShopImageUrls([primary, ...images]);
  return { primary: ordered[0] || "", additional: ordered.slice(1) };
}

export async function saveShopProduct(input: ShopProductInput) {
  await ensureDatabaseSchema();
  await ensureDefaultCategories();
  return withDatabase(async (client) => {
    let productId = input.id;
    await client.query("BEGIN");
    try {
      let currentProduct: Record<string, unknown> | undefined;
      if (productId) {
        const current = await client.query("SELECT * FROM website.shop_products WHERE id=$1 FOR UPDATE", [productId]);
        if (!current.rows[0]) throw new Error("Product not found.");
        currentProduct = current.rows[0];
      }
      const normalized = normalizeProductInput(input, currentProduct);
      productId = normalized.id;
      const locations = await getAllLocations();
      if (normalized.productType === "ticket" && !locations.some((location) => location.slug === normalized.ticketLocationSlug)) throw new Error("Choose a valid Aviator event location.");
      const categoryId = await categoryIdForInput(client, normalized);
      if (productId) {
        const committedTickets = await client.query("SELECT COALESCE(SUM(party_size),0)::int AS sold FROM website.shop_ticket_purchases WHERE product_id=$1", [productId]);
        const reservedTickets = await client.query("SELECT COALESCE(SUM(i.quantity),0)::int AS reserved FROM website.shop_order_items i JOIN website.shop_orders o ON o.id=i.order_id WHERE i.product_id=$1 AND i.is_bonus=false AND o.status='pending' AND o.checkout_expires_at>now()", [productId]);
        const allocatedTickets = Number(committedTickets.rows[0]?.sold || 0) + Number(reservedTickets.rows[0]?.reserved || 0);
        if (allocatedTickets > 0 && normalized.productType !== "ticket") throw new Error("A ticket product with sales or active checkout reservations cannot be changed to merchandise.");
        if (normalized.productType === "ticket" && normalized.ticketCapacity < allocatedTickets) throw new Error("Total ticket capacity cannot be lower than the " + allocatedTickets + " tickets already sold or reserved.");
        const images = productImagesForSave(normalized, currentProduct);
        await client.query("UPDATE website.shop_products SET category_id=$2,name=$3,description=$4,image_url=$5,additional_image_urls=$6::jsonb,published=$7,featured=$8,sort_order=$9,source=$10,source_id=$11,product_type=$12,ticket_location_slug=$13,ticket_event_starts_at=$14,ticket_sales_end_at=$15,ticket_capacity=$16,ticket_max_per_order=$17,ticket_full_width=$18,ticket_publish_as_event=$19,updated_at=now() WHERE id=$1", [productId, categoryId, normalized.name, normalized.description || "", images.primary, JSON.stringify(images.additional), normalized.published !== false, normalized.featured === true, intValue(normalized.sortOrder), normalized.source || currentProduct?.source || "manager", normalized.sourceId || currentProduct?.source_id || null, normalized.productType, normalized.ticketLocationSlug || null, normalized.ticketEventStartsAt || null, normalized.ticketSalesEndAt || null, normalized.ticketCapacity, normalized.ticketMaxPerOrder, normalized.ticketFullWidth, normalized.ticketPublishAsEvent]);
      } else {
        const images = productImagesForSave(normalized);
        const inserted = await client.query("INSERT INTO website.shop_products (slug,category_id,name,description,image_url,additional_image_urls,published,featured,sort_order,source,source_id,product_type,ticket_location_slug,ticket_event_starts_at,ticket_sales_end_at,ticket_capacity,ticket_max_per_order,ticket_full_width,ticket_publish_as_event) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id", [shopSlug(normalized.name), categoryId, normalized.name, normalized.description || "", images.primary, JSON.stringify(images.additional), normalized.published !== false, normalized.featured === true, intValue(normalized.sortOrder), normalized.source || "manager", normalized.sourceId || null, normalized.productType, normalized.ticketLocationSlug || null, normalized.ticketEventStartsAt || null, normalized.ticketSalesEndAt || null, normalized.ticketCapacity, normalized.ticketMaxPerOrder, normalized.ticketFullWidth, normalized.ticketPublishAsEvent]);
        productId = Number(inserted.rows[0].id);
      }
      const existing = normalized.id ? await client.query("SELECT id FROM website.shop_product_variants WHERE product_id=$1", [productId]) : { rows: [] as Record<string, unknown>[] };
      const existingIds = new Set(existing.rows.map((row) => Number(row.id)));
      const retainedIds: number[] = [];
      for (const variant of normalized.variants) {
        if (variant.id && existingIds.has(variant.id)) {
          await client.query("UPDATE website.shop_product_variants SET label=$3,sku=$4,price_cents=$5,compare_at_price_cents=$6,inventory_count=$7,published=$8,sort_order=$9,weight_ounces=$10,requires_shipping=$11,track_inventory=$12,available_for_sale=$13,updated_at=now() WHERE id=$1 AND product_id=$2", [variant.id, productId, variant.label, variant.sku, variant.priceCents, variant.compareAtPriceCents, variant.inventoryCount, variant.published, variant.sortOrder, variant.weightOunces, variant.requiresShipping, variant.trackInventory, variant.availableForSale]);
          retainedIds.push(variant.id);
        } else {
          const inserted = await client.query("INSERT INTO website.shop_product_variants (product_id,label,sku,price_cents,compare_at_price_cents,inventory_count,published,sort_order,weight_ounces,requires_shipping,track_inventory,available_for_sale) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id", [productId, variant.label, variant.sku, variant.priceCents, variant.compareAtPriceCents, variant.inventoryCount, variant.published, variant.sortOrder, variant.weightOunces, variant.requiresShipping, variant.trackInventory, variant.availableForSale]);
          retainedIds.push(Number(inserted.rows[0].id));
        }
      }
      if (existingIds.size) await client.query("DELETE FROM website.shop_product_variants WHERE product_id=$1 AND NOT (id=ANY($2::bigint[]))", [productId, retainedIds]);

      const persistedProductResult = await client.query("SELECT category_id,name,description,published,featured,sort_order,product_type,ticket_location_slug,ticket_event_starts_at,ticket_sales_end_at,ticket_capacity,ticket_max_per_order,ticket_full_width,ticket_publish_as_event,updated_at FROM website.shop_products WHERE id=$1", [productId]);
      const persistedProduct = persistedProductResult.rows[0];
      const expectedCategoryId = categoryId === null ? null : Number(categoryId);
      const actualCategoryId = persistedProduct?.category_id === null || persistedProduct?.category_id === undefined ? null : Number(persistedProduct.category_id);
      if (!persistedProduct
        || actualCategoryId !== expectedCategoryId
        || String(persistedProduct.name || "") !== normalized.name
        || String(persistedProduct.description || "") !== (normalized.description || "")
        || persistedProduct.published !== (normalized.published !== false)
        || persistedProduct.featured !== (normalized.featured === true)
        || Number(persistedProduct.sort_order || 0) !== intValue(normalized.sortOrder)
        || String(persistedProduct.product_type || "merchandise") !== normalized.productType
        || String(persistedProduct.ticket_location_slug || "") !== normalized.ticketLocationSlug
        || normalizedDate(persistedProduct.ticket_event_starts_at, "Saved event date and time") !== normalized.ticketEventStartsAt
        || normalizedDate(persistedProduct.ticket_sales_end_at, "Saved ticket sales end date") !== normalized.ticketSalesEndAt
        || Number(persistedProduct.ticket_capacity || 0) !== normalized.ticketCapacity
        || Number(persistedProduct.ticket_max_per_order || 20) !== normalized.ticketMaxPerOrder
        || persistedProduct.ticket_full_width !== normalized.ticketFullWidth
        || persistedProduct.ticket_publish_as_event !== normalized.ticketPublishAsEvent) {
        throw new Error("Database verification failed after saving the product details.");
      }

      const persistedVariantsResult = await client.query("SELECT label,sku,price_cents,compare_at_price_cents,inventory_count,published,sort_order,weight_ounces,requires_shipping,track_inventory,available_for_sale FROM website.shop_product_variants WHERE product_id=$1 ORDER BY sort_order,id", [productId]);
      if (persistedVariantsResult.rows.length !== normalized.variants.length) throw new Error("Database verification failed after saving the product options.");
      for (let index = 0; index < normalized.variants.length; index += 1) {
        const expected = normalized.variants[index];
        const actual = persistedVariantsResult.rows[index];
        if (!actual
          || String(actual.label || "") !== expected.label
          || String(actual.sku || "") !== expected.sku
          || Number(actual.price_cents || 0) !== expected.priceCents
          || (actual.compare_at_price_cents === null ? null : Number(actual.compare_at_price_cents)) !== expected.compareAtPriceCents
          || Number(actual.inventory_count || 0) !== expected.inventoryCount
          || actual.published !== expected.published
          || Number(actual.sort_order || 0) !== expected.sortOrder
          || Number(actual.weight_ounces || 0) !== expected.weightOunces
          || actual.requires_shipping !== expected.requiresShipping
          || actual.track_inventory !== expected.trackInventory
          || actual.available_for_sale !== expected.availableForSale) {
          throw new Error("Database verification failed after saving product option " + (index + 1) + ".");
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
    return { ...(await getShopCatalog({ manager: true })), savedProductId: productId };
  }, { skipSchema: true });
}

export async function deleteShopProduct(id: number) {
  return withDatabase(async (client) => {
    await client.query("DELETE FROM website.shop_products WHERE id=$1", [id]);
    return getShopCatalog({ manager: true });
  });
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, `""`)}` + `"` : text;
}

export async function getShopTicketPurchasesCsv(productId: number) {
  return withDatabase(async (client) => {
    const productResult = await client.query("SELECT name,product_type FROM website.shop_products WHERE id=$1", [productId]);
    const product = productResult.rows[0];
    if (!product || product.product_type !== "ticket") throw new Error("Ticket product not found.");
    const result = await client.query("SELECT purchaser_name,purchaser_email,purchaser_phone,party_size,variant_label,location_slug,event_starts_at,paid_at,order_id FROM website.shop_ticket_purchases WHERE product_id=$1 ORDER BY purchaser_name,paid_at", [productId]);
    const header = ["Name", "Email", "Phone", "Party Size", "Ticket Type", "Location", "Event Date", "Purchased At", "Order Number"];
    const rows = result.rows.map((row) => [row.purchaser_name, row.purchaser_email, row.purchaser_phone, row.party_size, row.variant_label, row.location_slug, row.event_starts_at, row.paid_at, row.order_id]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    return { csv, filename: shopSlug(String(product.name || "ticket")) + "-purchasers.csv" };
  }, { skipSchema: true });
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
    if (!Number.isInteger(variantId) || variantId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error("Choose valid shop items and quantities.");
    combined.set(variantId, (combined.get(variantId) || 0) + quantity);
  }
  if ([...combined.values()].some((quantity) => quantity > 1000)) throw new Error("A cart option is over the supported quantity limit.");
  return [...combined].map(([variantId, quantity]) => ({ variantId, quantity }));
}

export class ShopCartAvailabilityError extends Error {
  variantIds: number[];

  constructor(message: string, variantIds: number[]) {
    super(message);
    this.name = "ShopCartAvailabilityError";
    this.variantIds = variantIds;
  }
}

export async function prepareShopCart(rawItems: ShopCartRequestItem[]): Promise<PreparedShopCart> {
  const requests = normalizeCartRequests(rawItems);
  return withDatabase(async (client) => {
    const ids = requests.map((item) => item.variantId);
    const result = await client.query("SELECT v.*,p.name AS product_name,p.slug AS product_slug,p.image_url,p.additional_image_urls,p.published AS product_published,p.product_type,p.ticket_location_slug,p.ticket_event_starts_at,p.ticket_sales_end_at,p.ticket_capacity,p.ticket_max_per_order,COALESCE((SELECT SUM(tp.party_size) FROM website.shop_ticket_purchases tp WHERE tp.product_id=p.id),0)::int AS ticket_sold_count,COALESCE((SELECT SUM(oi.quantity) FROM website.shop_order_items oi JOIN website.shop_orders oo ON oo.id=oi.order_id WHERE oi.product_id=p.id AND oi.is_bonus=false AND oo.status='pending' AND oo.checkout_expires_at>now()),0)::int AS ticket_product_reserved_count,COALESCE(r.reserved_count,0)::int AS reserved_count FROM website.shop_product_variants v JOIN website.shop_products p ON p.id=v.product_id LEFT JOIN (SELECT i.variant_id,SUM(i.quantity)::int AS reserved_count FROM website.shop_order_items i JOIN website.shop_orders o ON o.id=i.order_id WHERE o.status='pending' AND o.checkout_expires_at>now() AND i.is_bonus=false GROUP BY i.variant_id) r ON r.variant_id=v.id WHERE v.id=ANY($1::bigint[])", [ids]);
    const rows = new Map(result.rows.map((row) => [Number(row.id), row]));
    const ticketProductQuantities = new Map<number, number>();
    const merchandiseItems = requests.map((request) => {
      const row = rows.get(request.variantId);
      if (!row || row.product_published !== true || hiddenPublicShopProductSlugs.has(String(row.product_slug || ""))) throw new ShopCartAvailabilityError("A product in your cart is no longer available.", [request.variantId]);
      const variant = variantFromRow(row);
      const productType = row.product_type === "ticket" ? "ticket" as const : "merchandise" as const;
      if (productType === "ticket") {
        const cutoff = row.ticket_sales_end_at || row.ticket_event_starts_at;
        if (cutoff && new Date(String(cutoff)).getTime() <= Date.now()) throw new ShopCartAvailabilityError(String(row.product_name || "This event") + " ticket sales are closed.", [request.variantId]);
        const productQuantity = (ticketProductQuantities.get(variant.productId) || 0) + request.quantity;
        const maxPerOrder = Math.max(1, Number(row.ticket_max_per_order || 20));
        const eventAvailable = Math.max(0, Number(row.ticket_capacity || 0) - Number(row.ticket_sold_count || 0) - Number(row.ticket_product_reserved_count || 0));
        if (productQuantity > maxPerOrder) throw new ShopCartAvailabilityError("Ticket purchases for " + String(row.product_name || "this event") + " are limited to " + maxPerOrder + " per customer.", [request.variantId]);
        if (productQuantity > eventAvailable) throw new ShopCartAvailabilityError(eventAvailable ? "Only " + eventAvailable + " tickets remain for " + String(row.product_name || "this event") + "." : String(row.product_name || "This event") + " is sold out.", [request.variantId]);
        ticketProductQuantities.set(variant.productId, productQuantity);
      }
      if (productType !== "ticket" && request.quantity > 25) throw new Error("Merchandise quantities are limited to 25 per option.");
      if (!shopVariantAvailable(variant)) throw new ShopCartAvailabilityError(String(row.product_name || "An item") + " - " + variant.label + " is sold out.", [request.variantId]);
      if (variant.trackInventory && request.quantity > variant.availableInventoryCount) throw new ShopCartAvailabilityError("Only " + variant.availableInventoryCount + " of " + String(row.product_name || "that item") + " - " + variant.label + " are available.", [request.variantId]);
      return {
        variantId: variant.id,
        productId: variant.productId,
        productName: String(row.product_name || ""),
        variantLabel: variant.label,
        imageUrl: resolvedShopCartImageUrl(row),
        unitPriceCents: variant.priceCents,
        quantity: request.quantity,
        weightOunces: variant.weightOunces,
        requiresShipping: productType === "ticket" ? false : variant.requiresShipping,
        isBonus: false,
        productType,
        ticketLocationSlug: String(row.ticket_location_slug || ""),
        ticketEventStartsAt: String(row.ticket_event_starts_at || ""),
      } satisfies ShopCartItem;
    });
    const subtotalCents = merchandiseItems.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    const settings = await getShopSettingsWithClient(client);
    const ticketOnly = merchandiseItems.every((item) => item.productType === "ticket");
    let bonusItem: ShopCartItem | null = null;
    if (!ticketOnly && settings.bonusEnabled && settings.bonusVariantId && subtotalCents > settings.bonusThresholdCents) {
      const bonusResult = await client.query("SELECT v.*,p.name AS product_name,p.slug AS product_slug,p.image_url,p.additional_image_urls,p.published AS product_published FROM website.shop_product_variants v JOIN website.shop_products p ON p.id=v.product_id WHERE v.id=$1", [settings.bonusVariantId]);
      const row = bonusResult.rows[0];
      if (row && row.product_published === true) {
        const variant = variantFromRow(row);
        if (shopVariantAvailable(variant)) bonusItem = {
          variantId: variant.id,
          productId: variant.productId,
          productName: settings.bonusLabel,
          variantLabel: variant.label,
          imageUrl: resolvedShopCartImageUrl(row),
          unitPriceCents: 0,
          quantity: 1,
          weightOunces: variant.weightOunces,
          requiresShipping: variant.requiresShipping,
          isBonus: true,
          productType: "merchandise",
          ticketLocationSlug: "",
          ticketEventStartsAt: "",
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
      ticketOnly,
      settings,
    };
  });
}

export async function recordShopCheckout(input: {
  stripeSessionId: string;
  checkoutExpiresAt?: string;
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
      const ticketQuantities = new Map<number, number>();
      for (const item of input.cart.merchandiseItems.filter((entry) => entry.productType === "ticket")) ticketQuantities.set(item.productId, (ticketQuantities.get(item.productId) || 0) + item.quantity);
      const purchaserEmail = String(input.customerEmail || "").trim().toLowerCase();
      if (ticketQuantities.size && (!purchaserEmail.includes("@") || !purchaserEmail.includes("."))) throw new Error("A valid purchaser email is required for event tickets.");
      for (const [productId, quantity] of ticketQuantities) {
        const productResult = await client.query("SELECT name,ticket_capacity,ticket_max_per_order FROM website.shop_products WHERE id=$1 AND product_type='ticket' AND published=true FOR UPDATE", [productId]);
        const product = productResult.rows[0];
        if (!product) throw new Error("A ticket in this cart is no longer available.");
        const soldResult = await client.query("SELECT COALESCE(SUM(party_size),0)::int AS count FROM website.shop_ticket_purchases WHERE product_id=$1", [productId]);
        const reservedResult = await client.query("SELECT COALESCE(SUM(i.quantity),0)::int AS count FROM website.shop_order_items i JOIN website.shop_orders o ON o.id=i.order_id WHERE i.product_id=$1 AND i.is_bonus=false AND o.status='pending' AND o.checkout_expires_at>now() AND o.stripe_session_id<>$2", [productId, input.stripeSessionId]);
        const available = Math.max(0, Number(product.ticket_capacity || 0) - Number(soldResult.rows[0]?.count || 0) - Number(reservedResult.rows[0]?.count || 0));
        const maxPerOrder = Math.max(1, Number(product.ticket_max_per_order || 20));
        if (quantity > maxPerOrder) throw new Error("Ticket purchases for " + String(product.name || "this event") + " are limited to " + maxPerOrder + " per customer.");
        const customerPurchases = await client.query("SELECT COALESCE(SUM(party_size),0)::int AS count FROM website.shop_ticket_purchases WHERE product_id=$1 AND lower(purchaser_email)=lower($2)", [productId, purchaserEmail]);
        const customerReservations = await client.query("SELECT COALESCE(SUM(i.quantity),0)::int AS count FROM website.shop_order_items i JOIN website.shop_orders o ON o.id=i.order_id WHERE i.product_id=$1 AND i.is_bonus=false AND o.status='pending' AND o.checkout_expires_at>now() AND lower(COALESCE(o.customer_email,''))=lower($2) AND o.stripe_session_id<>$3", [productId, purchaserEmail, input.stripeSessionId]);
        const previouslyAllocated = Number(customerPurchases.rows[0]?.count || 0) + Number(customerReservations.rows[0]?.count || 0);
        if (previouslyAllocated + quantity > maxPerOrder) {
          const remainingForCustomer = Math.max(0, maxPerOrder - previouslyAllocated);
          throw new Error(remainingForCustomer ? "You may purchase " + remainingForCustomer + " more tickets for " + String(product.name || "this event") + "." : "This purchaser has reached the " + maxPerOrder + " ticket limit for " + String(product.name || "this event") + ".");
        }
        if (quantity > available) throw new Error(available ? "Only " + available + " tickets remain for " + String(product.name || "this event") + "." : String(product.name || "This event") + " is sold out.");
      }
      const total = input.cart.subtotalCents + input.shippingCents;
      const checkoutExpiresAt = input.checkoutExpiresAt || new Date(Date.now() + 30 * 60_000).toISOString();
      const order = await client.query("INSERT INTO website.shop_orders (stripe_session_id,customer_email,customer_name,customer_phone,status,amount_total_cents,subtotal_cents,shipping_cents,shipping_address,shipping_provider,shipping_service,shipping_rate_id,checkout_expires_at,metadata) VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13::jsonb) ON CONFLICT (stripe_session_id) DO UPDATE SET customer_email=EXCLUDED.customer_email,customer_name=EXCLUDED.customer_name,customer_phone=EXCLUDED.customer_phone,amount_total_cents=EXCLUDED.amount_total_cents,subtotal_cents=EXCLUDED.subtotal_cents,shipping_cents=EXCLUDED.shipping_cents,shipping_address=EXCLUDED.shipping_address,shipping_provider=EXCLUDED.shipping_provider,shipping_service=EXCLUDED.shipping_service,shipping_rate_id=EXCLUDED.shipping_rate_id,checkout_expires_at=EXCLUDED.checkout_expires_at RETURNING id", [input.stripeSessionId, input.customerEmail || null, input.customerName || null, input.customerPhone || null, total, input.cart.subtotalCents, input.shippingCents, JSON.stringify(input.shippingAddress || {}), input.shippingProvider || null, input.shippingService || null, input.shippingRateId || null, checkoutExpiresAt, JSON.stringify({ source: "shop-new", bonusApplied: Boolean(input.cart.bonusItem), ticketOnly: input.cart.ticketOnly })]);
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
    job.isTestOrder ? "Aviator Supply test order received" : "Aviator Supply order received",
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
  const html = "<!doctype html><html><body style=\"margin:0;background:#eef2f3;padding:28px 14px;font-family:Arial,sans-serif;color:#10243a\"><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\"><tr><td align=\"center\"><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:640px;background:#fff;border:1px solid #d5dfe3\"><tr><td style=\"padding:28px 32px;background:#102b3e;color:#fff\"><div style=\"color:#efb45f;font-size:12px;font-weight:800;text-transform:uppercase\">Aviator Supply</div><h1 style=\"margin:10px 0 0;font-size:28px\">" + (job.isTestOrder ? "Test order received" : "Order received") + "</h1></td></tr><tr><td style=\"padding:28px 32px\"><p style=\"font-size:16px;line-height:1.6\">Thanks" + (job.customerName ? ", " + job.customerName : "") + ". We received order #" + job.orderId + " and the Aviator team has it in the fulfillment queue.</p><ul style=\"line-height:1.8\">" + shopOrderHtmlList(job.items) + "</ul><p><strong>Merchandise:</strong> " + shopOrderMoney(job.subtotalCents) + "<br><strong>Shipping:</strong> " + shopOrderMoney(job.shippingCents) + "<br><strong>Total:</strong> " + shopOrderMoney(job.totalCents) + "</p><p style=\"color:#637783\">" + (job.isTestOrder ? "This is a manager test order. No payment was collected." : "We will send another email when your order ships.") + "</p></td></tr></table></td></tr></table></body></html>";
  const sent = await sendMail({ to: job.customerEmail, subject: (job.isTestOrder ? "TEST - " : "") + "Aviator Supply order #" + job.orderId + " received", text, html });
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
    job.isTestOrder ? "TEST Aviator Supply order" : "New paid Aviator Supply order",
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
    subject: (job.isTestOrder ? "TEST Aviator Supply order #" : "Paid Aviator Supply order #") + job.orderId + " - " + shopOrderMoney(job.totalCents),
    text,
    replyTo: validShopEmail(job.customerEmail) ? job.customerEmail : undefined,
  });
  if (!sent) throw new Error("Shop order email is not configured.");
  await withDatabase(async (client) => client.query("UPDATE website.shop_orders SET notification_sent_at=COALESCE(notification_sent_at,now()),notification_claimed_at=NULL,updated_at=now() WHERE id=$1", [job.orderId]), { skipSchema: true });
  return true;
}

export async function expireShopCheckout(sessionId: string) {
  if (!sessionId) return;
  await withDatabase(async (client) => client.query("UPDATE website.shop_orders SET status='cancelled',updated_at=now() WHERE stripe_session_id=$1 AND status='pending'", [sessionId]), { skipSchema: true });
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
        const inventoryItems = await client.query("SELECT i.id AS order_item_id,i.product_id,i.variant_id,i.product_name,i.variant_label,i.quantity,p.product_type,p.ticket_location_slug,p.ticket_event_starts_at FROM website.shop_order_items i LEFT JOIN website.shop_products p ON p.id=i.product_id WHERE i.order_id=$1 AND i.is_bonus=false", [orderId]);
        for (const item of inventoryItems.rows) {
          await client.query("UPDATE website.shop_product_variants SET inventory_count=GREATEST(inventory_count-$1,0),available_for_sale=CASE WHEN track_inventory AND GREATEST(inventory_count-$1,0)=0 THEN false ELSE available_for_sale END,updated_at=now() WHERE id=$2 AND track_inventory=true", [Number(item.quantity || 0), Number(item.variant_id)]);
          if (item.product_type === "ticket") await client.query("INSERT INTO website.shop_ticket_purchases (order_id,order_item_id,product_id,variant_id,product_name,variant_label,location_slug,event_starts_at,purchaser_name,purchaser_email,purchaser_phone,party_size,paid_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13,now())) ON CONFLICT (order_item_id) DO NOTHING", [orderId, Number(item.order_item_id), item.product_id ? Number(item.product_id) : null, item.variant_id ? Number(item.variant_id) : null, String(item.product_name || "Ticket"), String(item.variant_label || "Admission"), item.ticket_location_slug || null, item.ticket_event_starts_at || null, String(row.customer_name || "Guest"), String(row.customer_email || ""), String(row.customer_phone || "") || null, Number(item.quantity || 0), row.paid_at || null]);
        }
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
    "New paid Aviator Supply order",
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
      subject: "Paid Aviator Supply order #" + job.orderId + " - " + shopOrderMoney(job.totalCents),
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
    "Your Aviator Supply order has shipped",
    "",
    "Order: #" + id,
    "Tracking / shipment link: " + trackingUrl,
    note ? "" : "",
    note || "",
    "",
    "Thanks for ordering from Aviator Brewing Company.",
  ].filter((line, index, all) => line || all[index - 1] !== "").join("\n");
  const html = "<!doctype html><html><body style=\"margin:0;background:#eef2f3;padding:28px 14px;font-family:Arial,sans-serif;color:#10243a\"><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\"><tr><td align=\"center\"><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"max-width:640px;background:#fff;border:1px solid #d5dfe3\"><tr><td style=\"padding:28px 32px;background:#102b3e;color:#fff\"><div style=\"color:#efb45f;font-size:12px;font-weight:800;text-transform:uppercase\">Aviator Supply</div><h1 style=\"margin:10px 0 0;font-size:28px\">Your order has shipped</h1></td></tr><tr><td style=\"padding:28px 32px\"><p>Order #" + id + " is on the way.</p><p><a href=\"" + trackingUrl + "\" style=\"color:#a76125;font-weight:700\">View shipment / tracking</a></p>" + (note ? "<p style=\"white-space:pre-wrap\">" + note + "</p>" : "") + "<p style=\"color:#637783\">Thanks for ordering from Aviator Brewing Company.</p></td></tr></table></td></tr></table></body></html>";
  const sent = await sendMail({ to: job.customerEmail, subject: "Aviator Supply order #" + id + " shipped", text, html });
  if (!sent) throw new Error("Shop shipment email is not configured.");
  await withDatabase(async (client) => client.query("UPDATE website.shop_orders SET status='shipped', shipment_tracking_url=$2, shipment_note=$3, shipped_at=COALESCE(shipped_at,now()), shipment_email_sent_at=now(), updated_at=now() WHERE id=$1", [id, trackingUrl, note]), { skipSchema: true });
  return getShopCatalog({ manager: true });
}
