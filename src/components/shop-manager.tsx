"use client";

import { type FormEvent, useEffect, useState } from "react";
import type { ShopCatalog, ShopCategory, ShopProduct, ShopVariant } from "@/lib/shop";
import { managerEditHref, returnFromManagerEdit } from "@/lib/manager-edit";

function truthy(value: unknown) { return value === true || value === "true" || value === "1" || value === 1; }
function falsy(value: unknown) { return value === false || value === "false" || value === "0" || value === 0; }
function shopVariantAvailable(variant: ShopVariant) {
  const published = !falsy(variant.published) && truthy(variant.published);
  const availableForSale = !falsy(variant.availableForSale) && truthy(variant.availableForSale);
  const trackInventory = !falsy(variant.trackInventory) && truthy(variant.trackInventory);
  return published && availableForSale && (!trackInventory || Number(variant.inventoryCount) > 0);
}
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function publicVariantCount(product: ShopProduct) { return product.variants.filter(shopVariantAvailable).length; }
function dateTime(value: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function imageWithVersion(src: string, version: number) { return src ? src + (src.includes("?") ? "&" : "?") + "v=" + version : src; }
function wholeOunces(value: unknown, fallback = 8) { const parsed = Number(value); return String(Math.max(1, Math.round(Number.isFinite(parsed) && parsed > 0 ? parsed : fallback))); }
function productImageUrls(product?: ShopProduct | null) { return product?.imageUrls?.length ? product.imageUrls : product?.imageUrl ? [product.imageUrl] : []; }

type ManagedVariant = {
  label: string;
  sku: string;
  price: string;
  compareAtPrice: string;
  inventoryCount: string;
  published: boolean;
  weightOunces: string;
  requiresShipping: boolean;
  trackInventory: boolean;
  availableForSale: boolean;
};

function variantFromProduct(variant: ShopVariant): ManagedVariant {
  return {
    label: variant.label,
    sku: variant.sku,
    price: (variant.priceCents / 100).toFixed(2),
    compareAtPrice: variant.compareAtPriceCents ? (variant.compareAtPriceCents / 100).toFixed(2) : "",
    inventoryCount: String(variant.inventoryCount),
    published: variant.published,
    weightOunces: wholeOunces(variant.weightOunces),
    requiresShipping: variant.requiresShipping,
    trackInventory: variant.trackInventory,
    availableForSale: variant.availableForSale,
  };
}

function blankVariant(): ManagedVariant {
  return { label: "Default", sku: "", price: "20.00", compareAtPrice: "", inventoryCount: "10", published: true, weightOunces: "8", requiresShipping: true, trackInventory: true, availableForSale: true };
}

function ProductForm({ product, categories, busy, onSubmit, onCancel, imageVersion }: { product?: ShopProduct | null; categories: ShopCategory[]; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; imageVersion: number }) {
  const isEdit = Boolean(product);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [variants, setVariants] = useState<ManagedVariant[]>(() => product?.variants.length ? product.variants.map(variantFromProduct) : [blankVariant()]);
  const currentImages = productImageUrls(product);
  const displayedImages = [...currentImages.map((image) => imageWithVersion(image, imageVersion)), ...previewUrls];
  useEffect(() => { setVariants(product?.variants.length ? product.variants.map(variantFromProduct) : [blankVariant()]); setPreviewUrls([]); }, [product?.id]);
  useEffect(() => () => { previewUrls.forEach((url) => URL.revokeObjectURL(url)); }, [previewUrls]);
  function updateVariant(index: number, patch: Partial<ManagedVariant>) { setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, ...patch } : variant)); }
  function addVariant() { setVariants((current) => [...current, { ...blankVariant(), label: "Option " + (current.length + 1) }]); }
  function removeVariant(index: number) { setVariants((current) => current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : current); }
  return <form className="manager-shop-product-form" onSubmit={onSubmit}>
    {product ? <input type="hidden" name="id" value={product.id} /> : null}
    <div className="manager-shop-form-heading"><div><p className="eyebrow">{isEdit ? "Edit product" : "Add product"}</p><h3>{product?.name || "New shop item"}</h3></div><button className="button button-outline" type="button" onClick={onCancel} disabled={busy}>Cancel</button></div>
    <label>Catalog<select name="categoryId" defaultValue={product?.categoryId || categories[0]?.id || ""}>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
    <label>Product name<input name="name" required maxLength={120} defaultValue={product?.name || ""} placeholder="Aviator T-Shirt" /></label>
    <label>Sort order<input name="sortOrder" type="number" defaultValue={product?.sortOrder || 0} /></label>
    <label className="manager-shop-wide">Description<textarea name="description" rows={3} maxLength={900} defaultValue={product?.description || ""} placeholder="Describe the item, color, material, or pickup notes." /></label>
    <label className="manager-shop-wide">Product photos<input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setPreviewUrls(Array.from(event.currentTarget.files || []).map((file) => URL.createObjectURL(file)))} /><small>{currentImages.length ? "Add more photos or remove selected current photos. The first remaining photo is the main product image." : "Upload one or more JPG, PNG, or WEBP photos up to 10 MB each."}</small></label>
    {currentImages.map((image) => <input type="hidden" name="existingImages" value={image} key={image} />)}
    <input type="hidden" name="imageUrl" value={product?.imageUrl || ""} />
    {displayedImages.length ? <div className="manager-shop-current-images manager-shop-wide">{displayedImages.map((image, index) => <div className="manager-shop-current-image" key={image}><img src={image} alt="" /><span>{index === 0 ? "Main photo" : image.startsWith("blob:") ? "New photo" : "Gallery photo"}</span>{!image.startsWith("blob:") ? <label><input name="removeImages" type="checkbox" value={currentImages[index] || ""} /> Remove</label> : null}</div>)}</div> : null}
    <section className="manager-shop-variant-editor manager-shop-wide">
      <div className="manager-shop-form-heading">
        <div><p className="eyebrow">Product options</p><h3>Options, pricing, inventory and shipping</h3></div>
        <button className="button button-outline" type="button" onClick={addVariant} disabled={busy}>Add option</button>
      </div>
      <p className="manager-shop-variant-intro">Use one option for a standard item. Add options for sizes, colors, or other versions that need their own price or inventory.</p>
      <input type="hidden" name="variantCount" value={variants.length} />
      {variants.map((variant, index) => <article className="manager-shop-variant-row" key={index}>
        <header>
          <div><span>Option {index + 1}</span><strong>{variant.label || "Untitled option"}</strong></div>
          <div className="manager-shop-variant-status"><span className={variant.published && variant.availableForSale ? "is-ready" : ""}>{variant.published && variant.availableForSale ? "For sale" : "Not for sale"}</span>{variants.length > 1 ? <button type="button" onClick={() => removeVariant(index)} disabled={busy}>Remove</button> : null}</div>
        </header>

        <section className="manager-shop-variant-section">
          <div className="manager-shop-variant-section-title"><span>1</span><div><h4>Option</h4><p>Name this size or version and give it a SKU.</p></div></div>
          <div className="manager-shop-variant-section-body">
            <div className="manager-shop-variant-fields">
              <label>Option / size<input name={"variantLabel_" + index} required maxLength={80} value={variant.label} onChange={(event) => updateVariant(index, { label: event.currentTarget.value })} placeholder="Default, Small, Large" /></label>
              <label>SKU<input name={"variantSku_" + index} maxLength={80} value={variant.sku} onChange={(event) => updateVariant(index, { sku: event.currentTarget.value })} placeholder="Optional internal SKU" /></label>
            </div>
            <div className="manager-shop-variant-toggles">
              <label><input name={"variantPublished_" + index} type="checkbox" checked={variant.published} onChange={(event) => updateVariant(index, { published: event.currentTarget.checked })} /><span><strong>Publish option</strong><small>Show this option with the product.</small></span></label>
              <label><input name={"variantAvailable_" + index} type="checkbox" checked={variant.availableForSale} onChange={(event) => updateVariant(index, { availableForSale: event.currentTarget.checked })} /><span><strong>Available for sale</strong><small>Allow customers to add it to the cart.</small></span></label>
            </div>
          </div>
        </section>

        <section className="manager-shop-variant-section">
          <div className="manager-shop-variant-section-title"><span>2</span><div><h4>Pricing</h4><p>Set the selling price and optional original price.</p></div></div>
          <div className="manager-shop-variant-section-body">
            <div className="manager-shop-variant-fields">
              <label>Price ($)<input name={"variantPrice_" + index} type="number" min="0" step="0.01" required value={variant.price} onChange={(event) => updateVariant(index, { price: event.currentTarget.value })} /></label>
              <label>Compare-at price ($)<input name={"variantCompareAtPrice_" + index} type="number" min="0" step="0.01" value={variant.compareAtPrice} onChange={(event) => updateVariant(index, { compareAtPrice: event.currentTarget.value })} placeholder="Optional" /></label>
            </div>
            <small className="manager-shop-variant-help">Use compare-at price only when you want to show an original price beside a lower sale price.</small>
          </div>
        </section>

        <section className="manager-shop-variant-section">
          <div className="manager-shop-variant-section-title"><span>3</span><div><h4>Inventory</h4><p>Choose whether stock controls availability.</p></div></div>
          <div className="manager-shop-variant-section-body">
            <div className="manager-shop-variant-fields">
              <label>Inventory count<input name={"variantInventory_" + index} type="number" min="0" step="1" value={variant.inventoryCount} disabled={!variant.trackInventory} onChange={(event) => updateVariant(index, { inventoryCount: event.currentTarget.value })} /></label>
            </div>
            <div className="manager-shop-variant-toggles manager-shop-variant-toggles-single">
              <label><input name={"variantTrackInventory_" + index} type="checkbox" checked={variant.trackInventory} onChange={(event) => updateVariant(index, { trackInventory: event.currentTarget.checked })} /><span><strong>Track inventory</strong><small>When enabled, this option becomes unavailable at zero.</small></span></label>
            </div>
          </div>
        </section>

        <section className="manager-shop-variant-section">
          <div className="manager-shop-variant-section-title"><span>4</span><div><h4>Shipping</h4><p>Set whether this option ships and its packed weight.</p></div></div>
          <div className="manager-shop-variant-section-body">
            <div className="manager-shop-variant-toggles manager-shop-variant-toggles-single">
              <label><input name={"variantRequiresShipping_" + index} type="checkbox" checked={variant.requiresShipping} onChange={(event) => updateVariant(index, { requiresShipping: event.currentTarget.checked })} /><span><strong>Requires shipping</strong><small>Turn this off for pickup-only or digital items.</small></span></label>
            </div>
            <div className="manager-shop-variant-fields manager-shop-variant-fields-shipping">
              <label>Weight (ounces)<input name={"variantWeightOunces_" + index} type="number" min="1" step="1" value={variant.weightOunces} required={variant.requiresShipping} disabled={!variant.requiresShipping} onChange={(event) => updateVariant(index, { weightOunces: event.currentTarget.value })} /></label>
              <small className="manager-shop-variant-help">{variant.requiresShipping ? "Enter the packed product weight used to estimate shipping." : "Weight is not required because shipping is turned off."}</small>
            </div>
          </div>
        </section>
      </article>)}
    </section>
    <label className="manager-event-publish"><input name="published" type="checkbox" defaultChecked={product ? product.published : true} /> Publish product</label>
    <label className="manager-event-publish"><input name="featured" type="checkbox" defaultChecked={product?.featured || false} /> Feature product</label>
    <button className="button" disabled={busy}>{busy ? "Saving..." : isEdit ? "Save product" : "Add product"}</button>
  </form>;
}

export function ShopManager({ editId, editType, returnTo }: { editId?: string; editType?: string; returnTo?: string } = {}) {
  const [catalog, setCatalog] = useState<ShopCatalog>({ categories: [], products: [], orders: [] });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ShopProduct | null>(null);
  const [editingCategory, setEditingCategory] = useState<ShopCategory | null>(null);
  const [editingCheckoutSettings, setEditingCheckoutSettings] = useState(false);
  const [orderStart, setOrderStart] = useState("");
  const [orderEnd, setOrderEnd] = useState("");
  const [imageVersion, setImageVersion] = useState(Date.now());

  async function load(filters: { orderStart?: string; orderEnd?: string } = {}) {
    const params = new URLSearchParams();
    if (filters.orderStart) params.set("orderStart", filters.orderStart);
    if (filters.orderEnd) params.set("orderEnd", filters.orderEnd);
    const response = await fetch("/api/manager/shop" + (params.size ? "?" + params.toString() : ""), { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load shop catalog.");
    setCatalog(body);
    if (editId) {
      if (editType === "category") {
        const category = (body.categories || []).find((item: ShopCategory) => String(item.id) === editId);
        if (category) { setEditingCategory(category); setAddingCategory(false); }
      } else {
        const product = (body.products || []).find((item: ShopProduct) => String(item.id) === editId);
        if (product) setEditingProduct(product);
      }
    }
  }
  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [editId, editType]);

  async function send(url: string, init: RequestInit, success: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, init);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Shop request failed.");
      setCatalog(body); setMessage(success); return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Shop request failed."); return false;
    } finally { setBusy(false); }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    values.set("action", "settings");
    values.set("bonusEnabled", values.get("bonusEnabled") === "on" ? "true" : "false");
    const ok = await send("/api/manager/shop", { method: "PATCH", body: values }, "Shop checkout settings updated.");
    if (ok) setEditingCheckoutSettings(false);
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    values.set("action", "category");
    values.set("published", values.get("published") === "on" ? "true" : "false");
    const ok = await send("/api/manager/shop", { method: editingCategory ? "PATCH" : "POST", body: values }, editingCategory ? "Catalog updated." : "Catalog added.");
    if (ok) { if (returnTo) returnFromManagerEdit(returnTo, "/manager/shop"); setEditingCategory(null); setAddingCategory(false); form.reset(); }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const isEdit = Boolean(values.get("id"));
    values.set("action", "product");
    values.set("published", values.get("published") === "on" ? "true" : "false");
    values.set("featured", values.get("featured") === "on" ? "true" : "false");
    const ok = await send("/api/manager/shop", { method: isEdit ? "PATCH" : "POST", body: values }, isEdit ? "Product updated." : "Product added.");
    if (ok) {
      setImageVersion(Date.now());
      setEditingProduct(null);
      setAddingProduct(false);
      form.reset();
      if (returnTo) returnFromManagerEdit(returnTo, "/manager/shop");
    }
  }

  async function removeProduct(product: ShopProduct) {
    if (!window.confirm("Delete " + product.name + " from Aviator Supply?")) return;
    await send("/api/manager/shop?type=product&id=" + encodeURIComponent(product.id), { method: "DELETE" }, "Product deleted.");
  }

  async function removeCategory(category: ShopCategory) {
    if (!window.confirm("Delete catalog " + category.name + "? Products in this catalog will become uncategorized.")) return;
    const ok = await send("/api/manager/shop?type=category&id=" + encodeURIComponent(category.id), { method: "DELETE" }, "Catalog deleted.");
    if (ok && activeCategory === category.slug) setActiveCategory("all");
  }

  async function moveCategory(category: ShopCategory, direction: -1 | 1) {
    const index = catalog.categories.findIndex((item) => item.id === category.id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= catalog.categories.length) return;
    const next = [...catalog.categories];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    const values = new FormData();
    values.set("action", "category-order");
    values.set("categoryIds", next.map((item) => item.id).join(","));
    await send("/api/manager/shop", { method: "PATCH", body: values }, "Catalog order updated.");
  }

  async function queryOrders(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await load({ orderStart, orderEnd }).catch((error) => setMessage(error.message));
  }

  async function clearOrderQuery() {
    setOrderStart("");
    setOrderEnd("");
    await load().catch((error) => setMessage(error.message));
  }

  const visibleProducts = catalog.products.filter((product) => activeCategory === "all" || product.categorySlug === activeCategory);
  const settings = catalog.settings;
  const variantOptions = catalog.products.flatMap((product) => product.variants.map((variant) => ({ id: variant.id, label: product.name + " - " + variant.label })));

  return <section id="shop" className="coupon-manager manager-shop"><p className="eyebrow">Aviator Supply operations</p><h2>Aviator Supply</h2><p>Manage the dark storefront, full cart, Stripe orders, product catalogs, USPS parcel defaults, and automatic order bonus.</p><p className="media-message" role="status">{message}</p>
    <div className="manager-shop-layout"><aside className="manager-shop-catalogs"><div className="manager-shop-catalog-heading"><h3>Catalogs</h3><button className="button" type="button" onClick={() => { setAddingCategory(true); setEditingCategory(null); }} disabled={busy || addingCategory}>Add catalog</button></div><div className="manager-shop-filter"><button type="button" className={activeCategory === "all" ? "is-active" : ""} onClick={() => setActiveCategory("all")}>All</button>{catalog.categories.map((category) => <button type="button" className={activeCategory === category.slug ? "is-active" : ""} onClick={() => setActiveCategory(category.slug)} key={category.id}>{category.name}</button>)}</div>{addingCategory || editingCategory ? <form key={editingCategory ? "category-" + editingCategory.id : "new-category"} className="manager-shop-category-form" onSubmit={saveCategory}>{editingCategory ? <input type="hidden" name="id" value={editingCategory.id} /> : null}<label>Catalog name<input name="name" required maxLength={80} defaultValue={editingCategory?.name || ""} placeholder="Apparel" /></label><label>Description<input name="description" maxLength={160} defaultValue={editingCategory?.description || ""} placeholder="T-shirts, hoodies, and crew gear" /></label><label>Sort order<input name="sortOrder" type="number" defaultValue={editingCategory?.sortOrder || 0} /></label><label className="manager-event-publish"><input name="published" type="checkbox" defaultChecked={editingCategory ? editingCategory.published : true} /> Publish catalog</label><div><button className="button" disabled={busy}>{busy ? "Saving..." : editingCategory ? "Save catalog" : "Add catalog"}</button><button className="button button-outline" type="button" onClick={() => returnTo ? returnFromManagerEdit(returnTo, "/manager/shop") : (() => { setEditingCategory(null); setAddingCategory(false); })()} disabled={busy}>Cancel</button></div></form> : null}{catalog.categories.length ? <ul>{catalog.categories.map((category, index) => <li key={category.id}><span><strong>{category.name}</strong><small>Order {category.sortOrder}</small></span><div><button type="button" onClick={() => moveCategory(category, -1)} disabled={busy || index === 0}>Up</button><button type="button" onClick={() => moveCategory(category, 1)} disabled={busy || index === catalog.categories.length - 1}>Down</button><a className="button" href={managerEditHref("shop", String(category.id), "category")}>Edit</a><button type="button" onClick={() => removeCategory(category)} disabled={busy}>Delete</button></div></li>)}</ul> : null}</aside>
      <div className="manager-shop-main"><div className="manager-shop-product-toolbar"><div><p className="eyebrow">Products</p><h3>Shop items</h3></div><button className="button" type="button" onClick={() => { setAddingProduct(true); setEditingProduct(null); }} disabled={busy || addingProduct}>Add new item</button></div>
        {addingProduct ? <ProductForm categories={catalog.categories} busy={busy} onSubmit={saveProduct} onCancel={() => setAddingProduct(false)} imageVersion={imageVersion} /> : null}
        {settings ? <section className="manager-shop-settings-panel"><div className="manager-shop-form-heading"><div><p className="eyebrow">Checkout controls</p><h3>Order bonus + shipping</h3></div><button className="button button-outline" type="button" onClick={() => setEditingCheckoutSettings((open) => !open)} disabled={busy}>{editingCheckoutSettings ? "Collapse" : "Edit"}</button></div>{!editingCheckoutSettings ? <div className="manager-shop-settings-summary"><span>{settings.bonusEnabled ? "Bonus on" : "Bonus off"}</span><span>{settings.bonusLabel || "No bonus label"}</span><span>{money(settings.bonusThresholdCents)} minimum</span><span>Orders to {settings.orderNotificationEmail}</span></div> : <form className="manager-shop-settings" onSubmit={saveSettings}>
      <label className="manager-event-publish"><input name="bonusEnabled" type="checkbox" defaultChecked={settings.bonusEnabled} /> Enable order bonus</label>
      <label>Bonus starts over<input name="bonusThreshold" type="number" min="0" step=".01" defaultValue={(settings.bonusThresholdCents / 100).toFixed(2)} /></label>
      <label>Bonus product / option<select name="bonusVariantId" defaultValue={settings.bonusVariantId || ""}><option value="">No bonus item</option>{variantOptions.map((variant) => <option value={variant.id} key={variant.id}>{variant.label}</option>)}</select></label>
      <label>Customer-facing bonus name<input name="bonusLabel" defaultValue={settings.bonusLabel} maxLength={120} /></label>
      <label>Order notification email<input name="orderNotificationEmail" type="email" defaultValue={settings.orderNotificationEmail} required autoComplete="email" /><small>Paid Aviator Supply order details are sent here after Stripe confirms payment.</small></label>
      <label>Ship-from name<input name="originName" defaultValue={settings.originName} required /></label>
      <label>Ship-from street<input name="originStreet1" defaultValue={settings.originStreet1} required /></label>
      <label>Suite / unit<input name="originStreet2" defaultValue={settings.originStreet2} /></label>
      <label>City<input name="originCity" defaultValue={settings.originCity} required /></label>
      <label>State<input name="originState" defaultValue={settings.originState} required maxLength={2} /></label>
      <label>ZIP<input name="originZip" defaultValue={settings.originZip} required /></label>
      <label>Country<input name="originCountry" defaultValue={settings.originCountry} required maxLength={2} /></label>
      <label>Phone<input name="originPhone" defaultValue={settings.originPhone} /></label>
      <label>Default box length (in)<input name="parcelLength" type="number" min=".1" step=".1" defaultValue={settings.parcelLength} /></label>
      <label>Default box width (in)<input name="parcelWidth" type="number" min=".1" step=".1" defaultValue={settings.parcelWidth} /></label>
      <label>Default box height (in)<input name="parcelHeight" type="number" min=".1" step=".1" defaultValue={settings.parcelHeight} /></label>
      <button className="button" disabled={busy}>{busy ? "Saving..." : "Save checkout settings"}</button>
    </form>}</section> : null}
        <div className="manager-shop-products"><h3 className="tour-signups-heading">Shop products ({visibleProducts.length})</h3>{visibleProducts.length ? visibleProducts.map((product) => <article className={(product.published && publicVariantCount(product) ? "" : "is-hidden") + (editingProduct?.id === product.id ? " is-editing" : "")} key={product.id}>{productImageUrls(product).length ? <div className="manager-shop-product-thumbs">{productImageUrls(product).slice(0, 3).map((image) => <img src={imageWithVersion(image, imageVersion)} alt="" key={image} />)}{productImageUrls(product).length > 3 ? <span>+{productImageUrls(product).length - 3}</span> : null}</div> : <div className="manager-shop-placeholder">Shop</div>}<div><p className="eyebrow">{product.categoryName}  -  {product.published ? "Published" : "Draft"}  -  {product.source === "shopify" ? "Shopify import" : "Manager"}  -  {publicVariantCount(product)} available</p><h4>{product.name}</h4><p>{product.description}</p><small>{product.variants.map((variant) => variant.label + " " + money(variant.priceCents) + " / " + (variant.trackInventory ? variant.inventoryCount + " in stock" : variant.availableForSale ? "available, untracked" : "unavailable")).join("  -  ")}</small></div><footer><button className="button" type="button" onClick={() => { setEditingProduct(product); setAddingProduct(false); }}>Edit</button><button type="button" onClick={() => removeProduct(product)} disabled={busy}>Delete</button></footer>{editingProduct?.id === product.id ? <div className="manager-shop-inline-edit"><ProductForm product={editingProduct} categories={catalog.categories} busy={busy} onSubmit={saveProduct} onCancel={() => setEditingProduct(null)} imageVersion={imageVersion} /></div> : null}</article>) : <p className="tour-schedule-empty">No products in this catalog yet.</p>}</div>
      </div></div>
    <section className="manager-shop-orders"><div className="manager-shop-form-heading"><div><p className="eyebrow">Stripe fulfillment queue</p><h3>Orders{catalog.orders ? " (" + catalog.orders.length + ")" : ""}</h3></div><button className="button button-outline" type="button" onClick={() => load({ orderStart, orderEnd }).catch((error) => setMessage(error.message))}>Refresh orders</button></div><form className="manager-shop-order-query" onSubmit={queryOrders}><label>Start date<input type="date" value={orderStart} onChange={(event) => setOrderStart(event.currentTarget.value)} /></label><label>End date<input type="date" value={orderEnd} onChange={(event) => setOrderEnd(event.currentTarget.value)} /></label><div><button className="button" disabled={busy}>Query orders</button><button className="button button-outline" type="button" onClick={clearOrderQuery} disabled={busy}>Clear dates</button></div><small>Queries all stored Aviator Supply orders in the database by order creation date. Blank dates show the most recent orders.</small></form>{catalog.orders?.length ? <div className="manager-shop-order-list">{catalog.orders.map((order) => <article key={order.id}><header><div><strong>Order #{order.id}</strong><span>{order.status.toUpperCase()}</span></div><time>{dateTime(order.createdAt)}</time></header><p>{order.customerName || "Guest"}  -  {order.customerEmail || "No email"}  -  {order.shippingService || "No shipping"}</p><ul>{order.items.map((item, index) => <li key={index}><span>{item.isBonus ? "BONUS  -  " : ""}{item.productName} / {item.variantLabel}  -  {item.quantity}</span><strong>{item.isBonus ? "FREE" : money(item.unitPriceCents * item.quantity)}</strong></li>)}</ul><footer><span>Merchandise {money(order.subtotalCents)}</span><span>Shipping {money(order.shippingCents)}</span><strong>Total {money(order.amountTotalCents)}</strong></footer></article>)}</div> : <p className="tour-schedule-empty">No Aviator Supply orders found for that date range.</p>}</section>
  </section>;
}
