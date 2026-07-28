import type { Metadata } from "next";
import Image from "next/image";
import { ArrowUpRight } from "@/components/icons";
import { getLocationHero } from "@/lib/location-photos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Order Food | Aviator Brewing Company",
  description: "Order Aviator food online from the Hangar Bar, TapHouse, or Pub and BeerShop in Fuquay-Varina.",
};

const locations = [
  { number: "01", slug: "hangar-bar", name: "Aviator Hangar Bar", address: "688 Brewing Dr., Fuquay-Varina, NC 27526", copy: "Scratch-made food, wings, burgers, brunch and more from the brewery campus.", fallback: "/images/locations/hangar-bar.png", href: "https://order.toasttab.com/online/aviator-speakeasy-brewery-restaurant-688-brewing-dr" },
  { number: "02", slug: "taphouse", name: "Aviator TapHouse + Kitchen", address: "600 E. Broad St., Fuquay-Varina, NC 27526", copy: "Aviator favorites from the original TapHouse in historic Varina.", fallback: "/images/locations/taphouse.png", href: "https://order.toasttab.com/online/aviator-taphouse-kitchen-600-e-broad-st" },
  { number: "03", slug: "pizza-pub", name: "Aviator Pub + BeerShop", address: "601 E. Broad St., Fuquay-Varina, NC 27526", copy: "Brick-oven pizza, pub favorites, and BeerShop energy for pickup or delivery.", fallback: "/images/locations/pizza-pub.png", href: "https://order.toasttab.com/online/aviator-pizzeria-601-e-broad-st" },
];

export default async function OrderFoodPage() {
  const locationCards = await Promise.all(locations.map(async (location) => ({
    ...location,
    image: await getLocationHero(location.slug, location.fallback),
  })));

  return <main>
    <section className="page-hero order-food-hero"><div className="content-wrap"><p className="eyebrow">Aviator food ordering</p><h1>Pick your kitchen. <em>We&apos;ll handle the rest.</em></h1><p>Choose the Aviator location closest to your crew, then order pickup or delivery through its live ordering menu.</p></div></section>
    <section className="section order-food-section"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">Choose your location</p><h2>Food is cleared <em>for takeoff.</em></h2></div><p>Online ordering opens in a secure new tab. Each kitchen has its own menu and availability.</p></div><div className="order-food-grid">{locationCards.map((location) => <article className="order-food-card" key={location.name}><div className="order-food-image"><Image src={location.image} alt={location.name} fill unoptimized sizes="(max-width: 760px) 100vw, 33vw" /></div><div className="order-food-copy"><span>{location.number}</span><h2>{location.name}</h2><p className="order-food-address">{location.address}</p><p>{location.copy}</p><a className="button button-order-food" href={location.href} target="_blank" rel="noreferrer" data-analytics={"order_food_" + location.number}>Order from this location <ArrowUpRight /></a></div></article>)}</div></div></section>
  </main>;
}
