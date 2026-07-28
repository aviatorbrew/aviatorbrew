import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";
import { BeerImageViewer } from "@/components/beer-image-viewer";
import type { Beer, Event } from "@/data/site";


export function BeerCard({ beer }: { beer: Beer }) {
  return <article className="beer-card"><BeerImageViewer beer={beer} /><div><span>{beer.style}</span><h3>{beer.name}</h3><p>{beer.abv} - {beer.description}</p></div></article>;
}

export function EventCard({ event }: { event: Event }) { return <article className="event-card"><div className="event-date"><span>{event.date}</span><strong>{event.time}</strong></div><div className="event-content"><h3>{event.title}</h3><p>{event.description}</p><Link href={"/events/" + event.slug}>Event details <ArrowUpRight /></Link></div></article>; }
