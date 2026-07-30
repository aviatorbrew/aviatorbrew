import type { Metadata } from "next";
import Link from "next/link";
import { verifyFlightLogEmail } from "@/lib/flight-log-auth";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Flight Log Email Verification" };
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) { const token = (await searchParams).token || ""; const customer = token ? await verifyFlightLogEmail(token) : null; return <main className="flight-log-auth-page"><section><p className="eyebrow">Email verification</p>{customer ? <><h1>Your email is verified.</h1><p>Welcome aboard, {customer.firstName}. You can now post, comment, and check in when those features go live.</p><Link className="button" href="/flight-log/sign-in">Sign in</Link></> : <><h1>Verification link expired or invalid.</h1><p>Request a new verification email and try again.</p><Link className="button" href="/flight-log/verify/resend">Resend verification</Link></>}</section></main>; }
