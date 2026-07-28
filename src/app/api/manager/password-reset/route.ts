import { NextRequest, NextResponse } from "next/server";
import { createManagerPasswordReset, resetManagerPassword } from "@/lib/manager-credentials";
import { isMailConfigured, sendMail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, number>();

function managerEmail() {
  return process.env.MANAGER_PORTAL_EMAIL || process.env.MAIL_REPLY_TO || "";
}

function mailAvailable() {
  return isMailConfigured() || process.env.MAIL_MODE === "record";
}

export async function POST(request: NextRequest) {
  const email = managerEmail();
  if (!email || !mailAvailable()) return NextResponse.json({ error: "Password reset email is not configured." }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const lastAttempt = attempts.get(ip) || 0;
  if (Date.now() - lastAttempt < 15 * 60 * 1000) return NextResponse.json({ error: "A reset email was already requested. Try again in 15 minutes." }, { status: 429 });
  attempts.set(ip, Date.now());

  try {
    const token = await createManagerPasswordReset();
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
    const resetUrl = `${origin}/manager/reset?token=${encodeURIComponent(token)}`;
    const delivered = await sendMail({
      to: email,
      subject: "Reset your Aviator manager password",
      text: `A password reset was requested for the Aviator manager portal.\n\nReset your password: ${resetUrl}\n\nThis link expires in 30 minutes. If you did not request this, you can ignore this message.`,
      html: `<p>A password reset was requested for the Aviator manager portal.</p><p><a href="${resetUrl}">Reset manager password</a></p><p>This link expires in 30 minutes. If you did not request this, you can ignore this message.</p>`,
    });
    if (!delivered) throw new Error("Password reset email is not configured.");
    return NextResponse.json({ ok: true, message: "A password reset link was sent to the manager email address." });
  } catch (error) {
    attempts.delete(ip);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send the reset email." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { token?: string; password?: string };
    await resetManagerPassword(body.token || "", body.password || "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not reset the password." }, { status: 400 });
  }
}
