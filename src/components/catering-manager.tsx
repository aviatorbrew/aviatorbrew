"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type InquiryKind = "catering" | "event";
type ManagedInquiry = {
  id: string; kind: InquiryKind; createdAt: string; source: string; name: string; email: string; phone: string;
  pickupDate: string; pickupTime: string; guestCount: string; eventDate: string; eventTime: string; eventType: string; location: string;
  estimatedSubtotal: string; estimatedTax: string; estimatedTotal: string; cateringMenu: string; menuScanSource: string; orderSummary: string; message: string;
};
type InquiryResponse = { inquiries?: ManagedInquiry[]; total?: number; filtered?: boolean; error?: string };

function dateTime(value: string) { return value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : ""; }
function csvValue(value: string) { return '"' + (value || "").replace(/"/g, '""') + '"'; }
function csv(inquiries: ManagedInquiry[], kind: InquiryKind) {
  const headers = kind === "catering"
    ? ["Submitted", "Name", "Email", "Phone", "Pickup Date", "Pickup Time", "Guests", "Subtotal", "Tax", "Total", "Order", "Notes"]
    : ["Submitted", "Name", "Email", "Phone", "Event Date", "Event Time", "Event Type", "Location", "Guests", "Notes"];
  const rows = inquiries.map((item) => kind === "catering"
    ? [dateTime(item.createdAt), item.name, item.email, item.phone, item.pickupDate, item.pickupTime, item.guestCount, item.estimatedSubtotal, item.estimatedTax, item.estimatedTotal, item.orderSummary, item.message]
    : [dateTime(item.createdAt), item.name, item.email, item.phone, item.eventDate, item.eventTime, item.eventType, item.location, item.guestCount, item.message]);
  return [headers, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
}

function DetailFields({ item, kind }: { item: ManagedInquiry; kind: InquiryKind }) {
  const fields = kind === "catering"
    ? [
      ["pickupDate", item.pickupDate], ["pickupTime", item.pickupTime], ["guestCount", item.guestCount],
      ["estimatedSubtotal", item.estimatedSubtotal], ["estimatedTax", item.estimatedTax], ["estimatedTotal", item.estimatedTotal],
    ]
    : [
      ["eventDate", item.eventDate], ["eventTime", item.eventTime], ["eventType", item.eventType || "Other"], ["location", item.location], ["guestCount", item.guestCount],
    ];
  return <dl className="manager-inquiry-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not set"}</dd></div>)}</dl>;
}

function InquiryManager({ kind, title, eyebrow, copy }: { kind: InquiryKind; title: string; eyebrow: string; copy: string }) {
  const [inquiries, setInquiries] = useState<ManagedInquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("Loading inquiries...");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [query, setQuery] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const marketingCount = useMemo(() => new Set(inquiries.map((item) => item.email.toLowerCase()).filter(Boolean)).size, [inquiries]);

  async function load(next: { q?: string; start?: string; end?: string } = {}) {
    setBusy(true); setMessage("Loading inquiries...");
    const q = next.q ?? query; const startDate = next.start ?? start; const endDate = next.end ?? end;
    const params = new URLSearchParams({ kind });
    if (q) params.set("q", q); if (startDate) params.set("start", startDate); if (endDate) params.set("end", endDate);
    params.set("limit", q || startDate || endDate ? "200" : "5");
    try {
      const response = await fetch("/api/manager/inquiries?" + params.toString(), { cache: "no-store" });
      const body = await response.json() as InquiryResponse;
      if (!response.ok) throw new Error(body.error || "Could not load inquiries.");
      setInquiries(body.inquiries || []); setTotal(body.total || 0);
      const shown = body.inquiries?.length || 0;
      setMessage(body.filtered ? (shown ? "Showing " + shown + " of " + (body.total || 0) + " matched records." : "No records found for that filter.") : (shown ? "Showing the last " + shown + " records. Search by date or name to review older inquiries." : "No records stored yet."));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load inquiries."); }
    finally { setBusy(false); }
  }

  useEffect(() => { load(); }, []);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); load(); }
  function clearFilters() { setQuery(""); setStart(""); setEnd(""); load({ q: "", start: "", end: "" }); }
  function exportCsv() { const blob = new Blob([csv(inquiries, kind)], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = kind === "catering" ? "aviator-catering-orders.csv" : "aviator-private-event-inquiries.csv"; link.click(); URL.revokeObjectURL(url); }

  async function deleteInquiry(item: ManagedInquiry) {
    const label = kind === "catering" ? "catering order" : "private event inquiry";
    if (!window.confirm("Delete this saved " + label + " for " + (item.name || item.email || "this customer") + "? This cannot be undone.")) return;
    setDeletingId(item.id);
    try {
      const response = await fetch("/api/manager/inquiries?kind=" + encodeURIComponent(kind) + "&id=" + encodeURIComponent(item.id), { method: "DELETE" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not delete inquiry.");
      setInquiries((current) => current.filter((record) => record.id !== item.id));
      setTotal((current) => Math.max(0, current - 1));
      if (openId === item.id) setOpenId(null);
      setMessage("Saved " + label + " deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete inquiry.");
    } finally {
      setDeletingId("");
    }
  }

  return <section id={kind === "catering" ? "catering" : "private-events"} className="coupon-manager manager-inquiries">
    <p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{copy}</p><p className="media-message" role="status">{message}</p>
    <div className="manager-catering-stats"><article><span>Total matched</span><strong>{total}</strong></article><article><span>Unique emails shown</span><strong>{marketingCount}</strong></article><article><span>Visible rows</span><strong>{inquiries.length}</strong></article></div>
    <form className="manager-catering-query" onSubmit={submit}><label>Search by name<input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Name, email, phone, item, notes" /></label><label>Start date<input type="date" value={start} onChange={(event) => setStart(event.currentTarget.value)} /></label><label>End date<input type="date" value={end} onChange={(event) => setEnd(event.currentTarget.value)} /></label><div><button className="button" disabled={busy}>{busy ? "Loading..." : "Search"}</button><button className="button button-outline" type="button" onClick={clearFilters} disabled={busy}>Last 5</button><button className="button button-outline" type="button" onClick={exportCsv} disabled={!inquiries.length}>Export CSV</button></div></form>
    <div className="manager-catering-list">{inquiries.length ? inquiries.map((item) => <article key={item.id}><header><div><strong>{item.name || "Unnamed customer"}</strong><span>{item.email}{item.phone ? " / " + item.phone : ""}</span></div><time>{dateTime(item.createdAt)}</time></header><dl>{kind === "catering" ? <><div><dt>Pickup</dt><dd>{item.pickupDate || "No date"} {item.pickupTime || ""}</dd></div><div><dt>Guests</dt><dd>{item.guestCount || "Not set"}</dd></div><div><dt>Total</dt><dd>{item.estimatedTotal || "Confirm"}</dd></div></> : <><div><dt>Event</dt><dd>{item.eventDate || "No date"} {item.eventTime || ""}</dd></div><div><dt>Type</dt><dd>{item.eventType || "Other"}</dd></div><div><dt>Guests</dt><dd>{item.guestCount || "Not set"}</dd></div></>}</dl><div className="manager-catering-actions"><button type="button" onClick={() => setOpenId(openId === item.id ? null : item.id)}>{openId === item.id ? "Hide details" : "Review details"}</button><button className="is-danger" type="button" onClick={() => deleteInquiry(item)} disabled={deletingId === item.id}>{deletingId === item.id ? "Deleting..." : "Delete"}</button></div>{openId === item.id ? <section className="manager-catering-details"><div><h3>{kind === "catering" ? "Order fields" : "Event fields"}</h3><DetailFields item={item} kind={kind} />{kind === "catering" ? <><h3>Food order</h3><pre>{item.orderSummary || "No structured order entered."}</pre></> : null}</div><div><h3>Customer notes</h3><p>{item.message || "No notes."}</p>{kind === "catering" ? <><h3>Totals</h3><p>Subtotal {item.estimatedSubtotal || "$0.00"} / Tax {item.estimatedTax || "$0.00"} / Total {item.estimatedTotal || "$0.00"}</p>{item.cateringMenu ? <p><a href={item.cateringMenu} target="_blank" rel="noreferrer">Open submitted menu source</a></p> : null}</> : null}</div></section> : null}</article>) : <p className="tour-schedule-empty">No records found.</p>}</div>
  </section>;
}

export function CateringManager() { return <InquiryManager kind="catering" eyebrow="Catering operations" title="Catering To Go orders" copy="The last 5 Catering To Go submissions are shown first. Search by date, name, email, phone, order item, or notes to review older records and export follow-up lists." />; }
export function PrivateEventsInquiryManager() { return <InquiryManager kind="event" eyebrow="Private event inquiries" title="Private event inquiry archive" copy="The last 5 private event inquiries are shown first. Search by date, name, email, phone, event type, or notes to review every stored inquiry and export marketing lists." />; }
