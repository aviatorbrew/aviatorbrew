"use client";

import { useCallback, useEffect, useState } from "react";

type WebsitePhoto = {
  name: string;
  size: number;
  updatedAt: string;
  url: string;
  source: "uploaded" | "bundled";
  featured: boolean;
};
type LocationTarget = { slug: string; name: string };

function readableSize(photo: WebsitePhoto) {
  if (photo.source === "bundled") return "Default website image";
  return photo.size < 1024 * 1024 ? Math.max(1, Math.round(photo.size / 1024)) + " KB" : (photo.size / 1024 / 1024).toFixed(1) + " MB";
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
        const formData = new FormData(); formData.append("file", file);
        const response = await request({ method: "POST", body: formData });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Image upload failed.");
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
      <input id={"website-photo-upload-" + (location?.slug || "general")} type="file" accept=".png,.jpg,.jpeg,.webp" multiple onChange={(event) => { if (event.currentTarget.files) upload(event.currentTarget.files); }} />
      <label htmlFor={"website-photo-upload-" + (location?.slug || "general")}>{busy ? "Working..." : "Drop photos here or choose files"}</label>
      <small>PNG, JPG, WEBP - 25 MB max</small>
    </div>
    <div className="website-photo-grid">{photos.length ? photos.map((photo) => <article className={"website-photo-card" + (photo.featured ? " is-featured" : "")} key={photo.source + photo.name}>
      <div className="website-photo-preview"><img src={photo.url} alt={photo.name.replace(/^[0-9]+-/, "")} />{photo.featured ? <strong>Featured</strong> : null}</div>
      <div><strong>{photo.name.replace(/^[0-9]+-/, "")}</strong><span>{readableSize(photo)}{photo.updatedAt ? " - " + new Date(photo.updatedAt).toLocaleDateString() : ""}</span><div className="website-photo-actions"><a href={photo.url} target="_blank" rel="noreferrer">Open</a>{location && !photo.featured ? <button className="feature-photo-button" type="button" onClick={() => feature(photo)} disabled={busy}>Set featured</button> : null}<button className="remove-photo-button" type="button" onClick={() => remove(photo)} disabled={busy}>Delete</button></div></div>
    </article>) : <p className="website-photo-empty">No photos uploaded yet.</p>}</div>
  </section>;
}
