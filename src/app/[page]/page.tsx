import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InquiryForm } from "@/components/inquiry-form";
import { ArrowUpRight, MapPin } from "@/components/icons";
import { PrivateEventPaymentButton } from "@/components/private-event-payment-button";
import { getPrivateEventPaymentResult } from "@/lib/private-event-checkout";
import { notifyPrivateEventPayment } from "@/lib/private-event-payments";
import { getPrivateEventPhotos, type PrivateEventPhoto } from "@/lib/private-event-photos";
import { pageContent } from "@/data/site";

function PrivateEventGalleryMedia({ photo, alt, sizes }: { photo: PrivateEventPhoto; alt: string; sizes: string }) {
  return photo.mediaType === "video"
    ? <video src={photo.url} controls muted playsInline preload="metadata" />
    : <Image src={photo.url} alt={alt} fill unoptimized sizes={sizes} />;
}

const faqs = [
  ["Where is Aviator Brewing Company?", "The flagship brewery campus is at 688 Brewing Drive in Fuquay-Varina, North Carolina."],
  ["Do you have parking?", "Yes. The brewery campus has on-site parking, including accessible spaces. Other locations have nearby street or public parking."],
  ["Can I host a private event?", "Yes. Private events are hosted in the Ready Room, which holds up to 70 guests including the bar and includes a stage, microphone, full sound, and AV capability."],
  ["Are menus available on mobile?", "That is a core requirement of the new site. Final venue menus will be published as readable HTML rather than buried in PDFs."],
  ["How do I find current events?", "Visit the Events page for live music, specials, and upcoming gatherings."],
];

export function generateStaticParams() {
  return Object.keys(pageContent).map((page) => ({ page }));
}

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> {
  const { page } = await params;
  const content = pageContent[page];
  return { title: content?.title || "Aviator Brewing Company", description: content?.description };
}

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ page: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = (await params).page;
  const content = pageContent[page];
  if (!content) notFound();
  const formKind = content.form;
  const query = page === "private-events" ? await searchParams : {};
  const paymentStatus = query.booking_payment;
  const sessionId = typeof query.session_id === "string" ? query.session_id : "";
  const paymentResult = paymentStatus === "success" && sessionId ? await getPrivateEventPaymentResult(sessionId) : null;
  const verifiedPayment = paymentResult?.status || null;
  const paymentNotificationSent = verifiedPayment === "paid" && paymentResult?.session
    ? await notifyPrivateEventPayment(paymentResult.session)
    : false;
  const privateEventPhotos = page === "private-events" ? await getPrivateEventPhotos() : [];

  return <>
    <section className="page-hero">
      <div className="content-wrap">
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p>{content.description}</p>
        <div className="hero-actions">
          {page === "brewery" ? <Link className="button" href="/locations" data-analytics="brewery_locations">{content.action} <ArrowUpRight /></Link>
            : page === "shop" || page === "distillery" ? <a className="button" href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" target="_blank" rel="noreferrer" data-analytics={`${page}_directions`}><MapPin />{content.action}</a>
              : <a className="button" href={formKind ? "#inquiry" : "/about"} data-analytics={`${page}_action`}>{content.action} <ArrowUpRight /></a>}
          {page === "private-events" ? <>
            <a className="button button-outline" href="/media/menus/catering-events/food/1785010242714-Aviator_Ready_Room_Event_Menu_Clean.pdf" target="_blank" rel="noreferrer" data-analytics="private_events_onsite_buffet_menu">Onsite catering buffet menu <ArrowUpRight /></a>
            <PrivateEventPaymentButton />
          </> : null}
        </div>
        {verifiedPayment === "paid" ? <p className="private-event-payment-status success" role="status"><strong>Payment complete.</strong> Your &#36;500 room booking fee was processed securely through Stripe. {paymentNotificationSent ? "The Aviator events team has been notified." : "Keep your Stripe receipt and contact the Aviator events team if you do not hear from us."}</p> : null}
        {verifiedPayment === "pending" ? <p className="private-event-payment-status" role="status">Stripe is still confirming your payment. Keep your Stripe receipt; the Aviator events team will follow up after processing completes.</p> : null}
        {paymentStatus === "success" && verifiedPayment === "invalid" ? <p className="private-event-payment-status cancel" role="alert">This link does not verify a completed &#36;500 room booking payment. Please return to secure checkout or contact the Aviator events team.</p> : null}
        {paymentStatus === "cancel" ? <p className="private-event-payment-status cancel" role="status">Checkout was canceled. No room booking fee was paid.</p> : null}
      </div>
    </section>

    <section className="section">
      <div className="content-wrap split-content">
        <div><p className="eyebrow">The Aviator way</p><h2>Craft, hospitality, and <em>a reason to get together.</em></h2></div>
        {page === "private-events" ? <div>
          <p>The Ready Room is a private event space built for celebrations, corporate gatherings, rehearsal dinners, birthdays, live music, presentations, and everything in between.</p>
          <p>Your event can include a dedicated bartender, full buffet service, and a customizable food and beverage experience. The centerpiece of the room is our custom Spanish cedar bar, serving Aviator house beers, house-made Gold Leaf spirits, cocktails, wine, and a full selection of premium liquors.</p>
          <p>A full stage gives you plenty of flexibility for live bands, DJs, guest speakers, awards, or presentations. The Ready Room also features a complete audio and visual system, professional sound for music and speaking, and a large-screen TV for videos, slideshows, presentations, or game-day events.</p>
          <p>From the food and drinks to the music, lighting, and service, our team helps bring everything together so you can enjoy the event instead of managing it.</p>
          <p>That&apos;s the Aviator way: great beer, great food, genuine hospitality, and a memorable place to gather.</p>
          <Link className="section-link" href="/locations/ready-room">Explore the Ready Room <ArrowUpRight /></Link>
        </div> : <div><p>Every Aviator page is designed to answer the important questions quickly: where to go, what&apos;s happening, what to eat, and how to plan a visit. The content system keeps operational details centralized so teams can update them without hunting across a dozen pages.</p><p>As the final photography, menus, event feed, ordering tools, and booking integrations are connected, this page will become a focused conversion path for the people who need it.</p><Link className="section-link" href="/locations">Explore the locations <ArrowUpRight /></Link></div>}
      </div>
    </section>

    {page === "faq" && <section className="section section-dark"><div className="content-wrap"><div className="story-timeline">{faqs.map(([question, answer]) => <div key={question}><strong>{question}</strong><span>{answer}</span></div>)}</div></div></section>}
    {formKind && <section id="inquiry" className="section section-dark"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">{content.eyebrow}</p><h2>Let&apos;s get the <em>details moving.</em></h2></div></div><InquiryForm kind={formKind} /></div></section>}

    {page === "private-events" && privateEventPhotos.length ? <section className="section private-event-gallery-band"><div className="content-wrap"><div className="section-heading"><div><p className="eyebrow">Ready Room photos</p><h2>See the room <em>set for the next event.</em></h2></div><p>Private event room photography is managed by the Aviator team and updated as the space changes.</p></div><div className="private-event-gallery brewery-gallery">{privateEventPhotos.slice(0, 6).map((photo, index) => <figure className={index === 0 ? "is-featured" : ""} key={photo.name}><PrivateEventGalleryMedia photo={photo} alt={"Aviator Ready Room private event view " + (index + 1)} sizes={index === 0 ? "(max-width: 700px) 100vw, 66vw" : "(max-width: 700px) 100vw, 33vw"} />{index === 0 ? <figcaption>Featured event room photo</figcaption> : null}</figure>)}</div></div></section> : null}
  </>;
}
