import type { Metadata } from "next";
import Link from "next/link";
import { BeerGallery } from "@/components/beer-gallery";
import { BeerCard } from "@/components/cards";
import { BeyondBeerGallery } from "@/components/beyond-beer-gallery";
import { ArrowUpRight } from "@/components/icons";
import { getAllBeyondBeer } from "@/lib/managed-beyond-beer";
import { getAllBeers, getNewestBeers } from "@/lib/managed-beers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Beer + Beverages", description: "Explore Aviator Brewing Company craft beer, sodas, THC sodas, and seltzers in Fuquay-Varina, North Carolina." };

export default async function BeerPage() {
  const [beers, newestBeers, beverages] = await Promise.all([getAllBeers(), getNewestBeers(2), getAllBeyondBeer()]);
  return <>
    <section className="page-hero beer-page-hero"><div className="content-wrap beer-hero-layout">
      <div><p className="eyebrow">Aviator Flight Line - Fuquay-Varina, NC</p><h1>Fuel for <em>good stories.</em></h1><p className="beer-hero-intro">Core pours, seasonal drops, soda, THC soda, and seltzer. Built for a great first sip and a better second round.</p><div className="beer-hero-stats"><span><b>36+</b> HANDCRAFTED RECIPES</span><span><b>08</b> CORE FLIGHT CREW</span><span><b>60 BBL</b> BREWHOUSE</span></div></div>
      <div className="beer-hero-links" aria-label="Beer and beverage page actions"><Link href="/brewery" data-analytics="beer_explore_brewery"><span>01</span><strong>Explore the brewery</strong><ArrowUpRight /></Link><Link href="#soda" data-analytics="beer_soda_menu"><span>02</span><strong>Soda menu</strong><ArrowUpRight /></Link><Link href="#thc-soda" data-analytics="beer_thc_soda_menu"><span>03</span><strong>THC soda menu</strong><ArrowUpRight /></Link><Link href="#seltzer" data-analytics="beer_seltzer_menu"><span>04</span><strong>Seltzer menu</strong><ArrowUpRight /></Link><Link href="/locations#menus" data-analytics="beer_food_drinks"><span>05</span><strong>Pair it with food</strong><ArrowUpRight /></Link><Link href="/events" data-analytics="beer_releases_events"><span>06</span><strong>See releases + events</strong><ArrowUpRight /></Link></div>
    </div></section>
    <section className="section beer-lineup-section"><div className="content-wrap">
      {newestBeers.length ? <div className="new-squadron" aria-labelledby="new-squadron-title"><div className="section-heading new-squadron-heading"><div><p className="eyebrow">Fresh arrivals</p><h2 id="new-squadron-title">New to the <em>Squadron</em></h2></div><p>The latest two beers added to the Aviator list, staged up front before the full hangar lineup.</p></div><div className="new-squadron-grid">{newestBeers.map((beer) => <BeerCard key={beer.slug} beer={beer} />)}</div></div> : null}
      <div className="section-heading"><div><p className="eyebrow">The hangar lineup</p><h2>Choose your <em>wingman.</em></h2></div><p>Every label has a mission. Browse by style, find your next favorite, and check the individual briefing for the details.</p></div><BeerGallery beers={beers} /></div></section>
    <section className="section beyond-beer-section" id="beyond-beer"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">Beyond the flight line</p><h2>Choose your <em>beverage menu.</em></h2></div><p>Browse soda, THC soda, and seltzer separately—so it is easy to find the right can for the crew.</p></div><BeyondBeerGallery products={beverages} /><aside className="beyond-beer-notice"><div><b>THC BEVERAGES</b><p>For adults 21+ only. Enjoy responsibly. Availability may vary by location and applicable law.</p></div><Link href="/locations" data-analytics="beyond_beer_locations">Find a location <ArrowUpRight /></Link></aside></div></section>
    <section className="beer-dispatch"><div className="content-wrap"><p className="eyebrow">Field dispatch</p><h2>Fresh releases move fast.</h2><p>Beer and beverage availability changes by location and season. Call ahead for a specific product, or make a plan around the next release.</p><Link className="button button-light" href="/events" data-analytics="beer_dispatch_events">See field events <ArrowUpRight /></Link></div></section>
  </>;
}
