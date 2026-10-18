import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { isTourEmailConfigured, sendTourGuestMessage } from "@/lib/tours";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  let input: unknown;
  try { input = await request.json(); }
  catch { return NextResponse.json({ error: "Provide a guest, subject, and message." }, { status: 400, headers }); }
  const body = input as Record<string, unknown> | null;
  if(body?.emailApproved!==true)return NextResponse.json({error:"Review and approve this customer email before sending."},{status:403,headers});
  const signupId = typeof body?.signupId === "string" ? body.signupId.trim() : "";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!signupId || signupId.length > 200 || !subject || subject.length > 160 || /[\r\n]/.test(subject) || !message || message.length > 5000) {
    return NextResponse.json({ error: "Choose a booked guest, enter a subject up to 160 characters, and a message up to 5,000 characters." }, { status: 400, headers });
  }
  if (!isTourEmailConfigured()) return NextResponse.json({ error: "Tour email delivery is not configured." }, { status: 503, headers });
  try {
    // Resolve the recipient from the saved booking; clients cannot choose another address.
    const result = await sendTourGuestMessage(signupId, subject, message);
    if (!result) return NextResponse.json({ error: "This tour booking no longer exists. Refresh the list." }, { status: 404, headers });
    if (!result.accepted) return NextResponse.json({ error: "The mail service did not accept this message. Please try again." }, { status: 502, headers });
    return NextResponse.json({ ok: true, recipient: result.recipient, message: `Message accepted for delivery to ${result.recipient}.` }, { headers });
  } catch {
    return NextResponse.json({ error: "The email could not be sent. Your message is still here; please try again." }, { status: 502, headers });
  }
}
