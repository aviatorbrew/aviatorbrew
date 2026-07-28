import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { getManagerPaymentTestResult } from "@/lib/manager-payment-test";
import { createCheckoutSession } from "@/lib/stripe";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionId = request.nextUrl.searchParams.get("session_id") || "";
  if (!sessionId) return NextResponse.json({ error: "Stripe Checkout session is required." }, { status: 400 });
  return NextResponse.json(await getManagerPaymentTestResult(sessionId));
}

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
    const session = await createCheckoutSession({
      item: "manager-payment-test",
      quantity: 1,
      origin,
      metadata: { initiatedFrom: "manager-portal" },
    });
    if (!session) return NextResponse.json({ error: "Online payments are not configured yet." }, { status: 503 });
    return NextResponse.json({ url: session.url, id: session.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start the payment test." }, { status: 500 });
  }
}
