import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { locations } from "@/data/site";
import { canManageMedia } from "@/lib/manager-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const maxBytes = 25 * 1024 * 1024;
const globalDirectory = path.join(process.cwd(), "public", "media", "website-photos");
const locationSlugs = new Set(locations.map((location) => location.slug));

function authorized(request: NextRequest) { return canManageMedia(request); }

function deny() {
  if (!process.env.MENU_LIBRARY_KEY) return NextResponse.json({ error: "Media Library is not configured." }, { status: 503 });
  return NextResponse.json({ error: "Access denied." }, { status: 401 });
}

function safeFileName(value: string) {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "").slice(0, 120);
}

function target(request: NextRequest) {
  const location = request.nextUrl.searchParams.get("location");
  if (!location) return { directory: globalDirectory, prefix: "/media/website-photos/", location: null };
  if (!locationSlugs.has(location)) return null;
  return { directory: path.join(process.cwd(), "public", "media", "location-photos", location), prefix: "/media/location-photos/" + location + "/", location };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return deny();
  const destination = target(request);
  if (!destination) return NextResponse.json({ error: "Invalid location." }, { status: 400 });
  await fs.mkdir(destination.directory, { recursive: true });
  const entries = await fs.readdir(destination.directory, { withFileTypes: true });
  const files = await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
    const stats = await fs.stat(path.join(destination.directory, entry.name));
    return { name: entry.name, size: stats.size, updatedAt: stats.mtime.toISOString(), url: destination.prefix + encodeURIComponent(entry.name) };
  }));
  files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return NextResponse.json({ files });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return deny();
  const destination = target(request);
  if (!destination) return NextResponse.json({ error: "Invalid location." }, { status: 400 });
  const formData = await request.formData();
  const upload = formData.get("file");
  if (!(upload instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  if (upload.size > maxBytes) return NextResponse.json({ error: "Images must be 25 MB or smaller." }, { status: 413 });
  const fileName = safeFileName(upload.name);
  if (!fileName || !allowedExtensions.has(path.extname(fileName).toLowerCase())) return NextResponse.json({ error: "Use a PNG, JPG, or WEBP image." }, { status: 415 });
  await fs.mkdir(destination.directory, { recursive: true });
  const savedName = Date.now() + "-" + fileName;
  await fs.writeFile(path.join(destination.directory, savedName), Buffer.from(await upload.arrayBuffer()));
  return NextResponse.json({ name: savedName, size: upload.size, url: destination.prefix + encodeURIComponent(savedName) }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  if (!authorized(request)) return deny();
  const destination = target(request);
  if (!destination) return NextResponse.json({ error: "Invalid location." }, { status: 400 });
  const fileName = request.nextUrl.searchParams.get("file");
  if (!fileName || safeFileName(fileName) !== fileName) return NextResponse.json({ error: "Invalid file." }, { status: 400 });
  try {
    await fs.unlink(path.join(destination.directory, fileName));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }
}
