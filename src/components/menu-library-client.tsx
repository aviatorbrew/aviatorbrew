"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { menuLocations } from "@/data/menu-library";
import { WebsitePhotosLibrary } from "@/components/website-photos-library";
import { CouponManager } from "@/components/coupons";

type MenuFile = { name: string; size: number; updatedAt: string; url: string };
type MenuKind = "food" | "drinks";
type FileMap = Record<string, MenuFile[]>;

const menuKinds: { id: MenuKind; label: string }[] = [{ id: "food", label: "Food Menu" }, { id: "drinks", label: "Drinks Menu" }];
const menuUploadAccept = ".pdf,.png,.jpg,.jpeg,.webp";
const orderingJsonAccept = ".json,application/json";

function folderKey(location: string, kind: MenuKind) { return location + ":" + kind; }
function labelsFor(location: string) { return location === "catering-events" ? [{ id: "food" as MenuKind, label: "Onsite Event Buffet" }, { id: "drinks" as MenuKind, label: "Catering To-Go" }] : menuKinds; }
function readableSize(bytes: number) { return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " KB" : (bytes / 1024 / 1024).toFixed(1) + " MB"; }
function isOrderingJsonFile(name: string) { return name.toLowerCase().endsWith(".json"); }
function isCateringToGo(location: string, kind: MenuKind) { return location === "catering-events" && kind === "drinks"; }
function fileRole(name: string) { return isOrderingJsonFile(name) ? "Ordering JSON" : "Menu file"; }
function cleanFileName(name: string) { return name.replace(/^[0-9]+-/, ""); }

export function MenuLibraryClient({ managerMode = false }: { managerMode?: boolean }) {
  const [accessKey, setAccessKey] = useState(managerMode ? "manager-session" : "");
  const [password, setPassword] = useState("");
  const [files, setFiles] = useState<FileMap>({});
  const [busyFolder, setBusyFolder] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const request = useCallback((location: string, kind: MenuKind, init: RequestInit = {}) => fetch("/api/menu-library/" + location + "?type=" + kind, {
    ...init,
    headers: { ...(init.headers || {}), "x-menu-library-key": accessKey },
  }), [accessKey]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const responses = await Promise.all(menuLocations.flatMap((location) => menuKinds.map(async (kind) => {
        const response = await request(location.slug, kind.id);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load the Menu Library.");
        return [folderKey(location.slug, kind.id), body.files as MenuFile[]] as const;
      })));
      setFiles(Object.fromEntries(responses));
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => {
    if (managerMode) loadAll().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load the Menu Library."));
  }, [loadAll, managerMode]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      setLoading(true);
      const responses = await Promise.all(menuLocations.flatMap((location) => menuKinds.map(async (kind) => {
        const response = await fetch("/api/menu-library/" + location.slug + "?type=" + kind.id, { headers: { "x-menu-library-key": password } });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Access denied.");
        return [folderKey(location.slug, kind.id), body.files as MenuFile[]] as const;
      })));
      setAccessKey(password);
      setFiles(Object.fromEntries(responses));
      setMessage("Menu Library ready.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open the Menu Library."); }
    finally { setLoading(false); }
  }

  async function upload(location: string, kind: MenuKind, uploadFiles: FileList | File[]) {
    if (!accessKey || !uploadFiles.length) return;
    const activeFolder = folderKey(location, kind);
    const uploads = Array.from(uploadFiles);
    const hasOrderingJson = uploads.some((file) => isOrderingJsonFile(file.name));
    setBusyFolder(activeFolder);
    setMessage("");
    try {
      for (const file of uploads) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await request(location, kind, { method: "POST", body: formData });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Upload failed.");
      }
      await loadAll();
      if (isCateringToGo(location, kind) && hasOrderingJson) setMessage("Ordering JSON uploaded. Online order form updated.");
      else setMessage(kind === "food" ? "Food menu uploaded. Previous food menu replaced." : "Drinks menu uploaded. Previous drinks menu replaced.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusyFolder(""); }
  }

  async function remove(location: string, kind: MenuKind, fileName: string) {
    if (!window.confirm("Remove this menu file? This cannot be undone.")) return;
    const activeFolder = folderKey(location, kind);
    setBusyFolder(activeFolder);
    try {
      const url = "/api/menu-library/" + location + "?type=" + kind + "&file=" + encodeURIComponent(fileName);
      const response = await fetch(url, { method: "DELETE", headers: { "x-menu-library-key": accessKey } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not remove the file.");
      await loadAll();
      setMessage("Menu file removed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove the file."); }
    finally { setBusyFolder(""); }
  }

  if (!accessKey && !managerMode) return <section className="media-login"><div><p className="eyebrow">Aviator operations</p><h1>Menu Library</h1><p>Secure drag-and-drop folders for menus and location photography.</p><form onSubmit={signIn}><label htmlFor="menu-library-key">Access key</label><input id="menu-library-key" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="button" type="submit" disabled={loading}>{loading ? "Opening..." : "Open Menu Library"}</button></form>{message && <p className="media-message" role="alert">{message}</p>}</div></section>;

  return <section className="media-library"><div className="content-wrap"><div className="media-library-heading"><div><p className="eyebrow">Aviator operations</p><h1>Menu + Photo Library</h1><p>Update each location.s menus and photography in one place. Use Set featured to choose each location.s website hero.</p></div>{!managerMode ? <button className="media-signout" type="button" onClick={() => { setAccessKey(""); setPassword(""); setFiles({}); }}>Sign out</button> : null}</div><p className="media-message" role="status">{message}</p><div className="menu-library-grid">{menuLocations.map((location) => <article className="menu-folder" key={location.slug}><div className="menu-folder-head"><span>LOCATION LIBRARY</span><h2>{location.name}</h2></div><div className="menu-folder-sections">{labelsFor(location.slug).map((kind) => {
    const activeFolder = folderKey(location.slug, kind.id);
    const currentFiles = files[activeFolder] || [];
    const showOrderingJson = isCateringToGo(location.slug, kind.id);
    return <section className="menu-folder-section" key={kind.id}><h3>{kind.label}</h3><div className="menu-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); upload(location.slug, kind.id, event.dataTransfer.files); }}><input id={"menu-upload-" + location.slug + "-" + kind.id} type="file" accept={menuUploadAccept} onChange={(event) => { if (event.currentTarget.files) upload(location.slug, kind.id, event.currentTarget.files); event.currentTarget.value = ""; }} /><label htmlFor={"menu-upload-" + location.slug + "-" + kind.id}>{busyFolder === activeFolder ? "Uploading..." : "Drop " + kind.label.toLowerCase() + " here"}</label><small>or choose a replacement file - 25 MB max</small></div>{showOrderingJson ? <div className="menu-dropzone menu-json-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); upload(location.slug, kind.id, event.dataTransfer.files); }}><input id={"menu-json-upload-" + location.slug + "-" + kind.id} type="file" accept={orderingJsonAccept} onChange={(event) => { if (event.currentTarget.files) upload(location.slug, kind.id, event.currentTarget.files); event.currentTarget.value = ""; }} /><label htmlFor={"menu-json-upload-" + location.slug + "-" + kind.id}>Upload order JSON</label><small>builds the online ordering form</small></div> : null}<ul>{currentFiles.length ? currentFiles.map((file) => <li key={file.name}><a href={file.url} target="_blank" rel="noreferrer">{cleanFileName(file.name)}</a><span>{fileRole(file.name)} - {readableSize(file.size)} - {new Date(file.updatedAt).toLocaleDateString()}</span><button type="button" onClick={() => remove(location.slug, kind.id, file.name)} disabled={busyFolder === activeFolder}>Remove</button></li>) : <li className="menu-empty">{loading ? "Loading..." : "No " + kind.label.toLowerCase() + " uploaded yet."}</li>}</ul></section>;
  })}</div>{location.slug !== "catering-events" && <WebsitePhotosLibrary accessKey={accessKey} location={{ slug: location.slug, name: location.name }} />}</article>)}</div><WebsitePhotosLibrary accessKey={accessKey} />{!managerMode ? <CouponManager accessKey={accessKey} /> : null}</div></section>;
}
