import type { Metadata } from "next";
import { CouponDeck } from "@/components/coupons";
import { couponAvailability, getCouponOffers } from "@/lib/coupons";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Coupons + Specials", description: "Current Aviator Brewing Company coupons and specials in Fuquay-Varina." };

export default async function CouponsPage() {
  const [offers, availability] = await Promise.all([getCouponOffers(), couponAvailability()]);
  return <><section className="page-hero coupons-hero"><div className="content-wrap"><p className="eyebrow">Aviator offers</p><h1>Good reasons to <em>land here.</em></h1><p>Save current Aviator specials to your phone, then show the QR code at the bar before ordering. Coupons are not valid Fridays, Saturdays, or during special events.</p></div></section><CouponDeck offers={offers} allowed={availability.allowed} reason={availability.reason} /></>;
}
