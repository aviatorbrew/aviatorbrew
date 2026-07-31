import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";
import { ShopBuyBox } from "@/components/shop-buy-button";
import { ShopProductGallery } from "@/components/shop-product-gallery";
import { getShopCatalog, shopVariantAvailable } from "@/lib/shop";

export const metadata: Metadata = { title: "ShopNew | Aviator Brewing Company", description: "Shop Aviator Brewing Company apparel, glassware, signs, gifts, and brewery gear with secure checkout." };
export const dynamic = "force-dynamic";

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }

export default async function ShopNewPage() {
  const { categories, products, settings } = await getShopCatalog();
  const featured = products.find((product) => product.featured) || products.find((product) => product.variants.some(shopVariantAvailable));
  return <div className="shop-new-shell">
    <section className="page-hero shop-new-hero"><div className="content-wrap"><p className="eyebrow">Aviator Supply Depot</p><h1>Gear for the <em>next mission.</em></h1><p>Aviator shirts, tap handles, signs, glassware, gifts, and brewery goods. Build a cart, compare USPS shipping, and check out securely.</p><div className="hero-actions"><a className="button" href="#shop-new-catalog">Open catalog <ArrowUpRight /></a><Link className="button button-outline" href="/shop-new/cart">View cart</Link></div></div></section>
    {settings?.bonusEnabled ? <section className="shop-bonus-banner"><div className="content-wrap"><span>FLIGHT CREW BONUS</span><strong>{settings.bonusLabel}</strong><p>Automatically added when merchandise is more than {money(settings.bonusThresholdCents)}.</p></div></section> : null}
    <section id="shop-new-catalog" className="section shop-new-section"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">Current inventory</p><h2>{products.length ? "Aviator goods, ready to ship." : "The depot is being stocked."}</h2></div><p>{products.length ? "Choose options and quantities on each product, then check out everything together." : "Add products in Manager > Shop to publish items here."}</p></div>
      {categories.length ? <nav className="shop-new-categories" aria-label="Shop catalogs"><a href="#shop-new-catalog">All</a>{categories.map((category) => <a href={"#catalog-" + category.slug} key={category.id}>{category.name}</a>)}</nav> : null}
      {products.length ? categories.map((category) => {
        const categoryProducts = products.filter((product) => product.categorySlug === category.slug);
        if (!categoryProducts.length) return null;
        return <section className="shop-new-catalog-group" id={"catalog-" + category.slug} key={category.id}><header><div><p className="eyebrow">{category.name}</p><h3>{category.description || category.name + " catalog"}</h3></div><span>{categoryProducts.length.toString().padStart(2, "0")} ITEMS</span></header><div className="shop-new-grid">{categoryProducts.map((product) => {
          const available = product.variants.filter(shopVariantAvailable);
          const lowest = available.length ? Math.min(...available.map((variant) => variant.priceCents)) : Math.min(...product.variants.map((variant) => variant.priceCents));
          const compareAt = available.map((variant) => variant.compareAtPriceCents || 0).filter((value) => value > lowest).sort((a, b) => a - b)[0];
          return <article className={featured?.id === product.id ? "shop-new-card is-featured" : "shop-new-card"} key={product.id}><ShopProductGallery images={product.imageUrls} name={product.name} /><div className="shop-new-copy"><p className="eyebrow">{product.categoryName}{product.featured ? "  -  Featured" : ""}</p><h4>{product.name}</h4><p>{product.description}</p><div className="shop-product-price">{compareAt ? <del>{money(compareAt)}</del> : null}<strong>{money(lowest)}{available.length > 1 ? "+" : ""}</strong></div><ShopBuyBox product={product} /></div></article>;
        })}</div></section>;
      }) : <div className="keg-unavailable"><p className="eyebrow">No shop items yet</p><h2>Nothing is published.</h2><p>Add catalog items, prices, variants, and inventory in the manager portal.</p><Link className="button" href="/manager/shop">Open manager shop <ArrowUpRight /></Link></div>}
    </div></section>
  </div>;
}
