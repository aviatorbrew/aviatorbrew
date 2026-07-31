"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ShopCatalog, ShopCategory, ShopProduct, ShopVariant } from "@/lib/shop";

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function variantLines(variants: ShopVariant[]) { return variants.map((variant) => [variant.label, (variant.priceCents / 100).toFixed(2), variant.inventoryCount, variant.sku, variant.published ? "true" : "false"].join("|")).join("\n"); }
function publicVariantCount(product: ShopProduct) { return product.variants.filter((variant) => variant.published && variant.inventoryCount > 0).length; }

export function ShopManager() {
  const [catalog, setCatalog] = useState<ShopCatalog>({ categories: [], products: [] });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [editingProduct, setEditingProduct] = useState<ShopProduct | null>(null);
  const [editingCategory, setEditingCategory] = useState<ShopCategory | null>(null);

  async function load() {
    const response = await fetch("/api/manager/shop", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load shop catalog.");
    setCatalog({ categories: body.categories || [], products: body.products || [] });
  }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  async function send(url: string, init: RequestInit, success: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, init);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Shop request failed.");
      setCatalog({ categories: body.categories || [], products: body.products || [] });
      setMessage(success);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Shop request failed.");
      return false;
    } finally { setBusy(false); }
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    values.set("action", "category");
    values.set("published", values.get("published") === "on" ? "true" : "false");
    const ok = await send("/api/manager/shop", { method: editingCategory ? "PATCH" : "POST", body: values }, editingCategory ? "Catalog updated." : "Catalog added.");
    if (ok) { setEditingCategory(null); form.reset(); }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    values.set("action", "product");
    values.set("published", values.get("published") === "on" ? "true" : "false");
    values.set("featured", values.get("featured") === "on" ? "true" : "false");
    const ok = await send("/api/manager/shop", { method: editingProduct ? "PATCH" : "POST", body: values }, editingProduct ? "Product updated." : "Product added.");
    if (ok) { setEditingProduct(null); form.reset(); }
  }

  async function removeProduct(product: ShopProduct) {
    if (!window.confirm("Delete " + product.name + " from ShopNew?")) return;
    await send("/api/manager/shop?type=product&id=" + encodeURIComponent(product.id), { method: "DELETE" }, "Product deleted.");
  }

  async function removeCategory(category: ShopCategory) {
    if (!window.confirm("Delete catalog " + category.name + "? Products in this catalog will become uncategorized.")) return;
    await send("/api/manager/shop?type=category&id=" + encodeURIComponent(category.id), { method: "DELETE" }, "Catalog deleted.");
  }

  const visibleProducts = catalog.products.filter((product) => activeCategory === "all" || product.categorySlug === activeCategory);
  const productDraft = editingProduct;
  const categoryDraft = editingCategory;

  return <section id="shop" className="coupon-manager manager-shop"><p className="eyebrow">ShopNew operations</p><h2>Aviator ShopNew</h2><p>Create the database-backed Aviator shop while Shopify stays live. Organize items by catalog, add one product image, publish products, and enter option lines for sizes, prices, and inventory.</p><p className="media-message" role="status">{message}</p>
    <div className="manager-shop-layout"><aside className="manager-shop-catalogs"><h3>Catalogs</h3><div className="manager-shop-filter"><button type="button" className={activeCategory === "all" ? "is-active" : ""} onClick={() => setActiveCategory("all")}>All</button>{catalog.categories.map((category) => <button type="button" className={activeCategory === category.slug ? "is-active" : ""} onClick={() => setActiveCategory(category.slug)} key={category.id}>{category.name}</button>)}</div><form className="manager-shop-category-form" onSubmit={saveCategory}>{categoryDraft ? <input type="hidden" name="id" value={categoryDraft.id} /> : null}<label>Catalog name<input name="name" required maxLength={80} defaultValue={categoryDraft?.name || ""} placeholder="Apparel" /></label><label>Description<input name="description" maxLength={160} defaultValue={categoryDraft?.description || ""} placeholder="T-shirts, hoodies, and crew gear" /></label><label>Sort order<input name="sortOrder" type="number" defaultValue={categoryDraft?.sortOrder || 0} /></label><label className="manager-event-publish"><input name="published" type="checkbox" defaultChecked={categoryDraft ? categoryDraft.published : true} /> Publish catalog</label><div><button className="button" disabled={busy}>{busy ? "Saving..." : categoryDraft ? "Save catalog" : "Add catalog"}</button>{categoryDraft ? <button className="button button-outline" type="button" onClick={() => setEditingCategory(null)} disabled={busy}>Cancel</button> : null}</div></form>{catalog.categories.length ? <ul>{catalog.categories.map((category) => <li key={category.id}><span>{category.name}</span><div><button type="button" onClick={() => setEditingCategory(category)} disabled={busy}>Edit</button><button type="button" onClick={() => removeCategory(category)} disabled={busy}>Delete</button></div></li>)}</ul> : null}</aside>
      <main className="manager-shop-main"><form className="manager-shop-product-form" onSubmit={saveProduct}>{productDraft ? <input type="hidden" name="id" value={productDraft.id} /> : null}<div className="manager-shop-form-heading"><div><p className="eyebrow">{productDraft ? "Edit product" : "Add product"}</p><h3>{productDraft ? productDraft.name : "New shop item"}</h3></div>{productDraft ? <button className="button button-outline" type="button" onClick={() => setEditingProduct(null)} disabled={busy}>Cancel edit</button> : null}</div><label>Catalog<select name="categoryId" defaultValue={productDraft?.categoryId || catalog.categories[0]?.id || ""}>{catalog.categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>Product name<input name="name" required maxLength={120} defaultValue={productDraft?.name || ""} placeholder="Aviator T-Shirt" /></label><label>Sort order<input name="sortOrder" type="number" defaultValue={productDraft?.sortOrder || 0} /></label><label className="manager-shop-wide">Description<textarea name="description" rows={3} maxLength={900} defaultValue={productDraft?.description || ""} placeholder="Describe the item, color, material, or pickup notes." /></label><label>Product image<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /><small>{productDraft?.imageUrl ? "Leave blank to keep current image." : "JPG, PNG, or WEBP up to 10 MB."}</small></label><input type="hidden" name="imageUrl" value={productDraft?.imageUrl || ""} /><label className="manager-shop-wide">Options / sizes / inventory<textarea name="variants" required rows={6} defaultValue={productDraft ? variantLines(productDraft.variants) : "Default|20.00|10||true"} /><small>One per line: option or size | price | inventory count | SKU optional | published true/false. Example: XL|24.99|8|AVI-TEE-XL|true</small></label><label className="manager-event-publish"><input name="published" type="checkbox" defaultChecked={productDraft ? productDraft.published : true} /> Publish product</label><label className="manager-event-publish"><input name="featured" type="checkbox" defaultChecked={productDraft?.featured || false} /> Feature product</label><button className="button" disabled={busy}>{busy ? "Saving..." : productDraft ? "Save product" : "Add product"}</button></form>
        <div className="manager-shop-products"><h3 className="tour-signups-heading">Shop products</h3>{visibleProducts.length ? visibleProducts.map((product) => <article className={product.published && publicVariantCount(product) ? "" : "is-hidden"} key={product.id}>{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <div className="manager-shop-placeholder">Shop</div>}<div><p className="eyebrow">{product.categoryName} · {product.published ? "Published" : "Draft"} · {publicVariantCount(product)} public option(s)</p><h4>{product.name}</h4><p>{product.description}</p><small>{product.variants.map((variant) => variant.label + " " + money(variant.priceCents) + " / " + variant.inventoryCount).join(" · ")}</small></div><footer><button type="button" onClick={() => setEditingProduct(product)} disabled={busy}>Edit</button><button type="button" onClick={() => removeProduct(product)} disabled={busy}>Delete</button></footer></article>) : <p className="tour-schedule-empty">No products in this catalog yet.</p>}</div>
      </main></div>
  </section>;
}
