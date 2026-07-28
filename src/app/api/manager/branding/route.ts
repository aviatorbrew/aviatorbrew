import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { brandLogoUrl, findCustomLogo, removeCustomLogo, saveCustomLogo } from "@/lib/site-branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxBytes = 10 * 1024 * 1024;

function matchesFileType(bytes: Buffer, extension: string) {
  if (extension === ".png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === ".jpg" || extension === ".jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return extension === ".webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

function unauthorized(request: NextRequest) {
  return !isManager(request) ? NextResponse.json({ error: "Unauthorized" }, { status: 401 }) : null;
}

async function response() {
  const logo = await findCustomLogo();
  return NextResponse.json({
    custom: Boolean(logo),
    logoUrl: brandLogoUrl + "?v=" + (logo ? new Date(logo.updatedAt).getTime() : "default"),
    updatedAt: logo?.updatedAt || null,
  });
}

export async function GET(request: NextRequest) {
  return unauthorized(request) || response();
}

export async function POST(request: NextRequest) {
  const denied = unauthorized(request);
  if (denied) return denied;

  const form = await request.formData();
  const upload = form.get("logo");
  if (!(upload instanceof File) || !upload.size) return NextResponse.json({ error: "Choose a logo to upload." }, { status: 400 });
  if (upload.size > maxBytes) return NextResponse.json({ error: "Logos must be 10 MB or smaller." }, { status: 413 });
  const extension = path.extname(upload.name).toLowerCase();
  if (!allowedExtensions.has(extension) || !allowedTypes.has(upload.type)) return NextResponse.json({ error: "Use a PNG, JPG, or WEBP logo." }, { status: 415 });

  const bytes = Buffer.from(await upload.arrayBuffer());
  if (!matchesFileType(bytes, extension)) return NextResponse.json({ error: "The uploaded file is not a valid image." }, { status: 415 });

  try {
    await saveCustomLogo(extension, bytes);
    return response();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save the logo." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = unauthorized(request);
  if (denied) return denied;
  try {
    await removeCustomLogo();
    return response();
  } catch {
    return NextResponse.json({ error: "Could not restore the default logo." }, { status: 500 });
  }
}
