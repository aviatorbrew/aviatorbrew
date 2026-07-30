import type { Metadata } from "next";
import Link from "next/link";
import { FlightLogAuthForm } from "@/components/flight-log-auth-forms";
export const metadata: Metadata = { title: "Reset Flight Log Password" };
export default function Page() { return <main className="flight-log-auth-page"><section><p className="eyebrow">Account recovery</p><h1>Forgot password?</h1><p>Enter your Flight Log email address and we will send an expiring reset link.</p><FlightLogAuthForm mode="forgot" /><p className="flight-log-auth-foot"><Link href="/flight-log/sign-in">Return to sign in</Link></p></section></main>; }
