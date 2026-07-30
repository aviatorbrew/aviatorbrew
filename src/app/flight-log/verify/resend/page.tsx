import type { Metadata } from "next";
import Link from "next/link";
import { FlightLogAuthForm } from "@/components/flight-log-auth-forms";
export const metadata: Metadata = { title: "Resend Flight Log Verification" };
export default function Page() { return <main className="flight-log-auth-page"><section><p className="eyebrow">Email verification</p><h1>Resend verification</h1><p>Enter your email address and we will send a fresh verification link if your account still needs one.</p><FlightLogAuthForm mode="resend" /><p className="flight-log-auth-foot"><Link href="/flight-log/sign-in">Return to sign in</Link></p></section></main>; }
