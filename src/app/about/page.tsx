import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { InquiryForm } from "@/components/inquiry-form";
import { ArrowUpRight, MapPin } from "@/components/icons";
import { formatTourDate, formatTourPrice, getTourSummary } from "@/lib/tours";
import { getBreweryHero } from "@/lib/brewery-photos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "About & Tours | Aviator Brewing Company",
  description: "The Aviator Brewing Company story: from a one-person hangar brewery in 2008 to the Fuquay-Varina brewery campus.",
};

const flightLog = [
  ["NOV 2008", "Aviator took flight in a small airplane hangar with one employee and two old 300-gallon dairy tanks."],
  ["JAN–SEP 2009", "Two used 30-barrel fermenters helped Aviator reach the Triangle. That September, the Aviator TapHouse opened inside Fuquay-Varina's 1910 Varina Station train depot."],
  ["APR 2010", "The original hangar was outgrown. Aviator moved six miles to a larger home, added tanks and cooler space, and grew to a four-person team."],
  ["2011", "The SmokeHouse opened in the historic Varina Hotel. Three 60-barrel fermenters and an eight-head bottling line expanded both capacity and Aviator's reach."],
  ["2012", "A new 30-barrel brewhouse, 100-barrel fermenters and brite tanks arrived. Aviator began canning HotRod Red, HogWild IPA, Devil's Tramping Ground Tripel and seasonal releases."],
  ["2014", "A 12,000-square-foot expansion doubled the production footprint. Aviator moved fully into cans, added a centrifuge, passed 1.2 million cans, and opened the Aviator Beer Shop."],
  ["2015", "Aviator reached 3.5 million cans, began exports to Korea, Taiwan and Brazil, acquired the Gold Leaf Tobacco Building property, and took its first steps into distilling."],
  ["2016", "A high-speed canning line lifted output to 300 cans per minute. Aviator also entered the United Kingdom, with beer placed in 1,800 locations."],
  ["2017–2018", "The Aviator Kitchen opened at the TapHouse, downtown footprint continued to grow, and planning began for a five-acre brewery campus with a fully automated 60-barrel, four-vessel brewhouse."],
  ["2022–2024", "Site work, permitting and construction pushed the new 688 Brewing Drive campus from plan to reality: event restaurant, outdoor stage, brewhouse and main brewery all taking shape."],
  ["APR 2025", "The new Aviator campus opened in Fuquay-Varina - a destination for fresh beer, food, music, private events and the next generation of the brand."],
  ["THE NEXT FLIGHT", "With the 60-barrel brewhouse online, Aviator is building toward the HardDeck SteakHouse, C-54 Airplane Bar, expanded entertainment and renewed distribution beyond North Carolina."],
];

export default async function AboutPage({ searchParams }: { searchParams: Promise<{ tour_payment?: string }> }) {
  const [tours, storyImage] = await Promise.all([getTourSummary(), getBreweryHero()]);
  const paymentResult = (await searchParams).tour_payment;
  return (
    <>
      <section className="page-hero about-story-hero">
        <div className="content-wrap">
          <p className="eyebrow">Our story / Fuquay-Varina, NC</p>
          <h1>One small hangar. <em>A lot of runway.</em></h1>
          <p>Aviator started with two dairy tanks, one person, and a little room inside an airplane hangar. It grew one determined pour, one gathering place, and one ambitious build at a time.</p>
          <div className="hero-actions"><a className="button" href="#our-story">Read the flight log <ArrowUpRight /></a><a className="button button-outline" href="#brewery-tours">Join a brewery tour</a></div>
        </div>
      </section>

      <section className="section about-story-section" id="our-story">
        <div className="content-wrap about-story-grid">
          <div className="about-story-image"><Image src={storyImage} alt="Guests inside the Aviator Hangar Bar and brewery" fill unoptimized sizes="(max-width: 800px) 100vw, 50vw" /></div>
          <div className="about-story-copy">
            <p className="eyebrow">The Aviator story</p>
            <h2>Built by <em>keeping pace.</em></h2>
            <p>In November 2008, Aviator Brewing Company began in a small airplane hangar. The brewery had exactly one employee and brewed into two old 300-gallon dairy tanks. Demand arrived quickly, so two used 30-barrel fermenters came next; by January 2009, Aviator was distributing beer across the Triangle.</p>
            <p>The footprint kept growing with the community: the TapHouse opened in the historic Varina Station train depot in 2009, followed by the SmokeHouse in the old Varina Hotel in 2011. More tanks, a new brewhouse, canning, the Beer Shop, event space, distilling, and wider distribution each added a new reason to come together.</p>
            <p>In 2018 Aviator began planning its biggest project: a five-acre brewery campus with a fully automated 60-barrel, four-vessel brewhouse. After years of planning and construction, the new campus at 688 Brewing Drive opened in April 2025. The next chapter is still being written over a fresh pour, a great meal, and a full room.</p>
            <p>Aviator&apos;s next chapter is rooted in the same momentum: the 688 Brewing Drive campus brings a fully automated 60-barrel, four-vessel brewhouse together with the Hangar Bar, Ready Room, Amphitheater and more to come. The goal is still simple - brew boldly, welcome people well, and keep creating a place worth coming back to.</p><p>That runway continues to extend with new food and entertainment experiences, including the future HardDeck SteakHouse and C-54 Airplane Bar, alongside a renewed focus on bringing Aviator beer to more people in North Carolina and beyond.</p><div className="hero-actions"><Link className="button" href="/locations">Explore the campus <ArrowUpRight /></Link><a className="button button-outline" href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" target="_blank" rel="noreferrer"><MapPin />Get directions</a></div>
          </div>
        </div>
      </section>

      <section className="section about-flight-log">
        <div className="content-wrap">
          <div className="section-heading"><div><p className="eyebrow">Flight log</p><h2>Seventeen years of <em>forward motion.</em></h2></div><p>From the first modest brew day to a destination-sized campus, every milestone added capacity, character, or another place for people to meet.</p></div>
          <div className="about-timeline">{flightLog.map(([year, story]) => <article key={year}><span>{year}</span><p>{story}</p></article>)}</div>
        </div>
      </section>

      <section className="section brewery-tour-section" id="brewery-tours">
        <div className="content-wrap brewery-tour-layout">
          <div><p className="eyebrow">Brewery tours / {formatTourPrice(tours.priceCents)} per guest</p><h2>Join the crew <em>behind the scenes.</em></h2><p>Tour the brewhouse, hear the campus story, and see where the next pours begin. Individual signups are placed on the next available Saturday 4:00 PM flight. That flight is tentatively set until it reaches {tours.minimum} guests; once {tours.minimum} people are signed up, the tour is officially on and everyone on the list receives the confirmed date and time by email. If it has not reached {tours.minimum} guests yet, we will keep you updated as the list grows.</p><p>Meet us at <strong>688 Brewing Dr., Fuquay-Varina, NC 27526</strong>. Please gather at the double doors into the brewery at <strong>3:55 PM</strong> for check-in before the 4:00 PM tour begins. The tour is approximately 30 minutes. Every {formatTourPrice(tours.priceCents)} ticket includes an Aviator pint glass, one beer pour, and one flight of four pours.</p><dl className="tour-specs"><div><dt>Launch threshold</dt><dd>{tours.minimum} registered guests per flight</dd></div><div><dt>Primary flight</dt><dd>Saturdays at 4:00 PM</dd></div><div><dt>Overflow flight</dt><dd>6:00 PM when 4:00 PM is full</dd></div><div><dt>Signup cutoff</dt><dd>At least {tours.bookingCutoffHours} hour{tours.bookingCutoffHours === 1 ? "" : "s"} before Saturday</dd></div><div className="tour-availability"><span>Current 4:00 PM list</span><strong>{tours.fourPm.booked} / 25</strong></div><div className="tour-availability"><span>Current 6:00 PM list</span><strong>{tours.sixPm.booked} / 25</strong></div></dl>{tours.confirmedTours.length > 0 ? <div className="tour-confirmed" role="status"><p className="eyebrow">Tour confirmed</p>{tours.confirmedTours.map((tour) => <strong key={tour.date + tour.time}>{formatTourDate(tour.date)} at {tour.time}</strong>)}<p>This flight has reached the {tours.minimum}-guest launch minimum. All registered guests will receive the tour details by email.</p></div> : <p className="tour-note">The confirmed Saturday and time will publish here as soon as a flight reaches {tours.minimum} guests. If a Saturday is inside the {tours.bookingCutoffHours}-hour booking cutoff, new guests roll to the following Saturday.</p>}</div>
          <div className="tour-form-wrap"><p className="eyebrow">Individual signup</p><h3>Save your <em>seat.</em></h3>{paymentResult === "success" ? <div className="form-message success" role="status"><p>Payment return received. Your tour ticket is being recorded; check your email for the latest tour status.</p></div> : paymentResult === "cancel" ? <div className="form-message error" role="alert"><p>Checkout was cancelled. Your tour signup is still listed, but payment has not been completed.</p></div> : null}<InquiryForm kind="tour" tourMinimum={tours.minimum} tourPriceCents={tours.priceCents} tourBookingCutoffHours={tours.bookingCutoffHours} /></div>
        </div>
      </section>
    </>
  );
}
