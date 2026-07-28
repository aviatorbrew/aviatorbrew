"use client";

import { useEffect, useState } from "react";

type PaymentState = "idle" | "starting" | "checking" | "paid" | "pending" | "canceled" | "error";

export function PaymentTestManager() {
  const [state, setState] = useState<PaymentState>("idle");
  const [message, setMessage] = useState("");
  const [liveMode, setLiveMode] = useState<boolean | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment_test") === "cancel") {
      setState("canceled");
      setMessage("Checkout was canceled. No payment was made.");
      return;
    }

    const sessionId = params.get("session_id");
    if (params.get("payment_test") !== "success" || !sessionId) return;

    setState("checking");
    setMessage("Verifying the returned Checkout session with Stripe...");
    fetch("/api/manager/payments?session_id=" + encodeURIComponent(sessionId), { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not verify the payment.");
        setLiveMode(typeof body.liveMode === "boolean" ? body.liveMode : null);
        if (body.status === "paid") {
          setState("paid");
          setMessage("Payment verified. Stripe reports that the $1.00 charge was paid.");
        } else if (body.status === "pending") {
          setState("pending");
          setMessage("The session is valid, but Stripe does not report the $1.00 payment as paid yet.");
        } else {
          setState("error");
          setMessage("This session did not match the protected $1 payment test.");
        }
      })
      .catch((error) => {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Could not verify the payment.");
      });
  }, []);

  async function startPaymentTest() {
    setState("starting");
    setMessage("Opening secure Stripe Checkout...");
    try {
      const response = await fetch("/api/manager/payments", { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.url) throw new Error(body.error || "Could not start the payment test.");
      window.location.assign(body.url);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not start the payment test.");
    }
  }

  const busy = state === "starting" || state === "checking";

  return <section className="manager-payment-test">
    <div className="manager-payment-test-summary">
      <p className="eyebrow">Stripe Checkout diagnostic</p>
      <h2>Charge $1.00</h2>
      <p>Use this manager-only checkout to confirm that the website can create a Stripe payment, accept a card, and verify the completed session.</p>
      <div className="manager-payment-test-warning">
        <strong>Live payment</strong>
        <span>This charges the card $1.00 through the production Stripe account. Stripe processing fees may apply.</span>
      </div>
      <button className="button" type="button" onClick={startPaymentTest} disabled={busy}>
        {state === "starting" ? "Opening Stripe..." : "Pay $1.00 with Stripe"}
      </button>
    </div>
    <aside className={"manager-payment-test-status is-" + state} aria-live="polite">
      <p className="eyebrow">Test status</p>
      <h3>{state === "paid" ? "Payment verified" : state === "pending" ? "Payment pending" : state === "canceled" ? "Checkout canceled" : state === "error" ? "Verification issue" : busy ? "Checking Stripe" : "Ready to test"}</h3>
      <p>{message || "Start a $1.00 checkout. After payment, Stripe will return you here and the portal will verify the result."}</p>
      {liveMode !== null ? <dl><div><dt>Stripe mode</dt><dd>{liveMode ? "Live" : "Test"}</dd></div><div><dt>Expected amount</dt><dd>$1.00 USD</dd></div></dl> : null}
      {state === "paid" ? <a href="https://dashboard.stripe.com/payments" target="_blank" rel="noreferrer">Open Stripe payments</a> : null}
    </aside>
  </section>;
}
