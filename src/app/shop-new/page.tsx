import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";
import { ShopBuyBox } from "@/components/shop-buy-button";
import { ShopProductGallery } from "@/components/shop-product-gallery";
import { getShopCatalog, shopVariantAvailable } from "@/lib/shop";

export const metadata: Metadata = { title: "Aviator Supply | Aviator Brewing Company", description: "Shop Aviator Brewing Company apparel, glassware, signs, gifts, and brewery gear with secure checkout." };
export const dynamic = "force-dynamic";

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function ticketDate(value: string) { return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short" }).format(new Date(value)) : "Date to be announced"; }

export default async function ShopNewPage() {
  const { categories, products, settings } = await getShopCatalog();
  const featured = products.find((product) => product.featured) || products.find((product) => product.variants.some(shopVariantAvailable));
  return <div className="shop-new-shell">
    <section className="page-hero shop-new-hero"><div className="content-wrap"><p className="eyebrow">Aviator Supply</p><h1>Gear for the <em>next mission.</em></h1><p>Aviator shirts, signs, glassware, gifts, and brewery goods. Fast cart, secure Stripe checkout, and free shipping on orders over $75.</p><div className="hero-actions"><a className="button" href="#shop-new-catalog">Open catalog <ArrowUpRight /></a><Link className="button button-outline" href="/shop-new/cart">View cart</Link></div></div></section>
    <section className="shop-trust-strip"><div className="content-wrap"><span>SECURE STRIPE CHECKOUT</span><span>USPS SHIPPING</span><span>FREE SHIPPING OVER $75</span></div></section>
    {settings?.bonusEnabled ? <section className="shop-bonus-banner"><div className="content-wrap"><span>FLIGHT CREW BONUS</span><strong>{settings.bonusLabel}</strong><p>Automatically added when merchandise is more than {money(settings.bonusThresholdCents)}.</p></div></section> : null}
    <section id="shop-new-catalog" className="section shop-new-section"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">Current inventory</p><h2>{products.length ? "Aviator goods, ready to ship." : "The depot is being stocked."}</h2></div><p>{products.length ? "Pick the gear, choose sizes, and launch a secure checkout. Compact cards make it easier to scan what is ready to ship." : "Add products in Manager > Shop to publish items here."}</p></div>
      {categories.length ? <nav className="shop-new-categories" aria-label="Shop catalogs"><a href="#shop-new-catalog">All</a>{categories.map((category) => <a href={"#catalog-" + category.slug} key={category.id}>{category.name}</a>)}</nav> : null}
      {products.length ? categories.map((category) => {
        const categoryProducts = products.filter((product) => product.categorySlug === category.slug);
        if (!categoryProducts.length) return null;
        return <section className="shop-new-catalog-group" id={"catalog-" + category.slug} key={category.id}><header><div><p className="eyebrow">{category.name}</p><h3>{category.description || category.name + " catalog"}</h3></div><span>{categoryProducts.length.toString().padStart(2, "0")} ITEMS</span></header><div className="shop-new-grid">{categoryProducts.map((product) => {
          const cutoff = product.ticketSalesEndAt || product.ticketEventStartsAt;
          const ticketSalesOpen = product.productType !== "ticket" || !cutoff || new Date(cutoff).getTime() > Date.now();
          const available = ticketSalesOpen ? product.variants.filter(shopVariantAvailable) : [];
          const soldOut = !available.length || (product.productType === "ticket" && product.ticketAvailableCount < 1);
          const lowest = available.length ? Math.min(...available.map((variant) => variant.priceCents)) : Math.min(...product.variants.map((variant) => variant.priceCents));
          const compareAt = available.map((variant) => variant.compareAtPriceCents || 0).filter((value) => value > lowest).sort((a, b) => a - b)[0];
          return <article className={(featured?.id === product.id ? "shop-new-card is-featured" : "shop-new-card") + (soldOut ? " is-sold-out" : "") + (product.productType === "ticket" ? " is-ticket" : "")} key={product.id}><div className="shop-product-image-wrap"><ShopProductGallery images={product.imageUrls} name={product.name} />{soldOut ? <span className="shop-sold-out-stamp">Sold out</span> : null}</div><div className="shop-new-copy"><p className="eyebrow">{product.categoryName}{product.featured ? "  -  Featured" : ""}</p><h4>{product.name}</h4>{product.productType === "ticket" ? <p className="shop-ticket-meta"><strong>{product.ticketLocationName}</strong><span>{ticketDate(product.ticketEventStartsAt)}</span></p> : null}<p>{product.description}</p>{soldOut ? <p className="shop-sold-out-copy">SOLD OUT - This ticket or product has reached its available quantity.</p> : null}<div className="shop-product-price">{compareAt ? <del>{money(compareAt)}</del> : null}<strong>{money(lowest)}{available.length > 1 ? "+" : ""}</strong></div><ShopBuyBox product={product} /></div></article>;
        })}</div></section>;
      }) : <div className="keg-unavailable"><p className="eyebrow">No shop items yet</p><h2>Nothing is published.</h2><p>Add catalog items, prices, variants, and inventory in the manager portal.</p><Link className="button" href="/manager/shop">Open manager shop <ArrowUpRight /></Link></div>}
    </div></section>
  </div>;
}
