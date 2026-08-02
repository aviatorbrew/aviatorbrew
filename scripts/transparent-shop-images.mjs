import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import sharp from "sharp";

function loadEnvFile(filename) {
  const fullPath = path.join(process.cwd(), filename);
  if (!existsSync(fullPath)) return;
  const contents = readFileSync(fullPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}


loadEnvFile(".env.local");
loadEnvFile(".env");

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) throw new Error("DATABASE_URL or POSTGRES_URL is required.");

const imageRoot = process.env.SHOP_PRODUCT_IMAGES_DIRECTORY || path.join(process.cwd(), "public", "media", "shop-products");
const lookupRoots = [...new Set([imageRoot, path.join(imageRoot, "shopify"), path.join(process.cwd(), "public", "media", "shop-products"), path.join(process.cwd(), "public", "media", "shop-products", "shopify")])];
const pool = new Pool({ connectionString, max: 1, ...(process.env.POSTGRES_SSL === "true" || /sslmode=require/i.test(connectionString) ? { ssl: { rejectUnauthorized: false } } : {}) });

function basenameFromUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try { return path.basename(new URL(raw, "https://aviatorbrew.com").pathname); } catch { return path.basename(raw); }
}

function apiUrl(filename) {
  return "/api/shop-product-images/" + encodeURIComponent(filename);
}

async function findImagePath(filename) {
  for (const root of lookupRoots) {
    const candidate = path.join(root, filename);
    if (existsSync(candidate)) return candidate;
  }
  return "";
}

async function fallbackImageForSlug(slug) {
  const candidates = ["-1-transparent.png", "-1.png", "-1.jpg", "-1.jpeg", "-1.webp"].map((suffix) => String(slug || "") + suffix);
  for (const filename of candidates) {
    const filePath = await findImagePath(filename);
    if (filePath) return { filePath, url: apiUrl(filename) };
  }
  return null;
}

function colorDistance(data, offset, color) {
  const dr = Number(data[offset]) - color.r;
  const dg = Number(data[offset + 1]) - color.g;
  const db = Number(data[offset + 2]) - color.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function hasTransparentPixels(data, totalPixels) {
  for (let index = 0; index < totalPixels; index += 1) if (data[index * 4 + 3] < 250) return true;
  return false;
}

function backgroundColorFromCorners(data, width, height) {
  const sample = Math.max(4, Math.min(24, Math.floor(Math.min(width, height) * .08)));
  const corners = [[0, 0], [Math.max(0, width - sample), 0], [0, Math.max(0, height - sample)], [Math.max(0, width - sample), Math.max(0, height - sample)]];
  let r = 0, g = 0, b = 0, count = 0;
  for (const [startX, startY] of corners) {
    for (let y = startY; y < Math.min(height, startY + sample); y += 1) {
      for (let x = startX; x < Math.min(width, startX + sample); x += 1) {
        const offset = (y * width + x) * 4;
        r += Number(data[offset]); g += Number(data[offset + 1]); b += Number(data[offset + 2]); count += 1;
      }
    }
  }
  return count ? { r: r / count, g: g / count, b: b / count } : { r: 255, g: 255, b: 255 };
}

function removeConnectedBackground(data, width, height) {
  const totalPixels = width * height;
  const background = backgroundColorFromCorners(data, width, height);
  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0, tail = 0;
  const enqueue = (index) => { if (!visited[index]) { visited[index] = 1; queue[tail] = index; tail += 1; } };
  const isBackground = (index) => colorDistance(data, index * 4, background) <= 76;
  for (let x = 0; x < width; x += 1) {
    if (isBackground(x)) enqueue(x);
    const bottom = (height - 1) * width + x;
    if (isBackground(bottom)) enqueue(bottom);
  }
  for (let y = 0; y < height; y += 1) {
    const left = y * width;
    const right = left + width - 1;
    if (isBackground(left)) enqueue(left);
    if (isBackground(right)) enqueue(right);
  }
  while (head < tail) {
    const index = queue[head]; head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1];
    for (const next of neighbors) if (next >= 0 && !visited[next] && isBackground(next)) enqueue(next);
  }
  let transparentPixels = 0;
  for (let index = 0; index < totalPixels; index += 1) {
    if (!visited[index]) continue;
    const offset = index * 4;
    const distance = colorDistance(data, offset, background);
    const alpha = distance <= 28 ? 0 : distance >= 76 ? 255 : Math.round(((distance - 28) / 48) * 255);
    if (alpha < data[offset + 3]) data[offset + 3] = alpha;
    if (data[offset + 3] < 250) transparentPixels += 1;
  }
  return transparentPixels > 0;
}

async function convertImage(filePath) {
  const original = await readFile(filePath);
  const decoded = await sharp(original, { failOn: "none" }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  if (!width || !height || channels !== 4) return { status: "skipped" };
  if (hasTransparentPixels(decoded.data, width * height)) return { status: "already-transparent" };
  if (!removeConnectedBackground(decoded.data, width, height)) return { status: "skipped" };
  const png = await sharp(decoded.data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const ext = path.extname(filePath).toLowerCase();
  const outputPath = ext === ".png" ? filePath : path.join(path.dirname(filePath), path.basename(filePath, ext) + "-transparent.png");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, png);
  return { status: "converted", outputPath };
}

function uniqueImages(row) {
  const additional = Array.isArray(row.additional_image_urls) ? row.additional_image_urls : [];
  return [...new Set([row.image_url, ...additional].map(String).filter(Boolean))];
}

try {
  const result = await pool.query("SELECT id,slug,image_url,additional_image_urls FROM website.shop_products ORDER BY id");
  const urlMap = new Map();
  const stats = { products: result.rows.length, images: 0, converted: 0, alreadyTransparent: 0, repairedMissing: 0, missing: 0, skipped: 0, updatedProducts: 0 };
  for (const row of result.rows) {
    for (const url of uniqueImages(row)) {
      if (urlMap.has(url)) continue;
      stats.images += 1;
      const filename = basenameFromUrl(url);
      let filePath = filename ? await findImagePath(filename) : "";
      if (!filePath) {
        const fallback = await fallbackImageForSlug(row.slug);
        if (fallback) { urlMap.set(url, fallback.url); filePath = fallback.filePath; stats.repairedMissing += 1; }
      }
      if (!filePath) { stats.missing += 1; continue; }
      const conversion = await convertImage(filePath);
      if (conversion.status === "converted") {
        const nextUrl = apiUrl(path.basename(conversion.outputPath));
        urlMap.set(url, nextUrl);
        stats.converted += 1;
      } else if (conversion.status === "already-transparent") {
        stats.alreadyTransparent += 1;
      } else {
        stats.skipped += 1;
      }
    }
  }
  for (const row of result.rows) {
    const additional = Array.isArray(row.additional_image_urls) ? row.additional_image_urls.map(String) : [];
    const nextImage = urlMap.get(String(row.image_url || "")) || row.image_url || "";
    const nextAdditional = additional.map((url) => urlMap.get(url) || url);
    const changed = nextImage !== row.image_url || JSON.stringify(nextAdditional) !== JSON.stringify(additional);
    if (!changed) continue;
    await pool.query("UPDATE website.shop_products SET image_url=$2, additional_image_urls=$3::jsonb, updated_at=now() WHERE id=$1", [row.id, nextImage, JSON.stringify(nextAdditional)]);
    stats.updatedProducts += 1;
  }
  console.log(JSON.stringify(stats, null, 2));
} finally {
  await pool.end();
}
