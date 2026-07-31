import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentFlightLogCustomer, updateFlightLogProfile } from "@/lib/flight-log-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxBytes = 5 * 1024 * 1024;
const allowed = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
]);

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 90) || "avatar";
}

function matchesFileType(bytes: Buffer, extension: string) {
  if (extension === ".png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === ".jpg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return extension === ".webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

export async function POST(request: NextRequest) {
  const customer = await getCurrentFlightLogCustomer();
  if (!customer) return NextResponse.json({ error: "Sign in to update your profile." }, { status: 401 });
  const form = await request.formData();
  const upload = form.get("avatar");
  if (!(upload instanceof File) || !upload.size) return NextResponse.json({ error: "Choose a profile image." }, { status: 400 });
  if (upload.size > maxBytes) return NextResponse.json({ error: "Profile images must be 5 MB or smaller." }, { status: 413 });
  const extension = allowed.get(upload.type);
  if (!extension) return NextResponse.json({ error: "Use a PNG, JPG, or WEBP profile image." }, { status: 415 });

  const bytes = Buffer.from(await upload.arrayBuffer());
  if (!matchesFileType(bytes, extension)) return NextResponse.json({ error: "The uploaded file is not a valid profile image." }, { status: 415 });

  const directory = path.join(process.cwd(), "public", "media", "flight-log-avatars");
  await fs.mkdir(directory, { recursive: true });
  const filename = customer.id + "-" + Date.now().toString(36) + "-" + safeName(upload.name).replace(/\.[a-z0-9]+$/i, "") + extension;
  await fs.writeFile(path.join(directory, filename), bytes);
  const avatarUrl = "/api/flight-log-avatar-files/" + encodeURIComponent(filename);
  const profile = await updateFlightLogProfile(customer.id, { avatarUrl });
  return NextResponse.json({ ok: true, profile, avatarUrl });
}
