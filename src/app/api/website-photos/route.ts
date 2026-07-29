import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { breweryPhotoManifest } from "@/data/brewery-photo-manifest";
import { locationPhotoManifest } from "@/data/location-photo-manifest";
import { canManageMedia } from "@/lib/manager-auth";
import {
  getFeaturedPhotos,
  getHiddenPhotos,
  hidePhoto,
  legacyPhotoDirectory,
  listUploadedPhotos,
  photoDirectory,
  setFeaturedPhoto,
  validPhotoTarget,
  websitePhotoUrl,
  type PhotoSource,
} from "@/lib/website-photo-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const maxBytes = 25 * 1024 * 1024;
const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

function authorized(request: NextRequest) { return canManageMedia(request); }

function deny() {
  if (!process.env.MENU_LIBRARY_KEY) return NextResponse.json({ error: "Media Library is not configured." }, { status: 503, headers: noStore });
  return NextResponse.json({ error: "Access denied." }, { status: 401, headers: noStore });
}

function safeFileName(value: string) {
  return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "").slice(0, 120);
}

function target(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("location") || "general";
  return validPhotoTarget(value) ? value : null;
}

function bundledPhotos(targetName: string) {
  if (targetName === "brewery") {
    return breweryPhotoManifest.map((name) => ({
      name,
      size: 0,
      updatedAt: "",
      url: "/images/website-photos/" + encodeURIComponent(name),
      source: "bundled" as const,
    }));
  }
  if (targetName === "private-events") return [];
  return (locationPhotoManifest[targetName] || []).map((name) => ({
    name,
    size: 0,
    updatedAt: "",
    url: "/images/location-photos/" + targetName + "/" + encodeURIComponent(name),
    source: "bundled" as const,
  }));
}


function bundledPhotoPaths(targetName: string, fileName: string) {
  if (targetName === "brewery" || targetName === "general") return [
    path.join(process.cwd(), "public", "images", "website-photos", fileName),
    path.join(process.cwd(), "public", "media", "website-photos", fileName),
  ];
  if (targetName === "private-events") return [];
  return [
    path.join(process.cwd(), "public", "images", "location-photos", targetName, fileName),
    path.join(process.cwd(), "public", "media", "location-photos", targetName, fileName),
  ];
}

function refreshTarget(targetName: string) {
  revalidatePath("/");
  revalidatePath("/order-food");
  if (targetName === "brewery") revalidatePath("/brewery");
  else if (targetName === "private-events") revalidatePath("/private-events");
  else if (targetName !== "general") {
    revalidatePath("/locations");
    revalidatePath("/locations/" + targetName);
  }
}

async function featuredSelectionExists(targetName: string, fileName: string, source: PhotoSource) {
  if (source === "uploaded") return (await listUploadedPhotos(targetName)).some((photo) => photo.name === fileName);
  const hidden = await getHiddenPhotos();
  return !(hidden[targetName] || []).includes(fileName) && bundledPhotos(targetName).some((photo) => photo.name === fileName);
}

async function cleanFeaturedSelection(targetName: string, removedFileName?: string) {
  const featured = await getFeaturedPhotos();
  const selected = featured[targetName];
  if (!selected) return false;
  const removed = selected.source === "uploaded" && selected.name === removedFileName;
  const missing = !removed && !(await featuredSelectionExists(targetName, selected.name, selected.source));
  if (!removed && !missing) return false;
  await setFeaturedPhoto(targetName);
  return true;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return deny();
  const targetName = target(request);
  if (!targetName) return NextResponse.json({ error: "Invalid photo target." }, { status: 400, headers: noStore });
  await fs.mkdir(photoDirectory(targetName), { recursive: true });
  const [uploads, featured, hidden] = await Promise.all([listUploadedPhotos(targetName), getFeaturedPhotos(), getHiddenPhotos()]);
  const uploadedNames = new Set(uploads.map((photo) => photo.name));
  const hiddenNames = new Set(hidden[targetName] || []);
  const files = [...uploads, ...bundledPhotos(targetName).filter((photo) => !uploadedNames.has(photo.name) && !hiddenNames.has(photo.name))]
    .sort((a, b) => b.name.localeCompare(a.name) || b.updatedAt.localeCompare(a.updatedAt));
  const selected = featured[targetName];
  const active = selected && files.some((photo) => photo.name === selected.name && photo.source === selected.source)
    ? selected
    : files[0] ? { name: files[0].name, source: files[0].source } : null;
  return NextResponse.json({
    files: files.map((photo) => ({ ...photo, featured: Boolean(active && active.name === photo.name && active.source === photo.source) })),
  }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return deny();
  const targetName = target(request);
  if (!targetName) return NextResponse.json({ error: "Invalid photo target." }, { status: 400, headers: noStore });
  const formData = await request.formData();
  const upload = formData.get("file");
  if (!(upload instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400, headers: noStore });
  if (upload.size > maxBytes) return NextResponse.json({ error: "Images must be 25 MB or smaller." }, { status: 413, headers: noStore });
  const fileName = safeFileName(upload.name);
  if (!fileName || !allowedExtensions.has(path.extname(fileName).toLowerCase())) {
    return NextResponse.json({ error: "Use a PNG, JPG, or WEBP image." }, { status: 415, headers: noStore });
  }
  const directory = photoDirectory(targetName);
  await fs.mkdir(directory, { recursive: true });
  const savedName = Date.now() + "-" + fileName;
  await fs.writeFile(path.join(directory, savedName), Buffer.from(await upload.arrayBuffer()));
  refreshTarget(targetName);
  return NextResponse.json({
    name: savedName,
    size: upload.size,
    url: websitePhotoUrl(targetName, savedName),
    source: "uploaded",
  }, { status: 201, headers: noStore });
}

export async function PATCH(request: NextRequest) {
  if (!authorized(request)) return deny();
  const targetName = target(request);
  if (!targetName || targetName === "general") {
    return NextResponse.json({ error: "Choose a location or the brewery." }, { status: 400, headers: noStore });
  }
  const body = await request.json() as { file?: string; source?: PhotoSource };
  const file = safeFileName(body.file || "");
  const source = body.source;
  if (!file || file !== body.file || (source !== "uploaded" && source !== "bundled")) {
    return NextResponse.json({ error: "Choose a valid featured photo." }, { status: 400, headers: noStore });
  }
  const exists = source === "uploaded"
    ? (await listUploadedPhotos(targetName)).some((photo) => photo.name === file)
    : bundledPhotos(targetName).some((photo) => photo.name === file) && !((await getHiddenPhotos())[targetName] || []).includes(file);
  if (!exists) return NextResponse.json({ error: "Photo not found." }, { status: 404, headers: noStore });
  await setFeaturedPhoto(targetName, { name: file, source });
  refreshTarget(targetName);
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function DELETE(request: NextRequest) {
  if (!authorized(request)) return deny();
  const targetName = target(request);
  if (!targetName) return NextResponse.json({ error: "Invalid photo target." }, { status: 400, headers: noStore });
  const fileName = request.nextUrl.searchParams.get("file");
  const source = request.nextUrl.searchParams.get("source") || "uploaded";
  if (!fileName || safeFileName(fileName) !== fileName || (source !== "uploaded" && source !== "bundled")) {
    return NextResponse.json({ error: "Invalid file." }, { status: 400, headers: noStore });
  }
  let removed = false;
  if (source === "bundled") {
    const hidden = await getHiddenPhotos();
    const alreadyHidden = (hidden[targetName] || []).includes(fileName);
    const bundled = bundledPhotos(targetName).some((photo) => photo.name === fileName);
    if (!bundled && !alreadyHidden) return NextResponse.json({ error: "Image not found." }, { status: 404, headers: noStore });
    if (!alreadyHidden) await hidePhoto(targetName, fileName);
    removed = true;
    for (const filePath of bundledPhotoPaths(targetName, fileName)) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  if (source === "uploaded") {
    await hidePhoto(targetName, fileName);
    removed = true;
    for (const directory of [...new Set([photoDirectory(targetName), legacyPhotoDirectory(targetName)])]) {
      try {
        await fs.unlink(path.join(directory, fileName));
        removed = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  if (!removed) return NextResponse.json({ error: "Image not found." }, { status: 404, headers: noStore });
  await cleanFeaturedSelection(targetName, fileName);
  refreshTarget(targetName);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
