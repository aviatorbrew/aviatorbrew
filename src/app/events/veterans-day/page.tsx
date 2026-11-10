import type { Metadata } from "next";
import "./veterans-day.css";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getManagedEvents } from "@/lib/managed-events";
import { getLocation } from "@/lib/managed-locations";
import { parseSpecialMenu } from "@/lib/special-menu";
import { MapPin, ArrowUpRight } from "@/components/icons";

export const dynamic = "force-dynamic";
const getSpecial = cache(async () => (await getManagedEvents()).find(event => {
  if (!event.published || event.date !== "2026-11-11") return false;
  try { return new URL(event.ticketUrl).pathname === "/events/veterans-day"; } catch { return false; }
}));

export async function generateMetadata(): Promise<Metadata> {
  const event = await getSpecial();
  if (!event) return { title: "Veterans Day" };
  return { title: event.title, description: "Four military-inspired Southern comfort meals for Veterans Day, Wednesday, November 11, 2026, at Aviator Hangar Bar in Fuquay-Varina.", alternates: { canonical: "/events/veterans-day" }, openGraph: { title: event.title, description: "Meals ready to enjoy. Thank you for your service! Wednesday, November 11, 2026.", url: "/events/veterans-day", images: event.imageUrl ? [{ url: event.imageUrl, alt: "Aviator Veterans Day tribute with an eagle, American flag, beer and distant plane" }] : [] } };
}

export default async function VeteransDaySpecial() {
  const event = await getSpecial();
  if (!event) notFound();
  const location = await getLocation("hangar-bar");
  const address = location?.address || "688 Brewing Drive, Fuquay-Varina, NC 27526";
  const directions = "https://maps.google.com/?q=" + encodeURIComponent(address);
  const date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date(event.date + "T12:00:00Z"));
  const past = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/New_York" }).format(new Date()) > event.date;
  const blocks = parseSpecialMenu(event.description);
  const meals = blocks.filter(block => block.kind === "meal");
  const copy = blocks.filter(block => block.kind === "text");
  return <div className="veterans-special">
    <section className="veterans-special-hero">
      <div className="content-wrap veterans-special-hero-grid">
        <div className="veterans-special-intro">
          <p className="eyebrow"><span aria-hidden="true">🇺🇸</span> Aviator Brewing Company</p>
          <h1>Veterans Day <span>MRE Inspired Meals!</span></h1>
          <p className="veterans-special-date"><time dateTime={event.date}>{date}</time></p>
          {past && <p className="veterans-special-past" role="note">Past special · This menu was offered on {date}.</p>}
          {copy.slice(0, 2).map((block, i) => <p key={i}>{block.text}</p>)}
          <div className="veterans-special-actions"><a className="button" href="#veterans-day-menu">See the four meals <ArrowUpRight /></a><a className="button button-outline" href={directions} target="_blank" rel="noreferrer"><MapPin /> Get directions</a></div>
        </div>
        {event.imageUrl && <div className="veterans-special-art"><Image src={event.imageUrl} width={1672} height={941} priority unoptimized sizes="(max-width: 850px) 100vw, 55vw" alt="Aviator Veterans Day tribute: bald eagle, American flag, amber beer and a distant plane on a sunset airfield" /></div>}
      </div>
    </section>
    <section className="veterans-special-menu content-wrap" id="veterans-day-menu" aria-labelledby="veterans-special-menu-title">
      <div className="veterans-special-menu-heading"><p className="eyebrow">Real Southern comfort food</p><h2 id="veterans-special-menu-title">Meals ready to enjoy.</h2><p>{event.location} · {date}</p></div>
      <div className="veterans-special-meals">{meals.map((meal, i) => <article className="veterans-meal" key={meal.name}><div className="veterans-meal-top"><span>Field menu / {String(i + 1).padStart(2, "0")}</span><strong>{meal.price}</strong></div><h3>{meal.name}</h3><p>{meal.description}</p></article>)}</div>
      <div className="veterans-special-thanks">{copy.slice(2).map((block, i) => block.text?.startsWith("#") ? <p className="veterans-special-tags" key={i}>{block.text}</p> : <p key={i}>{block.text}</p>)}</div>
      <div className="veterans-special-visit"><div><h2>Join us at {event.location}.</h2><p>{address}</p></div><a className="button" href={directions} target="_blank" rel="noreferrer"><MapPin /> Get directions</a><Link href="/events" className="button button-outline">Brewery events <ArrowUpRight /></Link></div>
    </section>
  </div>;
}
