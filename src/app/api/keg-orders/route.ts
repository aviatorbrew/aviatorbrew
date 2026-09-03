import { NextResponse } from "next/server";
import { isMailConfigured, sendMail, verifySmtpOnStart } from "@/lib/mail";
import { requestNewsletterSubscription } from "@/lib/newsletter";
import { buildFlightCrewConfirmationMessage } from "@/lib/newsletter-email";
import { getUploadedKegInventory, type KegInventoryItem } from "@/lib/keg-inventory";

export const runtime = "nodejs";
verifySmtpOnStart();

type PackageSize = "1/6 bbl" | "50 L" | "12 oz cases" | "12 oz 6-packs" | "12 oz 4-packs" | "16 oz cases" | "16 oz 4-packs";

function packageSize(value: unknown): PackageSize | "" {
  return value === "1/6 bbl" || value === "50 L" || value === "12 oz cases" || value === "12 oz 6-packs" || value === "12 oz 4-packs" || value === "16 oz cases" || value === "16 oz 4-packs" ? value : "";
}

function countForPackage(item: KegInventoryItem | undefined, selected: PackageSize) {
  if (!item) return 0;
  if (selected === "1/6 bbl") return item.sixthBblKegs;
  if (selected === "50 L") return item.fiftyLKegs;
  if (selected === "12 oz cases") return item.case12Count || 0;
  if (selected === "12 oz 6-packs") return item.case12SixPackCount || 0;
  if (selected === "12 oz 4-packs") return item.case12FourPackCount || 0;
  if (selected === "16 oz cases") return item.case16Count || 0;
  return item.case16FourPackCount || 0;
}

function priceForPackage(item: KegInventoryItem | undefined, selected: PackageSize) {
  if (!item) return undefined;
  if (selected === "1/6 bbl") return item.sixthBblPriceCents;
  if (selected === "50 L") return item.fiftyLPriceCents;
  if (selected === "12 oz cases") return item.case12PriceCents || (/^12\s*oz$/i.test(item.caseSize || "") ? item.casePriceCents : undefined);
  if (selected === "12 oz 6-packs") return item.has12ozSixPack ? item.case12SixPackPriceCents : undefined;
  if (selected === "12 oz 4-packs") return item.has12ozFourPack ? item.case12FourPackPriceCents : undefined;
  if (selected === "16 oz cases") return item.case16PriceCents || (/^16\s*oz$/i.test(item.caseSize || "") ? item.casePriceCents : undefined);
  return item.has16ozFourPack ? item.case16FourPackPriceCents : undefined;
}

function orderLabel(selected: PackageSize) {
  if (selected === "50 L") return "50 L / 1/2 bbl";
  return selected;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const beerName = typeof body.beerName === "string" ? body.beerName.trim() : "";
    const selectedPackage = packageSize(body.packageSize);
    const quantity = Number(body.quantity);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const business = typeof body.business === "string" ? body.business.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (body.human !== "yes") {
      return NextResponse.json({ error: "Please confirm that you are a real person." }, { status: 400 });
    }
    if (body.website || !beerName || !selectedPackage || !Number.isInteger(quantity) || quantity < 1 || name.length < 2 || phone.length < 7 || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Please select an item and provide your name, phone number, and email." }, { status: 400 });
    }
    const inventory = await getUploadedKegInventory();
    if (!inventory) throw new Error("Inventory unavailable");
    const keg = inventory.items.find((item) => item.beerName === beerName);
    const available = countForPackage(keg, selectedPackage);
    const priceCents = priceForPackage(keg, selectedPackage);
    const unitPriceCents = Number(priceCents || 0);
    const hasAnyInventory = Boolean(keg && (keg.sixthBblKegs > 0 || keg.fiftyLKegs > 0 || (keg.case12Count || 0) > 0 || (keg.case12FourPackCount || 0) > 0 || (keg.case12SixPackCount || 0) > 0 || (keg.case16Count || 0) > 0 || (keg.case16FourPackCount || 0) > 0 || (keg.caseCount || 0) > 0));
    if (!keg || keg.hidden === true || !hasAnyInventory || unitPriceCents <= 0 || available < 1 || quantity > available) return NextResponse.json({ error: "That quantity is no longer available. Please adjust your request and try again." }, { status: 409 });
    if (!isMailConfigured()) throw new Error("Mail delivery is not configured");

    const label = orderLabel(selectedPackage);
    const signup = await requestNewsletterSubscription({ email, name, phone, source: "keg-order" });
    const orderMessage = sendMail({
      to: "orders@aviatorbrew.com",
      subject: "Keg/package order request - " + beerName + " (" + quantity + " x " + label + ")",
      replyTo: email,
      text: ["New Aviator keg/package order request", "", "Beer: " + beerName, "Package: " + label, "Price each: $" + (unitPriceCents / 100).toFixed(2), "Quantity requested: " + quantity, "Available at request: " + available, "", "Name: " + name, "Phone: " + phone, "Email: " + email, business ? "Business: " + business : "", notes ? "Notes: " + notes : "", "", "Flight Crew: confirmation requested from keg/package order"].filter(Boolean).join("\n"),
    });
    const confirmationMessage = signup.confirmationRequired
      ? buildFlightCrewConfirmationMessage(signup.subscriber.email, signup.subscriber.confirmationExpiresAt!)
      : null;
    const [sent, confirmationSent] = await Promise.all([
      orderMessage,
      confirmationMessage ? sendMail({ to: email, subject: confirmationMessage.subject, text: confirmationMessage.text, html: confirmationMessage.html }) : Promise.resolve(true),
    ]);
    if (!sent || !confirmationSent) throw new Error("Mail delivery is not configured");
    return NextResponse.json({ ok: true, message: "Your request has been sent to Aviator sales. We will contact you to confirm availability and pickup details." });
  } catch {
    return NextResponse.json({ error: "We could not send your order request right now. Please try again or call Aviator." }, { status: 500 });
  }
}
