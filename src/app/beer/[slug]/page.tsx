import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, MapPin } from "@/components/icons";
import { getAllLocations } from "@/lib/managed-locations";
import { getAllBeers } from "@/lib/managed-beers";

export const dynamic = "force-dynamic";
const isPdf = (source: string) => source.toLowerCase().split("?")[0].endsWith(".pdf");

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const beer = (await getAllBeers()).find((item) => item.slug === slug); return { title: beer ? beer.name : "Beer" };
}

export default async function BeerDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [beer, locations] = await Promise.all([getAllBeers().then((items) => items.find((item) => item.slug === slug)), getAllLocations()]);
  if (!beer) notFound();
  return <>
    <section className="beer-detail-flight">
      <div className="beer-detail-art">{isPdf(beer.image) ? <object className="beer-pdf-detail" data={beer.image} type="application/pdf" aria-label={beer.name + " beer artwork PDF"}><a href={beer.image} target="_blank" rel="noreferrer">Open {beer.name} artwork PDF</a></object> : <Image src={beer.image} alt={beer.name + " Aviator beer artwork"} fill priority sizes="(max-width: 760px) 100vw, 48vw" />}</div>
      <div className="beer-detail-brief">
        <p className="eyebrow">{beer.status} CLEARANCE - {beer.category}</p>
        <div className="beer-classification"><span>FLIGHT</span><b>{beer.abv}</b><span>FVNC</span></div>
        <h1>{beer.name}</h1><p className="beer-detail-style">{beer.style}</p><p>{beer.description}</p>
        <dl className="beer-spec-sheet"><div><dt>STYLE</dt><dd>{beer.style}</dd></div><div><dt>ALTITUDE</dt><dd>{beer.abv}</dd></div><div><dt>STATUS</dt><dd>{beer.status}</dd></div></dl>
        <div className="hero-actions"><Link className="button" href="/locations" data-analytics={"beer_find_" + beer.slug}>Find this beer <ArrowUpRight /></Link><Link className="button button-outline" href="/beer">Back to the flight line</Link></div>
      </div>
    </section>
    <section className="section"><div className="content-wrap beer-detail-grid"><article className="flight-notes"><p className="eyebrow">Pilot notes</p><h2>Built to be remembered.</h2><p>This is part of Aviator's current featured lineup. Availability can vary by location and season, so check with the crew before making a special trip.</p></article><article className="flight-notes"><p className="eyebrow">Where to land</p><h2>Find a fresh pour.</h2><div className="beer-location-list">{locations.slice(0, 4).map((location) => <Link key={location.slug} href={"/locations/" + location.slug}><span>{location.shortName}</span><MapPin /></Link>)}</div></article></div></section>
  </>;
}
