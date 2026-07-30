import type { Metadata } from "next";
import Link from "next/link";
import { FlightLogAuthForm } from "@/components/flight-log-auth-forms";
export const metadata: Metadata = { title: "Set New Flight Log Password" };
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) { const token = (await searchParams).token || ""; return <main className="flight-log-auth-page"><section><p className="eyebrow">Account recovery</p><h1>Set a new password</h1><p>Password reset links expire after 30 minutes.</p><FlightLogAuthForm mode="reset" token={token} /><p className="flight-log-auth-foot"><Link href="/flight-log/sign-in">Return to sign in</Link></p></section></main>; }
