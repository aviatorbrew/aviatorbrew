import { NextResponse } from "next/server";
import { isMailConfigured, sendMail, verifySmtpOnStart } from "@/lib/mail";
import { requestNewsletterSubscription } from "@/lib/newsletter";
import { buildFlightCrewConfirmationMessage } from "@/lib/newsletter-email";
import { getUploadedKegInventory } from "@/lib/keg-inventory";

export const runtime = "nodejs";
verifySmtpOnStart();

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const beerName = typeof body.beerName === "string" ? body.beerName.trim() : "";
    const packageSize = body.packageSize === "1/6 bbl" || body.packageSize === "50 L" ? body.packageSize : "";
    const quantity = Number(body.quantity);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const business = typeof body.business === "string" ? body.business.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (body.website || !beerName || !packageSize || !Number.isInteger(quantity) || quantity < 1 || name.length < 2 || phone.length < 7 || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Please select a keg and provide your name, phone number, and email." }, { status: 400 });
    }
    const inventory = await getUploadedKegInventory();
    if (!inventory) throw new Error("Inventory unavailable");
    const keg = inventory.items.find((item) => item.beerName === beerName);
    const available = packageSize === "1/6 bbl" ? keg?.sixthBblKegs || 0 : keg?.fiftyLKegs || 0;
    if (!keg || quantity > available) return NextResponse.json({ error: "That quantity is no longer available. Please adjust your request and try again." }, { status: 409 });
    if (!isMailConfigured()) throw new Error("Mail delivery is not configured");

    const signup = await requestNewsletterSubscription({ email, name, phone, source: "keg-order" });
    const orderMessage = sendMail({
      to: "orders@aviatorbrew.com",
      subject: "Keg order request - " + beerName + " (" + quantity + " x " + packageSize + ")",
      replyTo: email,
      text: ["New Aviator keg order request", "", "Beer: " + beerName, "Package: " + packageSize, "Quantity requested: " + quantity, "Available at request: " + available, "", "Name: " + name, "Phone: " + phone, "Email: " + email, business ? "Business: " + business : "", notes ? "Notes: " + notes : "", "", "Flight Crew: confirmation requested from keg order"].filter(Boolean).join("\n"),
    });
    const confirmationMessage = signup.confirmationRequired
      ? buildFlightCrewConfirmationMessage(signup.subscriber.email, signup.subscriber.confirmationExpiresAt!)
      : null;
    const [sent, confirmationSent] = await Promise.all([
      orderMessage,
      confirmationMessage ? sendMail({ to: email, subject: confirmationMessage.subject, text: confirmationMessage.text, html: confirmationMessage.html }) : Promise.resolve(true),
    ]);
    if (!sent || !confirmationSent) throw new Error("Mail delivery is not configured");
    return NextResponse.json({ ok: true, message: "Your request has been sent to Aviator keg sales. We will contact you to confirm availability and pickup details." });
  } catch {
    return NextResponse.json({ error: "We could not send your keg request right now. Please try again or call Aviator." }, { status: 500 });
  }
}
