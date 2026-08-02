import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isMenuLocation } from "@/data/menu-library";
import { canManageMedia, menuLibraryKey } from "@/lib/manager-auth";
import { requestBodyExceeds } from "@/lib/server-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);
const menuTypes = new Set(["food", "drinks"]);
const maxBytes = 25 * 1024 * 1024;
const uploadRoot = path.join(process.cwd(), "public", "media", "menus");

function authorized(request: NextRequest) { return canManageMedia(request); }

function deny() {
  if (!menuLibraryKey()) {
    return NextResponse.json({ error: "Menu Library is not configured. Set MENU_LIBRARY_KEY on the server." }, { status: 503 });
  }
  return NextResponse.json({ error: "Access denied." }, { status: 401 });
}

function menuType(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("type") || "food";
  return menuTypes.has(value) ? value : null;
}

function directoryFor(location: string, type: string) {
  return path.join(uploadRoot, location, type);
}

function safeFileName(value: string) {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "").slice(0, 120);
}

function publicUrl(location: string, type: string, fileName: string) {
  return "/media/menus/" + location + "/" + type + "/" + encodeURIComponent(fileName);
}

async function deleteExistingMenuFiles(directory: string) {
  await fs.mkdir(directory, { recursive: true });
  const entries = await fs.readdir(directory, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isFile()).map((entry) => fs.unlink(path.join(directory, entry.name))));
}

async function resolve(request: NextRequest, context: { params: Promise<{ location: string }> }) {
  const { location } = await context.params;
  const type = menuType(request);
  if (!isMenuLocation(location) || !type) return null;
  return { location, type };
}

export async function GET(request: NextRequest, context: { params: Promise<{ location: string }> }) {
  if (!authorized(request)) return deny();
  const target = await resolve(request, context);
  if (!target) return NextResponse.json({ error: "Unknown location or menu type." }, { status: 404 });

  const directory = directoryFor(target.location, target.type);
  await fs.mkdir(directory, { recursive: true });
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.filter((entry) => entry.isFile()).map(async (entry) => {
    const stats = await fs.stat(path.join(directory, entry.name));
    return { name: entry.name, size: stats.size, updatedAt: stats.mtime.toISOString(), url: publicUrl(target.location, target.type, entry.name) };
  }));
  files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return NextResponse.json({ ...target, files });
}

export async function POST(request: NextRequest, context: { params: Promise<{ location: string }> }) {
  if (!authorized(request)) return deny();
  const target = await resolve(request, context);
  if (!target) return NextResponse.json({ error: "Unknown location or menu type." }, { status: 404 });

  if (requestBodyExceeds(request, maxBytes + 1024 * 1024)) return NextResponse.json({ error: "Files must be 25 MB or smaller." }, { status: 413 });
  const formData = await request.formData();
  const upload = formData.get("file");
  if (!(upload instanceof File)) return NextResponse.json({ error: "Choose a menu file to upload." }, { status: 400 });
  if (upload.size > maxBytes) return NextResponse.json({ error: "Files must be 25 MB or smaller." }, { status: 413 });

  const fileName = safeFileName(upload.name);
  if (!fileName || !allowedExtensions.has(path.extname(fileName).toLowerCase())) {
    return NextResponse.json({ error: "Use a PDF, PNG, JPG, or WEBP menu file." }, { status: 415 });
  }

  const directory = directoryFor(target.location, target.type);
  await deleteExistingMenuFiles(directory);
  const savedName = Date.now() + "-" + fileName;
  await fs.writeFile(path.join(directory, savedName), Buffer.from(await upload.arrayBuffer()));
  return NextResponse.json({ name: savedName, size: upload.size, url: publicUrl(target.location, target.type, savedName) }, { status: 201 });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ location: string }> }) {
  if (!authorized(request)) return deny();
  const target = await resolve(request, context);
  if (!target) return NextResponse.json({ error: "Unknown location or menu type." }, { status: 404 });
  const fileName = request.nextUrl.searchParams.get("file");
  if (!fileName || safeFileName(fileName) !== fileName) return NextResponse.json({ error: "Invalid file." }, { status: 400 });

  try {
    await fs.unlink(path.join(directoryFor(target.location, target.type), fileName));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
}
