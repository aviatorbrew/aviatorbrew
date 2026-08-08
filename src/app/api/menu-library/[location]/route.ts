import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isMenuLocation } from "@/data/menu-library";
import { canManageMedia, menuLibraryKey } from "@/lib/manager-auth";
import { menuDirectory, menuFileTypes, menuPublicUrl } from "@/lib/menu-files";
import { requestBodyExceeds } from "@/lib/server-file-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const menuExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);
const orderingJsonExtension = ".json";
const maxBytes = 25 * 1024 * 1024;
const maxJsonBytes = 1 * 1024 * 1024;

function authorized(request: NextRequest) { return canManageMedia(request); }

function deny() {
  if (!menuLibraryKey()) {
    return NextResponse.json({ error: "Menu Library is not configured. Set MENU_LIBRARY_KEY on the server." }, { status: 503 });
  }
  return NextResponse.json({ error: "Access denied." }, { status: 401 });
}

function menuType(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("type") || "food";
  return menuFileTypes.has(value) ? value : null;
}

function directoryFor(location: string, type: string) {
  return menuDirectory(location, type);
}

function safeFileName(value: string) {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "").slice(0, 120);
}

function publicUrl(location: string, type: string, fileName: string) {
  return menuPublicUrl(location, type, fileName);
}

function canUploadOrderingJson(location: string, type: string) {
  return location === "catering-events" && type === "drinks";
}

async function deleteExistingMenuFiles(directory: string, mode: "menu" | "ordering-json") {
  await fs.mkdir(directory, { recursive: true });
  const entries = await fs.readdir(directory, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => {
    if (!entry.isFile()) return false;
    const extension = path.extname(entry.name).toLowerCase();
    return mode === "ordering-json" ? extension === orderingJsonExtension : extension !== orderingJsonExtension;
  }).map((entry) => fs.unlink(path.join(directory, entry.name))));
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
  const extension = path.extname(fileName).toLowerCase();
  const isOrderingJson = extension === orderingJsonExtension;
  if (!fileName || (!menuExtensions.has(extension) && !isOrderingJson)) {
    return NextResponse.json({ error: "Use a PDF, PNG, JPG, WEBP, or Catering To-Go ordering JSON file." }, { status: 415 });
  }
  if (isOrderingJson && !canUploadOrderingJson(target.location, target.type)) {
    return NextResponse.json({ error: "Ordering JSON uploads are only available for Catering To-Go." }, { status: 415 });
  }
  if (isOrderingJson && upload.size > maxJsonBytes) return NextResponse.json({ error: "Ordering JSON files must be 1 MB or smaller." }, { status: 413 });

  const bytes = Buffer.from(await upload.arrayBuffer());
  if (isOrderingJson) {
    try { JSON.parse(bytes.toString("utf8")); }
    catch { return NextResponse.json({ error: "Upload a valid JSON file for the Catering To-Go order form." }, { status: 400 }); }
  }

  const directory = directoryFor(target.location, target.type);
  await deleteExistingMenuFiles(directory, isOrderingJson ? "ordering-json" : "menu");
  const savedName = Date.now() + "-" + fileName;
  await fs.writeFile(path.join(directory, savedName), bytes);
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
