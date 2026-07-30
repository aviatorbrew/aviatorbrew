import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentFlightLogCustomer, getFlightLogProfileSummary } from "@/lib/flight-log-auth";
import { FlightLogSignOutButton } from "@/components/flight-log-auth-forms";
import { FlightLogProfileClient } from "@/components/flight-log/profile-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My Flight Log Profile" };

export default async function Page() {
  const customer = await getCurrentFlightLogCustomer();
  if (!customer) return <main className="flight-log-auth-page"><section><p className="eyebrow">Flight Log profile</p><h1>Sign in to view your profile.</h1><p>Your profile, friends, check-ins, and invitations will live here.</p><Link className="button" href="/flight-log/sign-in">Sign In</Link></section></main>;
  const checkIns = await getFlightLogProfileSummary(customer.id);
  return <main className="flight-log-auth-page"><section><FlightLogProfileClient customer={customer} checkIns={checkIns} /><p className="flight-log-auth-links"><Link href="/flight-log">Back to Flight Log</Link><FlightLogSignOutButton /></p></section></main>;
}
