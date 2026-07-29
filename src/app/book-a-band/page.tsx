import type { Metadata } from "next";
import { ArrowUpRight } from "@/components/icons";

export const metadata: Metadata = {
  title: "Book a Band | Aviator Brewing Company",
  description: "Submit your band to play Aviator Brewing Company venues through Aviator Live.",
};

export const dynamic = "force-dynamic";

export default function BookABandPage() {
  const applyUrl = process.env.AVIATOR_LIVE_APPLY_URL || (process.env.NODE_ENV === "development" ? "http://localhost:5123/apply" : "https://aviatorlive.beer/apply");
  return <main>
    <section className="page-hero more-hero"><div className="content-wrap"><p className="eyebrow">Aviator Live</p><h1>Bring your sound <em>to Aviator.</em></h1><p>Band booking for the Aviator Amphitheater, Ready Room Stage, Hangar Bar Stage, Pizza Pub Backyard, and TapHouse Patio is managed through Aviator Live.</p><div className="hero-actions"><a className="button" href={applyUrl} target="_blank" rel="noreferrer" data-analytics="aviator_live_band_apply">Apply through Aviator Live <ArrowUpRight /></a></div></div></section>
    <section className="section section-dark"><div className="content-wrap split-content"><div><p className="eyebrow">Booking portal</p><h2>One crew. <em>One flight plan.</em></h2></div><div><p>Use Aviator Live to submit your band, share music and social links, and provide the details needed for programming our venues. It opens in a new tab so you can return here to explore the rest of Aviator.</p><a className="section-link" href={applyUrl} target="_blank" rel="noreferrer">Open Aviator Live <ArrowUpRight /></a></div></div></section>
  </main>;
}
