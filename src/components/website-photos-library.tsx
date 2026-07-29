"use client";

import { useCallback, useEffect, useState } from "react";

type WebsitePhoto = {
  name: string;
  size: number;
  updatedAt: string;
  url: string;
  source: "uploaded" | "bundled";
  featured: boolean;
  mediaType?: "image" | "video";
};
type LocationTarget = { slug: string; name: string };

function readableSize(photo: WebsitePhoto) {
  if (photo.source === "bundled") return "Default website image";
  return photo.size < 1024 * 1024 ? Math.max(1, Math.round(photo.size / 1024)) + " KB" : (photo.size / 1024 / 1024).toFixed(1) + " MB";
}

const maxImageUploadBytes = 25 * 1024 * 1024;
const maxVideoUploadBytes = 60 * 1024 * 1024;
const compressAboveBytes = 8 * 1024 * 1024;
const maxImageEdge = 2400;
const imageExtensions = new Set(["png", "jpg", "jpeg", "webp"]);
const videoExtensions = new Set(["mp4", "webm", "mov", "m4v"]);

function fileExtension(file: File) {
  return file.name.split(".").pop()?.toLowerCase() || "";
}

function compressedName(file: File) {
  return file.name.replace(/\.[^.]+$/, "") + "-web.jpg";
}

async function readError(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  if (!text) return fallback;
  try {
    const body = JSON.parse(text) as { error?: string };
    return body.error || fallback;
  } catch {
    return text.slice(0, 180) || fallback;
  }
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .86));
}

async function preparePhotoUpload(file: File) {
  const extension = fileExtension(file);
  if (videoExtensions.has(extension)) {
    if (file.size > maxVideoUploadBytes) throw new Error("Short videos must be 60 MB or smaller.");
    return file;
  }
  if (!imageExtensions.has(extension)) throw new Error("Use a PNG, JPG, WEBP, MP4, WEBM, MOV, or M4V file.");
  if (file.size <= compressAboveBytes) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = largestSide > maxImageEdge ? maxImageEdge / largestSide : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this photo for upload.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await canvasBlob(canvas);
    if (blob && blob.size < file.size) return new File([blob], compressedName(file), { type: "image/jpeg" });
  } catch {
    if (file.size > maxImageUploadBytes) throw new Error("This image is too large to upload. Export it as a JPG under 25 MB and try again.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  if (file.size > maxImageUploadBytes) throw new Error("Images must be 25 MB or smaller.");
  return file;
}

export function WebsitePhotosLibrary({ accessKey, location }: { accessKey: string; location?: LocationTarget }) {
  const [photos, setPhotos] = useState<WebsitePhoto[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const query = location ? "?location=" + encodeURIComponent(location.slug) : "";
  const title = location ? location.name + " Photos" : "General Website Photos";
  const description = location?.slug === "brewery"
    ? "Upload brewery-only photos for the public Brewery page. Choose Set featured to make one photo the large lead image in the brewery gallery."
    : location?.slug === "private-events"
      ? "Upload Ready Room private event photos for the public Private Events page. Choose Set featured to make one photo the large lead image in the room gallery."
      : location
        ? "Upload approved photos, then choose the image that should lead this page. Every image remains available in the gallery."
        : "Upload approved campaign, campus, and other general website imagery.";

  const request = useCallback((init: RequestInit = {}) => fetch("/api/website-photos" + query, {
    ...init,
    cache: "no-store",
    headers: { ...(init.headers || {}), "x-menu-library-key": accessKey },
  }), [accessKey, query]);

  const load = useCallback(async () => {
    const response = await request();
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load photos.");
    setPhotos(body.files);
  }, [request]);

  useEffect(() => { load().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load photos.")); }, [load]);

  async function upload(files: FileList | File[]) {
    if (!files.length) return;
    setBusy(true); setMessage("");
    try {
      for (const file of Array.from(files)) {
        setMessage(file.size > compressAboveBytes ? "Preparing " + file.name + " for upload..." : "Uploading " + file.name + "...");
        const prepared = await preparePhotoUpload(file);
        const formData = new FormData(); formData.append("file", prepared);
        const response = await request({ method: "POST", body: formData });
        if (!response.ok) throw new Error(await readError(response, "Image upload failed."));
      }
      await load();
      setMessage(location ? "Photo uploaded. Choose Set featured to make it the lead image." : "Website photo uploaded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Image upload failed."); }
    finally { setBusy(false); }
  }

  async function feature(photo: WebsitePhoto) {
    if (!location || photo.featured) return;
    setBusy(true); setMessage("");
    try {
      const response = await request({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file: photo.name, source: photo.source }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not set the featured photo.");
      await load(); setMessage(photo.name.replace(/^[0-9]+-/, "") + " is now featured.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not set the featured photo."); }
    finally { setBusy(false); }
  }

  async function remove(photo: WebsitePhoto) {
    if (!window.confirm(photo.source === "uploaded" ? "Delete this photo? This cannot be undone." : "Delete this default photo everywhere? This cannot be undone.")) return;
    setBusy(true);
    try {
      const deleteResponse = await fetch("/api/website-photos" + query + (query ? "&" : "?") + "file=" + encodeURIComponent(photo.name) + "&source=" + encodeURIComponent(photo.source), {
        method: "DELETE",
        cache: "no-store",
        headers: { "x-menu-library-key": accessKey },
      });
      const body = await deleteResponse.json();
      if (!deleteResponse.ok) throw new Error(body.error || "Could not remove the image.");
      await load(); setMessage("Photo removed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove the image."); }
    finally { setBusy(false); }
  }

  return <section className="website-photo-library">
    <div className="website-photo-heading"><div><p className="eyebrow">{location?.slug === "brewery" ? "Brewery-only imagery" : location?.slug === "private-events" ? "Private event room imagery" : "Website imagery"}</p><h2>{title}</h2><p>{description}</p></div></div>
    {message && <p className="media-message" role="status">{message}</p>}
    <div className="website-photo-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); upload(event.dataTransfer.files); }}>
      <input id={"website-photo-upload-" + (location?.slug || "general")} type="file" accept=".png,.jpg,.jpeg,.webp,.mp4,.webm,.mov,.m4v,image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime" multiple onChange={(event) => { if (event.currentTarget.files) upload(event.currentTarget.files); }} />
      <label htmlFor={"website-photo-upload-" + (location?.slug || "general")}>{busy ? "Working..." : "Drop photos here or choose files"}</label>
      <small>PNG, JPG, WEBP, MP4, WEBM, MOV, M4V - large photos are compressed automatically; videos max 60 MB</small>
    </div>
    <div className="website-photo-grid">{photos.length ? photos.map((photo) => <article className={"website-photo-card" + (photo.featured ? " is-featured" : "")} key={photo.source + photo.name}>
      <div className="website-photo-preview">{photo.mediaType === "video" ? <video src={photo.url} controls muted playsInline preload="metadata" /> : <img src={photo.url} alt={photo.name.replace(/^[0-9]+-/, "")} />}{photo.featured ? <strong>Featured</strong> : null}</div>
      <div><strong>{photo.name.replace(/^[0-9]+-/, "")}</strong><span>{readableSize(photo)}{photo.updatedAt ? " - " + new Date(photo.updatedAt).toLocaleDateString() : ""}</span><div className="website-photo-actions"><a href={photo.url} target="_blank" rel="noreferrer">Open</a>{location && !photo.featured && photo.mediaType !== "video" ? <button className="feature-photo-button" type="button" onClick={() => feature(photo)} disabled={busy}>Set featured</button> : null}{location && photo.mediaType === "video" ? <span className="website-photo-video-note">Gallery video</span> : null}<button className="remove-photo-button" type="button" onClick={() => remove(photo)} disabled={busy}>Delete</button></div></div>
    </article>) : <p className="website-photo-empty">No photos uploaded yet.</p>}</div>
  </section>;
}
