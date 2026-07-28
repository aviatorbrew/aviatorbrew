import type { Metadata } from "next";
import Image from "next/image";
import { NightOutPlanner } from "@/components/night-out-planner";

export const metadata: Metadata = {
  title: "Plan an Aviator Night Out",
  description: "Build a custom Aviator itinerary for drinks, appetizers, and dinner, then save it to your phone or email it to yourself.",
};

export default function ItineraryPage() {
  return <>
    <section className="itinerary-hero">
      <Image src="/images/ready-room-after-dark.png" alt="Aviator cocktails and hospitality after dark" fill priority unoptimized sizes="100vw" />
      <div className="content-wrap itinerary-hero-copy">
        <p className="eyebrow">Aviator night-out planner</p>
        <h1>Build your Aviator night.</h1>
        <p>Choose drinks, appetizers, dinner, and the route you want to save to your phone.</p>
      </div>
    </section>
    <div className="itinerary-page"><div className="content-wrap"><NightOutPlanner /></div></div>
  </>;
}
