import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";

export const metadata: Metadata = {
  title: "More Ways to Connect | Aviator Brewing Company",
  description: "Contact Aviator, check a gift card balance, browse kegs for sale, book a band, request a donation, or apply for a job.",
};

const actions = [
  { number: "01", title: "Become a Pilot", copy: "A beginner-friendly route from discovery flight to Private Pilot and beyond.", href: "/become-a-pilot", action: "Start flying" },
  { number: "02", title: "Contact us", copy: "Questions, feedback, or a note for the Aviator crew.", href: "/contact", action: "Send a message" },
  { number: "03", title: "Gift card balance", copy: "Check the remaining balance on an Aviator gift card.", href: "/gift-card-balance", action: "Check balance" },
  { number: "04", title: "Keg/package sale", copy: "Live availability straight from the Aviator BrewOps system.", href: "/kegs", action: "Browse kegs" },
  { number: "05", title: "Book a band", copy: "Bring a set to one of our stages, patios, or campus events.", href: "/book-a-band", action: "Submit your band" },
  { number: "06", title: "Donation requests", copy: "Tell us about the cause, event, and community impact.", href: "/donation-requests", action: "Request support" },
  { number: "07", title: "Apply for a job", copy: "Join the crew behind the beer, food, hospitality, and good times.", href: "/apply-for-a-job", action: "See openings" },
];

export default function MorePage() {
  return <main>
    <section className="page-hero more-hero"><div className="content-wrap"><p className="eyebrow">Aviator operations</p><h1>More ways to <em>join the crew.</em></h1><p>From a fresh keg to your next show, this is the quick route to the people and practical details behind Aviator.</p></div></section>
    <section className="section more-actions-section"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">Ground control</p><h2>Choose your <em>next route.</em></h2></div><p>Everything here is built to get you where you need to go without a long hold pattern.</p></div><div className="more-actions">{actions.map((item) => <Link className="more-action-card" href={item.href} key={item.href} data-analytics={"more_" + item.href.slice(1)}><span>{item.number}</span><h2>{item.title}</h2><p>{item.copy}</p><strong>{item.action} <ArrowUpRight /></strong></Link>)}</div></div></section>
  </main>;
}
