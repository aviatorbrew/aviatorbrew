"use client";

import { useState } from "react";
import { ArrowUpRight } from "@/components/icons";

export function PrivateEventPaymentButton({ bookingFeeLabel }: { bookingFeeLabel: string }) {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function beginCheckout() {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item: "private-event-room-booking", quantity: 1 }),
      });
      const body = await response.json() as { error?: string; url?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Secure checkout could not be started.");
      window.location.assign(body.url);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Checkout could not be opened. Please try again.");
    }
  }

  return <>
    <button
      className="button private-event-payment-button"
      type="button"
      onClick={beginCheckout}
      disabled={state === "loading"}
      data-analytics="private_events_room_booking_payment"
    >
      {state === "loading" ? "Opening secure checkout..." : "PAY " + bookingFeeLabel + " ROOM BOOKING FEE"}
      {state !== "loading" ? <ArrowUpRight /> : null}
    </button>
    {state === "error" ? <span className="private-event-payment-error" role="alert">{message || "Checkout could not be opened. Please try again."}</span> : null}
  </>;
}
