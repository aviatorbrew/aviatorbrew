import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentFlightLogCustomer, rateLimit, rateLimitKey } from "@/lib/flight-log-auth";
import { createCustomerFlightLogPost, getPublishedCustomerFlightLogPosts } from "@/lib/flight-log-social";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };
const maxBytes = 25 * 1024 * 1024;
const allowed = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["video/quicktime", ".mov"],
]);
const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
function safeName(value: string) { return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 90) || "upload"; }
function validMedia(bytes: Buffer, type: string) {
  if (type === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (type === "video/mp4" || type === "video/quicktime") return bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp";
  if (type === "video/webm") return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

export async function GET() {
  return NextResponse.json({ ok: true, posts: await getPublishedCustomerFlightLogPosts() }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const customer = await getCurrentFlightLogCustomer();
  if (!customer) return NextResponse.json({ error: "Sign in to post." }, { status: 401, headers: noStore });
  if (!customer.emailVerified) return NextResponse.json({ error: "Verify your email before posting." }, { status: 403, headers: noStore });
  try {
    rateLimit(rateLimitKey(request, "customer-post", String(customer.id)), 20, 60 * 60 * 1000);
    const form = await request.formData();
    const uploads = form.getAll("media").filter((item): item is File => item instanceof File && item.size > 0).slice(0, 6);
    const directory = path.join(process.cwd(), "public", "media", "flight-log-posts");
    await fs.mkdir(directory, { recursive: true });
    const media: { url: string; mediaType: string }[] = [];
    for (const upload of uploads) {
      if (upload.size > maxBytes) throw new Error("Each Flight Log upload must be 25 MB or smaller.");
      const extension = allowed.get(upload.type);
      if (!extension) throw new Error("Use JPG, PNG, WEBP, MP4, WEBM, or MOV media.");
      const bytes = Buffer.from(await upload.arrayBuffer());
      if (!validMedia(bytes, upload.type)) throw new Error("One uploaded file is not valid media.");
      const filename = customer.id + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7) + "-" + safeName(upload.name).replace(/\.[a-z0-9]+$/i, "") + extension;
      await fs.writeFile(path.join(directory, filename), bytes);
      media.push({ url: "/media/flight-log-posts/" + filename, mediaType: upload.type });
    }
    const tagHandles = clean(form.get("tagHandles"), 300).split(/[\s,]+/).map((item) => item.replace(/^@/, "")).filter(Boolean);
    await createCustomerFlightLogPost(customer.id, { title: clean(form.get("title"), 120), body: clean(form.get("body"), 5000), media, tagHandles });
    return NextResponse.json({ ok: true, posts: await getPublishedCustomerFlightLogPosts() }, { status: 201, headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not publish your post.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Too many") ? 429 : 400, headers: noStore });
  }
}
