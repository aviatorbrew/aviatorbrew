import type { Metadata } from "next";
import Link from "next/link";
import { FlightLogAuthForm } from "@/components/flight-log-auth-forms";
export const metadata: Metadata = { title: "Join Flight Log" };
export default function Page() { return <main className="flight-log-auth-page"><section><p className="eyebrow">Aviator Flight Crew</p><h1>Create your Flight Log account</h1><p>One account gives you Flight Log access and Flight Crew membership. Verify your email before posting, commenting, or checking in.</p><FlightLogAuthForm mode="join" /><p className="flight-log-auth-foot">Already cleared for takeoff? <Link href="/flight-log/sign-in">Sign in</Link>.</p></section></main>; }
