import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin } from "@/components/icons";
import type { Location } from "@/data/site";
import { getLocationHero } from "@/lib/location-photos";

export async function LocationCard({ location }: { location: Location }) {
  const image = await getLocationHero(location.slug, location.image);
  return <article className="location-card"><div className="image-wrap"><Image src={image} alt={location.name + " Aviator Brewing Company"} fill sizes="(max-width: 700px) 100vw, 33vw" /></div><div className="card-body"><p className="card-kicker">{location.type}</p><h3>{location.name}</h3><p>{location.description}</p><div className="card-meta"><span>{location.hours}</span></div><div className="card-actions"><Link href={"/locations/" + location.slug}>Explore <ArrowUpRight /></Link><a href={"https://maps.google.com/?q=" + encodeURIComponent(location.address)} target="_blank" rel="noreferrer" data-analytics={"directions_" + location.slug}><MapPin /> Directions</a></div></div></article>;
}
