import type { Metadata } from "next";
import Link from "next/link";
import { FlightLogAuthForm } from "@/components/flight-log-auth-forms";
export const metadata: Metadata = { title: "Sign In | Flight Log" };
export default function Page() { return <main className="flight-log-auth-page"><section><p className="eyebrow">Aviator Flight Log</p><h1>Sign in</h1><p>Sign in to post, comment, and check in once your email is verified.</p><FlightLogAuthForm mode="sign-in" /><p className="flight-log-auth-foot">Need a verification link? <Link href="/flight-log/verify/resend">Resend verification</Link>.</p></section></main>; }
