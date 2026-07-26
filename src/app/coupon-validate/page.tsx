"use client";

import { useEffect, useState } from "react";

function codeFrom(value: string) {
  try { if (value.includes("code=")) return new URL(value).searchParams.get("code") || value; } catch {}
  return value.trim();
}

export default function CouponValidatePage() {
  const [code, setCode] = useState("");
  const [key, setKey] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "success" | "error">("idle");
  useEffect(() => { setCode(new URLSearchParams(window.location.search).get("code") || ""); }, []);

  async function validate() {
    setStatus("busy"); setMessage("");
    try {
      const response = await fetch("/api/coupons/validate", { method: "POST", headers: { "content-type": "application/json", "x-coupon-validation-key": key }, body: JSON.stringify({ token: codeFrom(code) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Coupon could not be redeemed.");
      setStatus("success"); setMessage(body.offer.title + " redeemed at " + new Date(body.redeemedAt).toLocaleTimeString() + ".");
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "Coupon could not be redeemed."); }
  }

  return <main className="coupon-validator"><section><p className="eyebrow">Aviator bar staff</p><h1>Validate coupon</h1><p>Scan the guest QR code or paste its link. A valid coupon is marked redeemed immediately.</p><label>Coupon QR link or code<input value={code} onChange={(event) => setCode(event.target.value)} /></label><label>Staff validation key<input type="password" value={key} onChange={(event) => setKey(event.target.value)} /></label><button className="button" onClick={validate} disabled={status === "busy"}>{status === "busy" ? "Checking..." : "Validate + redeem"}</button>{message && <p className={"coupon-validation-message " + status} role="status">{message}</p>}</section></main>;
}
