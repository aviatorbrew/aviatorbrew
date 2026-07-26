"use client";

import { useCallback, useEffect, useState } from "react";

type WebsitePhoto = { name: string; size: number; updatedAt: string; url: string };
type LocationTarget = { slug: string; name: string };

function readableSize(bytes: number) { return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / 1024 / 1024).toFixed(1) + " MB"; }

export function WebsitePhotosLibrary({ accessKey, location }: { accessKey: string; location?: LocationTarget }) {
  const [photos, setPhotos] = useState<WebsitePhoto[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const query = location ? "?location=" + encodeURIComponent(location.slug) : "";
  const title = location ? location.name + " Photos" : "General Website Photos";
  const description = location ? "Drop approved photos for this location. The newest upload automatically becomes its website hero image; every upload appears in its location gallery." : "Upload approved campaign, campus, and other general website imagery.";

  const request = useCallback((init: RequestInit = {}) => fetch("/api/website-photos" + query, { ...init, headers: { ...(init.headers || {}), "x-menu-library-key": accessKey } }), [accessKey, query]);
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
      await load(); setMessage(location ? "Location photo uploaded and ready for the website." : "Website photo uploaded.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Image upload failed."); }
    finally { setBusy(false); }
  }

  async function remove(fileName: string) {
    if (!window.confirm("Remove this photo? This cannot be undone.")) return;
    setBusy(true);
    try {
      const deleteResponse = await fetch("/api/website-photos" + query + (query ? "&" : "?") + "file=" + encodeURIComponent(fileName), { method: "DELETE", headers: { "x-menu-library-key": accessKey } });
      const body = await deleteResponse.json();
      if (!deleteResponse.ok) throw new Error(body.error || "Could not remove the image.");
      await load(); setMessage("Photo removed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove the image."); }
    finally { setBusy(false); }
  }

  return <section className="website-photo-library"><div className="website-photo-heading"><div><p className="eyebrow">Website imagery</p><h2>{title}</h2><p>{description}</p></div></div>{message && <p className="media-message" role="status">{message}</p>}<div className="website-photo-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); upload(event.dataTransfer.files); }}><input id={"website-photo-upload-" + (location?.slug || "general")} type="file" accept=".png,.jpg,.jpeg,.webp" multiple onChange={(event) => { if (event.currentTarget.files) upload(event.currentTarget.files); }} /><label htmlFor={"website-photo-upload-" + (location?.slug || "general")}>{busy ? "Uploading..." : "Drop photos here or choose files"}</label><small>PNG, JPG, WEBP - 25 MB max</small></div><div className="website-photo-grid">{photos.length ? photos.map((photo) => <article className="website-photo-card" key={photo.name}><img src={photo.url} alt={photo.name.replace(/^[0-9]+-/, "")} /><div><strong>{photo.name.replace(/^[0-9]+-/, "")}</strong><span>{readableSize(photo.size)} - {new Date(photo.updatedAt).toLocaleDateString()}</span><div className="website-photo-actions"><a href={photo.url} target="_blank" rel="noreferrer">Open</a><button type="button" onClick={() => remove(photo.name)} disabled={busy}>Remove</button></div></div></article>) : <p className="website-photo-empty">No photos uploaded yet.</p>}</div></section>;
}
