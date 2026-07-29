import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "@/components/icons";
import { BrewingDiagram } from "@/components/brewing-diagram";
import { getBreweryHero, getBreweryPhotos } from "@/lib/brewery-photos";

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

export default async function BreweryPage() {
  const [hero, photos] = await Promise.all([getBreweryHero(), getBreweryPhotos()]);
  return <>
    <section className="brewery-hero">
      <Image src="/images/p51-strafing-hero-restored.png" alt="P-51 Mustang flying over Aviator Brewery" fill priority unoptimized sizes="100vw" />
      <div className="content-wrap brewery-hero-content">
        <p className="eyebrow">Fuquay-Varina, North Carolina - brewing since 2008</p>
        <h1>Aviator Brewery</h1>
        <p>Built from a one-person airplane-hangar brewery into a five-acre campus anchored by a fully automated 60-barrel, four-vessel brewhouse.</p>
        <div className="hero-actions"><Link className="button" href="/about#brewery-tours">Book a brewery tour <ArrowUpRight /></Link><Link className="button button-outline" href="/beer">Explore the beer lineup</Link></div>
      </div>
      <div className="brewery-hero-specs content-wrap" aria-label="Brewery facts"><span><b>2008</b> First hangar batch</span><span><b>60 BBL</b> Brewhouse</span><span><b>04</b> Brewhouse vessels</span><span><b>2025</b> Campus opened</span></div>
    </section>

    <section className="section brewery-intro-band">
      <div className="content-wrap brewery-intro-grid">
        <div><p className="eyebrow">Built for the next batch</p><h2>More room for the beer, the crew, and the people who come see it happen.</h2></div>
        <div><p>Aviator began in November 2008 inside a small airplane hangar with one employee and two old 300-gallon dairy tanks. Demand moved quickly. Two used 30-barrel fermenters followed, and by January 2009 Aviator beer was moving across the Triangle.</p><p>Planning for the current brewery campus began in 2018. The goal was a brewing home with the capacity, controls, and gathering space to connect production with the larger Aviator experience. After years of planning, permitting, site work, and construction, the campus at 688 Brewing Drive opened in April 2025.</p></div>
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
        <div className="brewery-gallery">{photos.slice(0, 6).map((photo, index) => <figure className={index === 0 ? "is-featured" : ""} key={photo.name}><Image src={photo.url} alt={"Aviator Brewery view " + (index + 1)} fill unoptimized sizes={index === 0 ? "(max-width: 700px) 100vw, 66vw" : "(max-width: 700px) 100vw, 33vw"} />{index === 0 ? <figcaption>Featured brewery photo</figcaption> : null}</figure>)}</div>
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
