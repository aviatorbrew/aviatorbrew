import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { cardNumber } = await request.json() as { cardNumber?: unknown };
    const normalized = typeof cardNumber === "string" ? cardNumber.replace(/[^a-zA-Z0-9]/g, "") : "";
    if (normalized.length < 8 || normalized.length > 64) return NextResponse.json({ error: "Enter a valid gift card number." }, { status: 400 });

    const endpoint = process.env.GIFT_CARD_BALANCE_API_URL;
    if (!endpoint) return NextResponse.json({ error: "Online balance lookup is not configured yet. Please contact the Aviator crew for help with your card." }, { status: 503 });

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardNumber: normalized }),
      cache: "no-store",
    });
    const body = await upstream.json().catch(() => ({})) as { balance?: string | number; currency?: string; error?: string };
    if (!upstream.ok || body.balance === undefined || body.balance === null) return NextResponse.json({ error: body.error || "We could not find that gift card. Please check the number and try again." }, { status: upstream.status || 502 });
    return NextResponse.json({ balance: body.balance, currency: body.currency || "USD" });
  } catch {
    return NextResponse.json({ error: "We could not check that card right now. Please try again." }, { status: 500 });
  }
}
