"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";

export default function GiftCardBalancePage() {
  const [cardNumber, setCardNumber] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  async function checkBalance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState("checking"); setMessage("");
    try {
      const response = await fetch("/api/gift-cards/balance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardNumber }) });
      const body = await response.json() as { error?: string; balance?: string | number; currency?: string };
      if (!response.ok) throw new Error(body.error || "We could not check that card right now.");
      const balance = typeof body.balance === "number" ? new Intl.NumberFormat("en-US", { style: "currency", currency: body.currency || "USD" }).format(body.balance) : body.balance;
      setMessage("Available balance: " + balance); setState("success");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); setState("error"); }
  }
  return <main>
    <section className="page-hero gift-card-hero"><div className="content-wrap"><p className="eyebrow">Aviator gift cards</p><h1>Check your <em>flight credit.</em></h1><p>Enter the number printed on your Aviator gift card. We never store your card number in this lookup.</p></div></section>
    <section className="section gift-card-section"><div className="content-wrap narrow-content"><div className="gift-card-panel"><p className="eyebrow">Balance lookup</p><h2>Ready for another <em>round?</em></h2><form className="inquiry-form" onSubmit={checkBalance}><label>Gift card number<input value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} name="cardNumber" inputMode="numeric" autoComplete="off" minLength={8} maxLength={64} required /></label><button className="button" disabled={state === "checking"}>{state === "checking" ? "Checking..." : "Check balance"}</button></form>{state !== "idle" ? <p className={"gift-card-message " + state} role={state === "error" ? "alert" : "status"}>{message}</p> : null}</div><p className="gift-card-help">Need a hand with a gift card? <Link href="/contact">Contact the Aviator crew <ArrowUpRight /></Link></p></div></section>
  </main>;
}
