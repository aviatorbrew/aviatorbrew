import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { couponForToken } from "@/lib/coupons";
import { publicSiteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeXml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }


export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const coupon = await couponForToken(token);
  if (!coupon) return new NextResponse("Coupon not found.", { status: 404 });
  const base = publicSiteUrl(new URL(request.url).origin);
  const validationUrl = base.replace(/\/$/, "") + "/coupon-validate?code=" + encodeURIComponent(token);
  const qr = await QRCode.toDataURL(validationUrl, { errorCorrectionLevel: "M", margin: 1, width: 320, color: { dark: "#061827", light: "#f1f6f8" } });
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1200\" height=\"630\" viewBox=\"0 0 1200 630\"><rect width=\"1200\" height=\"630\" fill=\"#061827\"/><path d=\"M0 128H1200M0 540H1200\" stroke=\"#eeb15a\" stroke-width=\"4\" stroke-dasharray=\"18 12\"/><text x=\"70\" y=\"82\" fill=\"#eeb15a\" font-family=\"monospace\" font-size=\"25\" letter-spacing=\"5\">AVIATOR BREWING COMPANY / COUPON</text><text x=\"70\" y=\"222\" fill=\"#f2f7f8\" font-family=\"Arial, sans-serif\" font-size=\"64\" font-weight=\"700\">" + escapeXml(coupon.offer.title) + "</text><text x=\"70\" y=\"286\" fill=\"#bcd3e0\" font-family=\"Arial, sans-serif\" font-size=\"32\">" + escapeXml(coupon.offer.description) + "</text><text x=\"70\" y=\"370\" fill=\"#eeb15a\" font-family=\"monospace\" font-size=\"30\">CODE: " + escapeXml(coupon.offer.code) + "</text><text x=\"70\" y=\"420\" fill=\"#f2f7f8\" font-family=\"Arial, sans-serif\" font-size=\"28\">Expires: " + escapeXml(coupon.offer.expiresAt) + " / Not valid Fri, Sat, or special events</text><text x=\"70\" y=\"482\" fill=\"#bcd3e0\" font-family=\"Arial, sans-serif\" font-size=\"22\">" + escapeXml(coupon.offer.terms || "Show this coupon before ordering.") + "</text><rect x=\"880\" y=\"165\" width=\"250\" height=\"250\" rx=\"8\" fill=\"#f1f6f8\"/><image href=\"" + qr + "\" x=\"895\" y=\"180\" width=\"220\" height=\"220\"/><text x=\"880\" y=\"460\" fill=\"#bcd3e0\" font-family=\"monospace\" font-size=\"18\">SCAN AT BAR</text></svg>";
  return new NextResponse(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store", "content-disposition": "inline; filename=aviator-coupon.svg" } });
}
