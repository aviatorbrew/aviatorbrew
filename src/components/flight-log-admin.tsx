"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";
import type { FlightLogCategory, FlightLogPost, FlightLogStatus } from "@/lib/flight-log";

type Option = { id: string; label: string };
type Options = { categories: Option[]; statuses: FlightLogStatus[]; locations: Option[]; events: Option[]; beers: Option[] };
type Props = { mode?: "list" | "new" | "edit"; postId?: string };
type SortMode = "smart" | "newest" | "oldest" | "title" | "homepage";

const flightLogCategoryLabels: Record<FlightLogCategory, string> = { live_music: "Live Music", events: "Events", beer_releases: "Beer Releases", food_specials: "Food & Specials", brewery_news: "Brewery News", questions_answers: "Questions & Answers", schedule_updates: "Schedule Updates" };
const blank: Partial<FlightLogPost> = { title: "", slug: "", excerpt: "", body: "", category: "brewery_news", imageUrl: "", locationId: "", eventId: "", beerId: "", authorName: "Aviator Crew", status: "draft", isPinned: false, isOfficial: true, showOnHomepage: false, publishedAt: "" };

function datetimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function statusLabel(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function postStamp(post: FlightLogPost) { return new Date(post.publishedAt || post.updatedAt).getTime(); }
function searchText(post: FlightLogPost) { return [post.title, post.excerpt, post.body, post.authorName, post.status, flightLogCategoryLabels[post.category]].join(" ").toLowerCase(); }
function sortPosts(posts: FlightLogPost[], sortMode: SortMode) {
  return [...posts].sort((a, b) => {
    if (sortMode === "homepage") return Number(b.showOnHomepage) - Number(a.showOnHomepage) || postStamp(b) - postStamp(a);
    if (sortMode === "newest") return postStamp(b) - postStamp(a);
    if (sortMode === "oldest") return postStamp(a) - postStamp(b);
    if (sortMode === "title") return a.title.localeCompare(b.title);
    return Number(b.isPinned) - Number(a.isPinned) || Number(b.showOnHomepage) - Number(a.showOnHomepage) || postStamp(b) - postStamp(a);
  });
}

function StatusChip({ status }: { status: FlightLogStatus }) {
  return <span className={"flight-log-status-chip is-" + status}>{statusLabel(status)}</span>;
}

function PostPreview({ post }: { post: Partial<FlightLogPost> }) {
  return <article className="flight-log-admin-preview"><p className="eyebrow">Preview - {flightLogCategoryLabels[(post.category || "brewery_news") as FlightLogCategory]}</p>{post.imageUrl ? <img src={post.imageUrl} alt="" /> : null}<h3>{post.title || "Untitled dispatch"}</h3><p>{post.excerpt || post.body || "Post excerpt will appear here."}</p><small>{post.authorName || "Aviator Crew"} - {post.isPinned ? "Pinned" : "Standard"} - {post.showOnHomepage ? "Homepage" : "Feed only"} - {statusLabel(post.status || "draft")}</small></article>;
}

export function FlightLogAdmin({ mode = "list", postId }: Props) {
  const [posts, setPosts] = useState<FlightLogPost[]>([]);
  const [options, setOptions] = useState<Options>({ categories: [], statuses: ["draft", "published", "archived"], locations: [], events: [], beers: [] });
  const [message, setMessage] = useState("Loading Flight Log...");
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<FlightLogStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("smart");
  const [draft, setDraft] = useState<Partial<FlightLogPost>>(blank);
  const [screenMode, setScreenMode] = useState<Props["mode"]>(mode);
  const [activePostId, setActivePostId] = useState(postId);
  const editingPost = useMemo(() => posts.find((post) => post.id === activePostId), [posts, activePostId]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortPosts(posts.filter((post) => (statusFilter === "all" || post.status === statusFilter) && (!needle || searchText(post).includes(needle))), sortMode);
  }, [posts, query, statusFilter, sortMode]);

  async function load() {
    const response = await fetch("/api/manager/flight-log" + (activePostId ? "?id=" + encodeURIComponent(activePostId) : ""), { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load Flight Log posts.");
    setPosts(body.posts || []);
    setOptions(body.options || options);
    setMessage("");
  }

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [activePostId]);
  useEffect(() => { if (editingPost) setDraft(editingPost); else if (screenMode === "new") setDraft(blank); }, [editingPost, screenMode]);

  function setValue(key: keyof FlightLogPost, value: string | boolean) { setDraft((current) => ({ ...current, [key]: value })); }
  function showList() { setScreenMode("list"); setActivePostId(undefined); setDraft(blank); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("Saving Flight Log post...");
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const forcedStatus = submitter?.dataset.status as FlightLogStatus | undefined;
    const form = new FormData(event.currentTarget);
    if (draft.id) form.set("id", draft.id);
    if (forcedStatus) form.set("status", forcedStatus);
    form.set("isPinned", draft.isPinned ? "true" : "false");
    form.set("showOnHomepage", draft.showOnHomepage ? "true" : "false");
    if (!form.get("authorName")) form.set("authorName", "Aviator Crew");
    try {
      const response = await fetch("/api/manager/flight-log", { method: draft.id ? "PATCH" : "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save Flight Log post.");
      setPosts(body.posts || []); setDraft(body.post || blank);
      setMessage(forcedStatus === "published" ? "Post published." : forcedStatus === "draft" ? "Post saved as draft." : "Post saved.");
      if (screenMode === "new" && body.post?.id) { setScreenMode("edit"); setActivePostId(body.post.id); window.history.replaceState(null, "", "/manager/flight-log"); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save Flight Log post."); }
    finally { setBusy(false); }
  }

  async function quickUpdate(post: FlightLogPost, patch: Partial<FlightLogPost>) {
    setBusy(true); setMessage("Updating post...");
    try {
      const response = await fetch("/api/manager/flight-log", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...post, ...patch }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update post.");
      setPosts(body.posts || []); setMessage("Post updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update post."); }
    finally { setBusy(false); }
  }

  async function archive(post: FlightLogPost) {
    if (!window.confirm("Archive this Flight Log post? It will be hidden from the public feed.")) return;
    setBusy(true); setMessage("Archiving post...");
    try {
      const response = await fetch("/api/manager/flight-log?id=" + encodeURIComponent(post.id), { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not archive post.");
      setPosts(body.posts || []); setMessage("Post archived.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not archive post."); }
    finally { setBusy(false); }
  }

  if (message === "Unauthorized") return <section className="media-login"><div><p className="eyebrow">Admin required</p><h1>Flight Log is restricted.</h1><p>Sign in through the manager portal first.</p><Link className="button" href="/manager">Open manager login</Link></div></section>;

  return <section className="manager-page-shell flight-log-admin"><div className="content-wrap">
    <header className="manager-topbar"><div><p className="eyebrow">Official dispatches</p><h1>Flight Log Admin</h1><p>Create, preview, publish, pin, unpublish, archive, and choose homepage Flight Log posts.</p></div><div><Link className="button button-outline" href="/flight-log">Public feed <ArrowUpRight /></Link><button className="button" type="button" onClick={() => { setScreenMode("new"); setActivePostId(undefined); setDraft(blank); }}>New post</button></div></header>
    <p className="media-message" role="status">{message}</p>

    {screenMode === "list" ? <>
      <div className="flight-log-admin-tools"><label>Search posts<input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Title, body, category, author" /></label><label>Sort<select value={sortMode} onChange={(event) => setSortMode(event.currentTarget.value as SortMode)}><option value="smart">Pinned + homepage + newest</option><option value="homepage">Homepage first</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A-Z</option></select></label></div>
      <div className="flight-log-admin-filters"><button type="button" className={statusFilter === "all" ? "is-active" : ""} onClick={() => setStatusFilter("all")}>All</button>{options.statuses.map((status) => <button type="button" className={statusFilter === status ? "is-active" : ""} onClick={() => setStatusFilter(status)} key={status}>{statusLabel(status)}</button>)}</div>
      <div className="flight-log-admin-list">{filtered.length ? filtered.map((post) => <article key={post.id}><div><p className="flight-log-admin-row-flags"><StatusChip status={post.status} />{post.isPinned ? <span>Pinned</span> : null}{post.showOnHomepage ? <span>Homepage</span> : null}<span>{flightLogCategoryLabels[post.category]}</span></p><h2>{post.title}</h2><p>{post.excerpt}</p><small>{post.authorName} - {post.publishedAt ? new Date(post.publishedAt).toLocaleString() : "Not published"}</small></div>{post.imageUrl ? <img src={post.imageUrl} alt="" /> : null}<footer><button type="button" onClick={() => { setScreenMode("edit"); setActivePostId(post.id); }}>Edit</button>{post.status !== "published" ? <button type="button" onClick={() => quickUpdate(post, { status: "published" })} disabled={busy}>Publish</button> : <button type="button" onClick={() => quickUpdate(post, { status: "draft" })} disabled={busy}>Unpublish</button>}<button type="button" onClick={() => quickUpdate(post, { isPinned: !post.isPinned })} disabled={busy}>{post.isPinned ? "Unpin" : "Pin"}</button><button type="button" onClick={() => quickUpdate(post, { showOnHomepage: !post.showOnHomepage })} disabled={busy || post.status !== "published"}>{post.showOnHomepage ? "Remove from homepage" : "Feature on homepage"}</button>{post.status !== "archived" ? <button type="button" onClick={() => archive(post)} disabled={busy}>Archive</button> : null}</footer></article>) : <p className="flight-log-empty">No posts match this filter.</p>}</div>
    </> : <div className="flight-log-editor-grid"><form className="flight-log-editor" onSubmit={save}><label>Title<input name="title" required maxLength={160} value={draft.title || ""} onChange={(event) => setValue("title", event.target.value)} /></label><label>Slug<input name="slug" maxLength={180} value={draft.slug || ""} onChange={(event) => setValue("slug", event.target.value)} placeholder="Generated from title when blank" /></label><label>Category<select name="category" value={draft.category || "brewery_news"} onChange={(event) => setValue("category", event.target.value)}>{options.categories.map((category) => <option value={category.id} key={category.id}>{category.label}</option>)}</select></label><label>Status<select name="status" value={draft.status || "draft"} onChange={(event) => setValue("status", event.target.value)}>{options.statuses.map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}</select></label><label>Author<input name="authorName" maxLength={120} value={draft.authorName || "Aviator Crew"} onChange={(event) => setValue("authorName", event.target.value)} /></label><label>Published date<input name="publishedAt" type="datetime-local" value={datetimeLocal(draft.publishedAt)} onChange={(event) => setValue("publishedAt", event.target.value)} /></label><label>Location data<select name="locationId" value={draft.locationId || ""} onChange={(event) => setValue("locationId", event.target.value)}><option value="">No location</option>{options.locations.map((location) => <option value={location.id} key={location.id}>{location.label}</option>)}</select></label><label>Related event data<select name="eventId" value={draft.eventId || ""} onChange={(event) => setValue("eventId", event.target.value)}><option value="">No event data</option>{options.events.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label>Related beer data<select name="beerId" value={draft.beerId || ""} onChange={(event) => setValue("beerId", event.target.value)}><option value="">No beer data</option>{options.beers.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label className="flight-log-editor-wide">Featured image URL<input name="imageUrl" value={draft.imageUrl || ""} onChange={(event) => setValue("imageUrl", event.target.value)} placeholder="Upload an image below or paste a URL" /></label><label className="flight-log-editor-wide">Upload featured image<input name="image" type="file" accept="image/png,image/jpeg,image/webp" /></label><label className="flight-log-editor-wide">Excerpt<textarea name="excerpt" maxLength={300} rows={3} value={draft.excerpt || ""} onChange={(event) => setValue("excerpt", event.target.value)} placeholder="Auto-generated from body when blank" /></label><label className="flight-log-editor-wide">Body<textarea name="body" required rows={12} value={draft.body || ""} onChange={(event) => setValue("body", event.target.value)} placeholder={"Use plain text formatting:\n# Heading\n## Subheading\n- Bullet item\nBlank line for a new paragraph"} /></label><label className="flight-log-editor-check"><input name="isPinned" type="checkbox" checked={draft.isPinned === true} onChange={(event) => setValue("isPinned", event.target.checked)} /> Pin this dispatch</label><label className="flight-log-editor-check"><input name="showOnHomepage" type="checkbox" checked={draft.showOnHomepage === true} onChange={(event) => setValue("showOnHomepage", event.target.checked)} /> Show in homepage Flight Log band</label><div className="flight-log-editor-actions"><button className="button" disabled={busy}>{busy ? "Saving..." : "Save post"}</button><button className="button button-outline" type="submit" data-status="draft" disabled={busy}>Save draft</button><button className="button button-outline" type="submit" data-status="published" disabled={busy}>Publish</button><button className="section-link" type="button" onClick={showList}>Back to posts</button></div></form><PostPreview post={draft} /></div>}
  </div></section>;
}
