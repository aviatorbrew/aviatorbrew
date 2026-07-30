import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentFlightLogCustomer } from "@/lib/flight-log-auth";
import { FlightLogSignOutButton } from "@/components/flight-log-auth-forms";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Flight Log Profile" };

export default async function Page() {
  const customer = await getCurrentFlightLogCustomer();
  if (!customer) return <main className="flight-log-auth-page"><section><p className="eyebrow">Flight Log profile</p><h1>Sign in to view your profile.</h1><p>Your profile, friends, and invitations will live here.</p><Link className="button" href="/flight-log/sign-in">Sign In</Link></section></main>;
  return <main className="flight-log-auth-page"><section><p className="eyebrow">Flight Log profile</p><h1>{customer.callsign}</h1><p>{customer.firstName} {customer.lastName} · {customer.email}</p><p>{customer.emailVerified ? "Verified Flight Crew member." : "Email verification is required before posting, commenting, or checking in."}</p><div className="flight-log-profile-grid"><article><h2>Friends</h2><p>Friend requests, accepted friends, and friend recommendations will appear here in the next phase.</p></article><article><h2>Invite a friend</h2><p>Future invites can use email, or phone plus a carrier lookup/SMS provider. A phone number alone cannot reliably identify an email-to-text gateway.</p></article></div><p className="flight-log-auth-links"><Link href="/flight-log">Back to Flight Log</Link><FlightLogSignOutButton /></p></section></main>;
}
