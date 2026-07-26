import Link from "next/link";
import { getAllLocations } from "@/lib/managed-locations";

export async function SiteFooter() {
  const locations = await getAllLocations();
  return <footer className="site-footer">
    <div className="footer-top"><div><p className="eyebrow">Aviator Brewing Company</p><h2>Make a plan. <em>We&apos;ll make it worth the trip.</em></h2></div><Link className="button button-light" href="/locations" data-analytics="footer_locations">Find your landing spot</Link></div>
    <div className="footer-grid">
      <div><p className="footer-title">Visit Aviator</p><a href="https://maps.google.com/?q=688+Brewing+Drive+Fuquay-Varina+NC+27526" target="_blank" rel="noreferrer">688 Brewing Drive<br/>Fuquay-Varina, NC 27526</a><a href="tel:+19195672337">(919) 567-BEER</a><a href="mailto:info@aviatorbrew.com">info@aviatorbrew.com</a></div>
      <div><p className="footer-title">Explore</p><Link href="/beer">Our Beer</Link><Link href="/locations#menus">Locations + Dining</Link><Link href="/events">Events</Link><Link href="/coupons">Coupons + Specials</Link><Link href="/private-events">Private Events</Link><Link href="/careers">Careers</Link></div>
      <div><p className="footer-title">Locations</p>{locations.slice(0, 5).map((location) => <Link key={location.slug} href={`/locations/${location.slug}`}>{location.shortName}</Link>)}</div>
      <div><p className="footer-title">Get updates</p><p className="footer-copy">Fresh beer, live music, and the next reason to get out of the house.</p><Link className="footer-newsletter" href="/#updates" data-analytics="footer_newsletter">Join the flight crew →</Link></div>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} Aviator Brewing Company</span><span><Link href="/faq">FAQ</Link><Link href="/contact">Contact</Link><a href="#">Privacy</a><a href="#">Accessibility</a></span></div>
  </footer>;
}
