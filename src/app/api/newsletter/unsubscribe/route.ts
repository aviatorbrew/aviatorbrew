import { NextRequest, NextResponse } from "next/server";
import { unsubscribeNewsletter } from "@/lib/newsletter";
import { verifyNewsletterUnsubscribeToken } from "@/lib/newsletter-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, message: string, status = 200) {
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title} | Aviator Brewing Company</title></head><body style="margin:0;background:#071827;color:#f4f7f8;font-family:Arial,sans-serif"><main style="max-width:600px;margin:12vh auto;padding:40px;border:1px solid #315a78;background:#102c46"><p style="color:#efb45f;font-weight:800;text-transform:uppercase">Aviator Brewing Company</p><h1>${title}</h1><p style="line-height:1.6">${message}</p><a href="/" style="color:#efb45f">Return to aviatorbrew.com</a></main></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email") || "";
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!email || !verifyNewsletterUnsubscribeToken(email, token)) return page("Invalid unsubscribe link", "This link is invalid or has expired.", 400);
  await unsubscribeNewsletter(email);
  return page("You have left the Flight Crew", "This email address has been removed from Aviator Flight Crew messages.");
}
