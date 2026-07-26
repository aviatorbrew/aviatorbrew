import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";
import type { Beer, Event } from "@/data/site";

const isPdf = (source: string) => source.toLowerCase().split("?")[0].endsWith(".pdf");

export function BeerCard({ beer }: { beer: Beer }) {
  return <article className="beer-card"><div className="beer-image">{isPdf(beer.image) ? <object className="beer-pdf-artwork" data={beer.image} type="application/pdf" aria-label={beer.name + " beer artwork PDF"}><a href={beer.image} target="_blank" rel="noreferrer">Open {beer.name} artwork PDF</a></object> : <Image src={beer.image} alt={beer.name + " beer can"} fill sizes="(max-width: 700px) 50vw, 25vw" />}</div><div><span>{beer.style}</span><h3>{beer.name}</h3><p>{beer.abv} ABV - {beer.description}</p></div></article>;
}

export function EventCard({ event }: { event: Event }) { return <article className="event-card"><div className="event-date"><span>{event.date}</span><strong>{event.time}</strong></div><div className="event-content"><h3>{event.title}</h3><p>{event.description}</p><Link href={"/events/" + event.slug}>Event details <ArrowUpRight /></Link></div></article>; }
