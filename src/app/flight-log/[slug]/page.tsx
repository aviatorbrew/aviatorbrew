import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { beers, events, locations } from "@/data/site";
import { FlightLogFormattedBody } from "@/components/flight-log-formatting";
import { flightLogCategoryLabels, getFlightLogPostBySlug, getPublishedFlightLogPosts } from "@/lib/flight-log";
import { getAllBeers } from "@/lib/managed-beers";
import { getManagedEvents } from "@/lib/managed-events";

export const dynamic = "force-dynamic";

function postDate(value: string | null) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date(value || Date.now()));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getFlightLogPostBySlug(slug);
  if (!post) return { title: "Flight Log Dispatch" };
  return { title: post.title, description: post.excerpt };
}

export default async function FlightLogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getFlightLogPostBySlug(slug);
  if (!post) notFound();
  const [managedEvents, managedBeers, allPosts] = await Promise.all([getManagedEvents(), getAllBeers(), getPublishedFlightLogPosts()]);
  const location = locations.find((item) => item.slug === post.locationId);
  const event = [...events.map((item) => ({ id: item.slug, title: item.title })), ...managedEvents.map((item) => ({ id: item.id, title: item.title }))].find((item) => item.id === post.eventId);
  const beer = [...beers, ...managedBeers].find((item) => item.slug === post.beerId);
  const relatedPosts = allPosts.filter((item) => item.id !== post.id && (item.category === post.category || item.locationId === post.locationId || item.beerId === post.beerId)).slice(0, 3);
  return <div className="flight-log-shell flight-log-post-shell">
    <header className="flight-log-portal-header"><div><p className="eyebrow">{flightLogCategoryLabels[post.category]} - Official Aviator</p><h1>{post.title}</h1><p>{post.excerpt}</p><div className="flight-log-post-meta"><span>{post.authorName}</span><time dateTime={post.publishedAt || post.updatedAt}>{postDate(post.publishedAt)}</time>{location ? <span>{location.name}</span> : null}</div></div><nav aria-label="Flight Log post navigation"><Link href="/flight-log">Back to feed</Link><Link href={"/flight-log?category=" + post.category}>{flightLogCategoryLabels[post.category]}</Link></nav></header>
    <main className="flight-log-post-layout"><article className="flight-log-post-body-card">{post.imageUrl ? <img className="flight-log-post-feature" src={post.imageUrl} alt="" /> : null}<div className="flight-log-post-body"><FlightLogFormattedBody body={post.body} /></div></article><aside className="flight-log-rail"><section><p className="eyebrow">Dispatch Data</p><dl>{location ? <div><dt>Location</dt><dd>{location.name}</dd></div> : null}{event ? <div><dt>Event</dt><dd>{event.title}</dd></div> : null}{beer ? <div><dt>Beer</dt><dd>{beer.name}</dd></div> : null}<div><dt>Category</dt><dd>{flightLogCategoryLabels[post.category]}</dd></div></dl></section>{relatedPosts.length ? <section><p className="eyebrow">Related Flight Log</p><div className="flight-log-related-list">{relatedPosts.map((item) => <Link href={"/flight-log/" + item.slug} key={item.id}><strong>{item.title}</strong><span>{flightLogCategoryLabels[item.category]}</span></Link>)}</div></section> : null}</aside></main>
  </div>;
}
