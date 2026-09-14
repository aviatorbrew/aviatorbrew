import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";
import { KegOrderForm } from "@/components/keg-order-form";
import { getUploadedKegInventory } from "@/lib/keg-inventory";
import styles from "./kegs.module.css";

export const metadata: Metadata = {
  title: "Kegs & Beer for Your Gathering",
  description: "Bring your people. We'll bring the beer. Browse Aviator Brewing kegs, cases, and packs for celebrations and get-togethers, with brewery pickup in Fuquay-Varina, NC.",
};
export const dynamic = "force-dynamic";

export default async function KegsPage() {
  const kegData = await getUploadedKegInventory();
  const displayUpdatedAt = kegData?.websiteUpdatedAt || kegData?.updatedAt;
  const stamp = displayUpdatedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(displayUpdatedAt)) : null;

  return <div className={styles.page}>
    <section className={styles.hero} aria-labelledby="kegs-title">
      <div className={`content-wrap ${styles.heroLayout}`}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Aviator Brewing Company <span aria-hidden="true"> / </span> Kegs &amp; more</p>
          <div className={styles.wings} aria-hidden="true"><span /><svg viewBox="0 0 32 32"><path d="m16 3 3.2 8.8 9.3.3-7.3 5.8 2.6 9-7.8-5.2-7.8 5.2 2.6-9-7.3-5.8 9.3-.3Z" fill="currentColor" /></svg><span /></div>
          <h1 id="kegs-title">Bring your people.<br /><em>We&apos;ll bring<br />the beer.</em></h1>
          <p className={styles.intro}>Here&apos;s to the women who bring everyone together. From backyard catch-ups to milestone celebrations, make room for good company and great local beer.</p>
          <div className={styles.actions}>
            <a className={styles.primaryButton} href={kegData?.items.length ? "#beer-picker" : "#keg-inventory"}>Find your beer <ArrowUpRight /></a>
            <a className={styles.secondaryLink} href="#keg-how-it-works">First time ordering?</a>
          </div>
          <p className={styles.pickup}>Kegs, cases &amp; packs <span aria-hidden="true">·</span> Brewery pickup in Fuquay-Varina, NC</p>
        </div>
        <figure className={styles.poster}>
          <Image src="/images/kegs-women-aviators.webp" alt="Vintage-style illustration of two women aviators sharing a beer beside a keg and a parked WWII-era propeller airplane." width={1254} height={1254} sizes="(max-width: 800px) 92vw, 48vw" priority />
          <figcaption><span>Good company. Great beer.</span><span>Gather your crew <span aria-hidden="true">✦</span></span></figcaption>
        </figure>
      </div>
    </section>

    <section id="keg-how-it-works" className={styles.guide} aria-labelledby="keg-guide-title">
      <div className="content-wrap">
        <div className={styles.guideHeading}><p className={styles.kicker}>Your gathering, ready for takeoff</p><h2 id="keg-guide-title">A little planning. A lovely get-together.</h2></div>
        <ol className={styles.steps}>
          <li><span className={styles.stepNumber} aria-hidden="true">01</span><div><h3>Find your favorites</h3><p>Browse the beer below and compare available kegs, cases, and packs.</p></div></li>
          <li><span className={styles.stepNumber} aria-hidden="true">02</span><div><h3>Make it your gathering</h3><p>Select your beer and quantity. Add your date and any pickup questions to your request.</p></div></li>
          <li><span className={styles.stepNumber} aria-hidden="true">03</span><div><h3>Leave the details to us</h3><p>Our sales team will confirm your request and help coordinate brewery pickup.</p></div></li>
        </ol>
        <p className={styles.help}>New to kegs? <a href="mailto:orders@aviatorbrew.com?subject=Help%20planning%20my%20beer%20order">Ask us about sizes, taps, and pickup <ArrowUpRight /></a></p>
      </div>
    </section>

    <section id="keg-inventory" className={`section keg-inventory-section ${styles.inventory}`} aria-labelledby="keg-inventory-title">
      <div className="content-wrap">
        <div className={`section-heading ${styles.inventoryHeading}`}>
          <div><p className="eyebrow">The beer for your get-together</p><h2 id="keg-inventory-title">Find your next<br /><em>crowd favorite.</em></h2><p className={styles.inventoryIntro}>Explore kegs, cases, 6-packs, and 4-packs. Choose Order to send a request; our team will confirm the details.</p></div>
          <p>{stamp ? "Inventory updated " + stamp + "." : "Today's keg/package inventory will be posted shortly."}</p>
        </div>
        {kegData && kegData.items.length > 0 ? <><KegOrderForm items={kegData.items} />{kegData.backfillPickupNote ? <p className="keg-note">{kegData.backfillPickupNote}</p> : null}</> : <div className="keg-unavailable"><p className="eyebrow">Let&apos;s plan something good</p><h2>Looking for your <em>favorite beer?</em></h2><p>No kegs or packages are currently listed. Contact our team for today&apos;s availability and help planning your order.</p><a className="button" href="mailto:orders@aviatorbrew.com?subject=Keg%20Sales%20Request">Ask our team <ArrowUpRight /></a></div>}
        <Link className="section-link" href="/more">Back to more Aviator services <ArrowUpRight /></Link>
      </div>
    </section>
  </div>;
}
