import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";
import { ShopBuyBox } from "@/components/shop-buy-button";
import { getShopCatalog } from "@/lib/shop";

export const metadata: Metadata = { title: "ShopNew | Aviator Brewing Company", description: "Aviator Brewing Company merchandise, apparel, signs, glasses, and gifts with secure Stripe Checkout." };
export const dynamic = "force-dynamic";

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }

export default async function ShopNewPage({ searchParams }: { searchParams?: Promise<{ checkout?: string }> }) {
  const [{ categories, products }, resolvedParams] = await Promise.all([getShopCatalog(), searchParams || Promise.resolve({ checkout: undefined })]);
  const params = resolvedParams as { checkout?: string };
  const featured = products.find((product) => product.featured) || products[0];
  return <main>
    <section className="page-hero shop-new-hero"><div className="content-wrap"><p className="eyebrow">Aviator shop beta</p><h1>Aviator gear cleared for <em>checkout.</em></h1><p>We are building the Aviator shop inside aviatorbrew.com. Browse current merch, choose an option, and check out securely with Stripe.</p><div className="hero-actions"><a className="button" href="#shop-new-catalog">Shop items <ArrowUpRight /></a><a className="button button-outline" href="https://aviatorbrew.myshopify.com/">Old Shopify store <ArrowUpRight /></a></div></div></section>
    {params.checkout === "success" ? <section className="shop-new-status success"><div className="content-wrap"><strong>Payment received.</strong><span>Thanks for shopping Aviator. The crew will process the order from the Stripe checkout record.</span></div></section> : null}
    {params.checkout === "cancel" ? <section className="shop-new-status"><div className="content-wrap"><strong>Checkout canceled.</strong><span>Your card was not charged. Pick an item below when you are ready.</span></div></section> : null}
    <section id="shop-new-catalog" className="section shop-new-section"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">ShopNew catalog</p><h2>{products.length ? "Aviator goods in the hangar." : "The shop is taxiing into position."}</h2></div><p>{products.length ? "Inventory and pricing are managed from the Aviator manager portal." : "Add products in Manager > Shop to publish items here."}</p></div>
      {categories.length ? <nav className="shop-new-categories" aria-label="Shop catalogs"><a href="#shop-new-catalog">All</a>{categories.map((category) => <a href={"#catalog-" + category.slug} key={category.id}>{category.name}</a>)}</nav> : null}
      {products.length ? categories.map((category) => {
        const categoryProducts = products.filter((product) => product.categorySlug === category.slug);
        if (!categoryProducts.length) return null;
        return <section className="shop-new-catalog-group" id={"catalog-" + category.slug} key={category.id}><header><p className="eyebrow">{category.name}</p><h3>{category.description || "Aviator shop catalog"}</h3></header><div className="shop-new-grid">{categoryProducts.map((product) => <article className={featured?.id === product.id ? "shop-new-card is-featured" : "shop-new-card"} key={product.id}>{product.imageUrl ? <div className="shop-new-image"><Image src={product.imageUrl} alt={product.name} fill unoptimized sizes="(max-width: 800px) 100vw, 33vw" /></div> : <div className="shop-new-image is-empty"><span>AVIATOR</span></div>}<div className="shop-new-copy"><p className="eyebrow">{product.categoryName}{product.featured ? " · Featured" : ""}</p><h4>{product.name}</h4><p>{product.description}</p><strong>{money(Math.min(...product.variants.map((variant) => variant.priceCents)))}{product.variants.length > 1 ? "+" : ""}</strong><ShopBuyBox product={product} /></div></article>)}</div></section>;
      }) : <div className="keg-unavailable"><p className="eyebrow">No shop items yet</p><h2>Nothing is published.</h2><p>Add catalog items, prices, variants, and inventory in the manager portal. Published items with available inventory will appear here.</p><Link className="button" href="/manager/shop">Open manager shop <ArrowUpRight /></Link></div>}
    </div></section>
  </main>;
}
