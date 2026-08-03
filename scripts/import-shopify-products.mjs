import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const sourceUrl = process.env.SHOPIFY_PRODUCTS_URL || "https://aviatorbrew.myshopify.com/products.json?limit=250";
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) throw new Error("DATABASE_URL or POSTGRES_URL is required.");

const pool = new Pool({ connectionString, max: 1, ...(process.env.POSTGRES_SSL === "true" || /sslmode=require/i.test(connectionString) ? { ssl: { rejectUnauthorized: false } } : {}) });
const imageRoot = process.env.SHOP_PRODUCT_IMAGES_DIRECTORY || path.join(process.cwd(), "public", "media", "shop-products", "shopify");
await mkdir(imageRoot, { recursive: true });

const slug = (value) => value.toLowerCase().trim().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
const text = (html = "") => html
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\s+/g, " ")
  .trim();

function categoryName(product) {
  const type = String(product.product_type || "").toLowerCase();
  const title = String(product.title || "").toLowerCase();
  if (type.includes("glass") || title.includes("glass") || title.includes("pint")) return "Glassware";
  if (type.includes("t-shirt") || title.includes("shirt") || title.includes("beanie") || title.includes("hat")) return "Apparel";
  if (type.includes("gift")) return "Gift Cards";
  if (type.includes("sign")) return "Signs";
  if (type.includes("rootbeer") || title.includes("rootbeer")) return "Beverages";
  if (type.includes("event")) return "Event Payments";
  return "Other";
}

function wholeOunces(value, fallback = 8) {
  const number = Number(value);
  return Math.max(1, Math.round(Number.isFinite(number) && number > 0 ? number : fallback));
}

function isGlasswareProduct(product) {
  return categoryName(product) === "Glassware";
}

async function fileExists(filePath) {
  try { await access(filePath); return true; }
  catch { return false; }
}

async function bestLocalImagePath(destination) {
  const extension = path.extname(destination);
  const transparent = destination.replace(new RegExp(extension.replace(".", "\\.") + "$"), "-transparent.png");
  if (await fileExists(transparent)) return transparent;
  if (await fileExists(destination)) return destination;
  return destination;
}

function imageExtension(url) {
  const pathname = new URL(url).pathname;
  const extension = path.extname(pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(extension) ? extension : ".jpg";
}

async function localImages(product) {
  const results = [];
  for (let index = 0; index < (product.images || []).length; index++) {
    const source = product.images[index]?.src;
    if (!source) continue;
    const filename = slug(product.handle || product.title) + "-" + (index + 1) + imageExtension(source);
    const destination = path.join(imageRoot, filename);
    const preferred = await bestLocalImagePath(destination);
    if (preferred === destination && !(await fileExists(destination))) {
      const response = await fetch(source);
      if (!response.ok) throw new Error("Could not download " + source + ": " + response.status);
      await writeFile(destination, Buffer.from(await response.arrayBuffer()));
    }
    results.push("/api/shop-product-images/" + path.basename(await bestLocalImagePath(destination)));
  }
  return results;
}

const response = await fetch(sourceUrl, { headers: { accept: "application/json" } });
if (!response.ok) throw new Error("Shopify product feed failed: " + response.status);
const payload = await response.json();
const products = Array.isArray(payload.products) ? payload.products : [];
const client = await pool.connect();
let variantCount = 0;
let imageCount = 0;

try {
  await client.query("BEGIN");
  const categories = ["Apparel", "Signs", "Glassware", "Gift Cards", "Beverages", "Event Payments", "Other"];
  for (let index = 0; index < categories.length; index++) {
    const name = categories[index];
    await client.query("INSERT INTO website.shop_categories (slug,name,sort_order,published) VALUES ($1,$2,$3,true) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,sort_order=EXCLUDED.sort_order,published=true,updated_at=now()", [slug(name), name, index * 10]);
  }

  for (let productIndex = 0; productIndex < products.length; productIndex++) {
    const product = products[productIndex];
    const images = await localImages(product);
    imageCount += images.length;
    const category = await client.query("SELECT id FROM website.shop_categories WHERE slug=$1", [slug(categoryName(product))]);
    const productSlug = slug(product.handle || product.title);
    let existing = await client.query("SELECT id FROM website.shop_products WHERE source='shopify' AND source_id=$1", [String(product.id)]);
    if (!existing.rows[0]) existing = await client.query("SELECT id FROM website.shop_products WHERE slug=$1", [productSlug]);
    let productId;
    if (existing.rows[0]) {
      productId = Number(existing.rows[0].id);
      const currentProduct = await client.query("SELECT image_url, additional_image_urls, published FROM website.shop_products WHERE id=$1", [productId]);
      const currentImages = currentProduct.rows[0] || {};
      await client.query("UPDATE website.shop_products SET slug=$2,category_id=$3,name=$4,description=$5,image_url=$6,additional_image_urls=$7::jsonb,published=$8,sort_order=$9,source='shopify',source_id=$10,metadata=$11::jsonb,updated_at=now() WHERE id=$1", [productId, productSlug, category.rows[0]?.id || null, product.title, text(product.body_html), images[0] || currentImages.image_url || "", JSON.stringify(images.length ? images.slice(1) : currentImages.additional_image_urls || []), currentImages.published !== false, productIndex * 10, String(product.id), JSON.stringify({ shopifyHandle: product.handle, shopifyProductType: product.product_type, shopifyTags: product.tags || [] })]);
    } else {
      const inserted = await client.query("INSERT INTO website.shop_products (slug,category_id,name,description,image_url,additional_image_urls,published,featured,sort_order,source,source_id,metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb,true,false,$7,'shopify',$8,$9::jsonb) RETURNING id", [productSlug, category.rows[0]?.id || null, product.title, text(product.body_html), images[0] || "", JSON.stringify(images.slice(1)), productIndex * 10, String(product.id), JSON.stringify({ shopifyHandle: product.handle, shopifyProductType: product.product_type, shopifyTags: product.tags || [] })]);
      productId = Number(inserted.rows[0].id);
    }
    const existingVariants = await client.query("SELECT * FROM website.shop_product_variants WHERE product_id=$1", [productId]);
    const existingByShopifyId = new Map(existingVariants.rows.map((row) => [String(row.metadata?.shopifyVariantId || ""), row]));
    const existingByLabel = new Map(existingVariants.rows.map((row) => [String(row.label || "").toLowerCase(), row]));
    await client.query("DELETE FROM website.shop_product_variants WHERE product_id=$1", [productId]);
    for (let variantIndex = 0; variantIndex < (product.variants || []).length; variantIndex++) {
      const variant = product.variants[variantIndex];
      const existingVariant = existingByShopifyId.get(String(variant.id)) || existingByLabel.get(String(variant.title || "Default").toLowerCase());
      const priceCents = Math.round(Number(variant.price || 0) * 100);
      const compareAtPriceCents = variant.compare_at_price ? Math.round(Number(variant.compare_at_price) * 100) : null;
      const weightOunces = wholeOunces(existingVariant?.weight_ounces ?? (Number(variant.grams || 0) / 28.349523125 || (variant.requires_shipping ? 8 : 1)));
      const glassware = isGlasswareProduct(product);
      const trackInventory = existingVariant?.track_inventory ?? false;
      const inventoryCount = glassware && trackInventory ? Math.max(1, Number(existingVariant?.inventory_count || 0)) : Number(existingVariant?.inventory_count || 0);
      const availableForSale = glassware ? true : (existingVariant?.available_for_sale ?? variant.available !== false);
      await client.query("INSERT INTO website.shop_product_variants (product_id,label,sku,price_cents,compare_at_price_cents,inventory_count,published,sort_order,weight_ounces,requires_shipping,track_inventory,available_for_sale,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)", [productId, variant.title || "Default", variant.sku || "", priceCents, compareAtPriceCents, inventoryCount, existingVariant?.published ?? true, variantIndex * 10, weightOunces, existingVariant?.requires_shipping ?? variant.requires_shipping !== false, trackInventory, availableForSale, JSON.stringify({ shopifyVariantId: String(variant.id) })]);
      variantCount++;
    }
  }

  const bonus = await client.query("SELECT v.id FROM website.shop_product_variants v JOIN website.shop_products p ON p.id=v.product_id WHERE p.source='shopify' AND lower(p.name)='sticker - aviator brewing' ORDER BY v.id LIMIT 1");
  await client.query("UPDATE website.shop_settings SET bonus_enabled=true,bonus_threshold_cents=7500,bonus_variant_id=$1,bonus_label='Free Aviator Brewing sticker',updated_at=now() WHERE id=1", [bonus.rows[0]?.id || null]);
  await client.query("COMMIT");
  console.log("shopify.imported", { products: products.length, variants: variantCount, images: imageCount, bonusConfigured: Boolean(bonus.rows[0]) });
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
