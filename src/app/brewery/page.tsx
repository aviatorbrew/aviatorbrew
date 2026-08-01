import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "@/components/icons";
import { BrewingDiagram } from "@/components/brewing-diagram";
import { OpenSinceCounter } from "@/components/open-since-counter";
import { getBreweryHero, getBreweryPhotos, type BreweryPhoto } from "@/lib/brewery-photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "The Brewery",
  description: "Explore Aviator Brewing Company's 60-barrel brewery, brewing process, history, campus, and Saturday brewery tours in Fuquay-Varina, North Carolina.",
};

const processSteps = [
  ["01", "Recipe + grain", "Every beer begins with a target: the style, strength, color, aroma, and finish the brewing crew wants in the glass. Malt and specialty grain build the foundation before a batch enters the brewhouse."],
  ["02", "Mash + separation", "Hot water and milled grain meet in the mash. Time and temperature help convert grain starches into fermentable sugars, then the sweet wort is separated from the spent grain."],
  ["03", "Boil + hops", "The wort moves through the kettle and whirlpool stages. Hop timing shapes bitterness, flavor, and aroma while the brewery prepares the batch for fermentation."],
  ["04", "Fermentation", "Yeast takes over in the cellar, converting sugars into alcohol and carbonation while creating the fermentation character that defines the finished beer."],
  ["05", "Condition + check", "The beer is given time to settle into balance. The crew checks the batch against its recipe and release goals before it moves forward."],
  ["06", "Package + pour", "Finished beer moves to the format built for its next stop, from brewery-fresh draft pours to packaged releases headed across the Aviator lineup."],
];

function BreweryGalleryMedia({ photo, alt, sizes }: { photo: BreweryPhoto; alt: string; sizes: string }) {
  return photo.mediaType === "video"
    ? <video src={photo.url} controls muted playsInline preload="metadata" />
    : <Image src={photo.url} alt={alt} fill unoptimized sizes={sizes} />;
}

export default async function BreweryPage() {
  const [hero, photos] = await Promise.all([getBreweryHero(), getBreweryPhotos()]);
  return <>
    <section className="brewery-hero">
      <Image src="/images/atmosphere/brewery-battleship-afterburner.webp" alt="Battleships firing at sea with F-18s overhead in full afterburner" fill priority unoptimized sizes="100vw" />
      <div className="content-wrap brewery-hero-content">
        <p className="eyebrow">Fuquay-Varina, North Carolina - brewing since 2008</p>
        <h1>Aviator Brewery</h1>
        <p>Built from a one-person airplane-hangar brewery into a five-acre campus anchored by a fully automated 60-barrel, four-vessel brewhouse.</p>
        <div className="hero-actions"><Link className="button" href="/about#brewery-tours">Book a brewery tour <ArrowUpRight /></Link><Link className="button button-outline" href="/beer">Explore the beer lineup</Link></div>
      </div>
      <div className="brewery-hero-specs content-wrap" aria-label="Brewery facts"><span><b>2008</b> First hangar batch</span><span><b>60 BBL</b> Brewhouse</span><span><b>04</b> Brewhouse vessels</span><span><b>2025</b> Campus opened</span></div>
    </section>

    <OpenSinceCounter />

    <section className="section brewery-intro-band">
      <div className="content-wrap brewery-intro-grid">
        <div><p className="eyebrow">Built for the next batch</p><h2>More room for the beer, the crew, and the people who come see it happen.</h2></div>
        <div><p>Aviator Brewing Company began in November 2008 inside a small airplane hangar in Fuquay-Varina, North Carolina. The original operation was lean and hands-on: one employee, a compact brewing system, and two retired 300-gallon dairy tanks repurposed as fermenters. What it lacked in size, it made up for in ambition, resourcefulness, and a determination to produce distinctive craft beer locally.</p><p>Demand grew almost immediately. As more people discovered Aviator beer, the tiny hangar brewery quickly reached its limits. Two used 30-barrel fermenters were brought in to expand production, and by January 2009, just a few months after the first batches were brewed, Aviator beer was being distributed throughout the Triangle. From those early tanks and improvised beginnings, the company continued adding equipment, employees, brands, and places for customers to gather.</p><p>Over the following years, Aviator developed into far more than a production brewery. The business expanded through restaurants, taprooms, live entertainment, special events, and a growing portfolio of craft beverages. Each stage of growth was built around the same basic idea: make great products, create memorable experiences, and give people a reason to come together.</p><p>Planning for the current brewery campus began in 2018. The vision was not simply to construct a larger brewery. Aviator wanted to create a complete destination where brewing, dining, entertainment, private events, and hospitality could operate together. The new facility needed the production capacity and modern controls required for future growth, while still preserving the character and aviation heritage that shaped the company from the beginning.</p><p>Turning that vision into reality required years of engineering, design, permitting, site preparation, construction, equipment installation, and problem-solving. Every part of the property was planned to connect the production brewery with the customer experience, allowing guests to see, taste, and enjoy Aviator products in the same place they are made.</p><p>The new campus at 688 Brewing Drive opened in April 2025. It represents the next chapter of Aviator Brewing Company: a larger and more advanced brewing operation surrounded by restaurants, bars, event spaces, live music, outdoor gathering areas, and aviation-inspired experiences.</p><p>What began with one employee and two old dairy tanks has grown into a destination built around craft, hospitality, and community. The equipment is bigger, the campus is larger, and the reach is wider, but the spirit remains the same: build it ourselves, keep improving, and create something people are excited to experience.</p></div>
      </div>
    </section>

    <section className="section brewery-process-band">
      <div className="content-wrap">
        <div className="section-heading"><div><p className="eyebrow">From grain to glass</p><h2>One batch. <em>Six checkpoints.</em></h2></div><p>The equipment handles scale. The brewing decisions still happen one recipe, one batch, and one release at a time.</p></div>
        <BrewingDiagram />
        <ol className="brewery-process-grid">{processSteps.map(([number, title, copy]) => <li key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol>
      </div>
    </section>

    <section className="section brewery-system-band">
      <div className="content-wrap brewery-system-grid">
        <div className="brewery-system-image"><Image src={hero} alt="Inside Aviator Brewery" fill unoptimized sizes="(max-width: 800px) 100vw, 52vw" /></div>
        <div className="brewery-system-copy"><p className="eyebrow">The production system</p><h2>A 60-barrel brewhouse built for repeatable work.</h2><p>The four-vessel configuration lets the brewing team move major brewhouse stages through dedicated equipment. Automation supports control and consistency across larger batches while the crew remains responsible for recipes, timing, fermentation, conditioning, and release decisions.</p><dl><div><dt>Brewhouse</dt><dd>Fully automated, 60-barrel system</dd></div><div><dt>Configuration</dt><dd>Four dedicated brewhouse vessels</dd></div><div><dt>Campus</dt><dd>Five acres at 688 Brewing Drive</dd></div><div><dt>Connection</dt><dd>Brewery, hospitality, events, and tours on one campus</dd></div></dl></div>
      </div>
    </section>

    <section className="section brewery-gallery-band">
      <div className="content-wrap">
        <div className="section-heading"><div><p className="eyebrow">Inside the brewery</p><h2>The working side of <em>Aviator.</em></h2></div><p>Brewery photography is managed by the Aviator team and updated as the campus and production floor evolve.</p></div>
        <div className="brewery-gallery">{photos.slice(0, 6).map((photo, index) => <figure className={index === 0 ? "is-featured" : ""} key={photo.name}><BreweryGalleryMedia photo={photo} alt={"Aviator Brewery view " + (index + 1)} sizes={index === 0 ? "(max-width: 700px) 100vw, 66vw" : "(max-width: 700px) 100vw, 33vw"} />{index === 0 ? <figcaption>Featured brewery photo</figcaption> : null}</figure>)}</div>
      </div>
    </section>

    <section className="section brewery-history-band">
      <div className="content-wrap">
        <div className="section-heading"><div><p className="eyebrow">Brewery flight log</p><h2>From two dairy tanks to a new brewing campus.</h2></div></div>
        <div className="brewery-history"><article><b>2008</b><h3>The first hangar</h3><p>One employee, two repurposed 300-gallon dairy tanks, and the first Aviator batches.</p></article><article><b>2009</b><h3>Beer leaves the field</h3><p>Distribution begins across the Triangle and the original TapHouse opens in historic Varina.</p></article><article><b>2018</b><h3>The next brewery takes shape</h3><p>Planning begins for a five-acre campus and a fully automated 60-barrel, four-vessel brewhouse.</p></article><article><b>2025</b><h3>688 Brewing Drive opens</h3><p>The new campus opens in April, bringing production, beer, food, music, events, and gathering together.</p></article></div>
      </div>
    </section>

    <section className="brewery-visit-band">
      <div className="content-wrap brewery-visit-grid"><div><p className="eyebrow">See where it is brewed</p><h2>Walk the brewery with the Aviator crew.</h2><p>Saturday brewery tours cover the brewhouse, the campus story, and the route each batch takes toward a finished pour.</p></div><div className="brewery-visit-actions"><Link className="button button-light" href="/about#brewery-tours">Tour schedule + signup <ArrowUpRight /></Link><a href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" target="_blank" rel="noreferrer"><MapPin /> 688 Brewing Drive, Fuquay-Varina, NC 27526</a><Link href="/locations">Explore Aviator locations</Link></div></div>
    </section>
  </>;
}
