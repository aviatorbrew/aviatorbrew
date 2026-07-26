import { NextResponse } from "next/server";
import { notifyQualifiedTours } from "@/lib/tours";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.TOUR_CRON_KEY;
  if (!secret) return false;
  return request.headers.get("x-tour-cron-key") === secret || request.headers.get("authorization") === "Bearer " + secret;
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await notifyQualifiedTours();
  if (!result.emailConfigured) return NextResponse.json({ error: "Tour email delivery is not configured.", ...result }, { status: 503 });
  return NextResponse.json({ ok: true, ...result });
}
