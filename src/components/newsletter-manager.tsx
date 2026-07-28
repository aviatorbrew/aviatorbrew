"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Subscriber = { email: string; name?: string; phone?: string; source: string; subscribedAt: string; status: "pending" | "confirmed" };
type Campaign = { id: string; subject: string; template: string; recipients: number; sentAt: string; sections: string[] };
type Beer = { id: string; name: string; style: string; abv: string; status: string };
type Event = { id: string; title: string; date: string; startTime: string; location: string };
type Music = { id: string; title: string; performanceDate: string; startsAt: string; venueName: string; band: { name: string } };
type Location = { slug: string; name: string; address: string; comingSoon?: boolean };
type Welcome = { subject: string; heading: string; intro: string; history: string; speakeasy: string; special: string };
type NewsletterData = {
  subscribers: Subscriber[];
  confirmedCount: number;
  pendingCount: number;
  campaigns: Campaign[];
  content: { beers: Beer[]; events: Event[]; music: Music[]; locations: Location[] };
  welcome: Welcome;
  managerEmail: string;
  mailConfigured: boolean;
};
type Draft = {
  template: string;
  subject: string;
  heading: string;
  message: string;
  sections: { beers: boolean; events: boolean; music: boolean; locations: boolean };
};

const templates: { id: string; name: string; description: string; draft: Draft }[] = [
  {
    id: "weekly", name: "Weekly Flight Plan", description: "A balanced roundup of beer, events, music, and destinations.",
    draft: { template: "weekly", subject: "This week at Aviator", heading: "Your Aviator flight plan", message: "Here is what is pouring, playing, and happening around Aviator this week.", sections: { beers: true, events: true, music: true, locations: true } },
  },
  {
    id: "beer-release", name: "Beer Release", description: "Lead with a new pour and include the complete current beer list.",
    draft: { template: "beer-release", subject: "A new beer is cleared for takeoff", heading: "Meet the newest Aviator pour", message: "A fresh release has landed. Join us for the first pour and see what else is currently available.", sections: { beers: true, events: false, music: false, locations: true } },
  },
  {
    id: "weekend", name: "Weekend Events", description: "Highlight special events and live music across Aviator locations.",
    draft: { template: "weekend", subject: "Your weekend at Aviator", heading: "Make the weekend take off", message: "Live music, special events, fresh beer, and plenty of reasons to land at Aviator.", sections: { beers: false, events: true, music: true, locations: true } },
  },
];

const emptyWelcome: Welcome = { subject: "", heading: "", intro: "", history: "", speakeasy: "", special: "" };
const emptyData: NewsletterData = {
  subscribers: [], confirmedCount: 0, pendingCount: 0, campaigns: [],
  content: { beers: [], events: [], music: [], locations: [] },
  welcome: emptyWelcome, managerEmail: "", mailConfigured: false,
};

function csvValue(value: string) {
  const protectedValue = /^[=+\-@]/.test(value) ? "'" + value : value;
  return `"${protectedValue.replace(/"/g, `""`)}"`;
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(value.trim()); value = ""; }
    else if (char === "\n") { row.push(value.trim()); rows.push(row); row = []; value = ""; }
    else if (char !== "\r") value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows.filter((items) => items.some(Boolean));
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.includes(normalizeHeader(header)));
}

function extractCsvSubscribers(text: string) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const firstRowHasEmail = rows[0].some((cell) => emailPattern.test(cell));
  const hasHeader = !firstRowHasEmail || rows[0].some((cell) => ["email", "emailaddress", "eaddress", "firstname", "lastname", "fullname", "name", "customername", "contactname"].includes(normalizeHeader(cell)));
  const headers = hasHeader ? rows[0] : [];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const emailIndex = headers.length ? findColumn(headers, ["email", "emailaddress", "emailaddr", "eaddress", "contactemail", "customeremail"]) : -1;
  const nameIndex = headers.length ? findColumn(headers, ["name", "fullname", "customername", "contactname", "membername", "displayname"]) : -1;
  const firstNameIndex = headers.length ? findColumn(headers, ["first", "firstname", "fname", "givenname"]) : -1;
  const lastNameIndex = headers.length ? findColumn(headers, ["last", "lastname", "lname", "surname", "familyname"]) : -1;
  const byEmail = new Map<string, { email: string; name?: string }>();
  for (const row of dataRows) {
    const emailMatch = emailIndex >= 0 ? row[emailIndex]?.match(emailPattern) : row.join(" ").match(emailPattern);
    const email = emailMatch?.[0]?.trim().toLowerCase();
    if (!email) continue;
    const name = nameIndex >= 0 ? row[nameIndex]?.trim() : [firstNameIndex >= 0 ? row[firstNameIndex] : "", lastNameIndex >= 0 ? row[lastNameIndex] : ""].filter(Boolean).join(" ").trim();
    byEmail.set(email, { email, ...(name ? { name } : {}) });
  }
  return [...byEmail.values()];
}

export function NewsletterManager() {
  const [data, setData] = useState<NewsletterData>(emptyData);
  const [draft, setDraft] = useState<Draft>(templates[0].draft);
  const [welcome, setWelcome] = useState<Welcome>(emptyWelcome);
  const [testEmail, setTestEmail] = useState("");
  const [view, setView] = useState<"compose" | "welcome" | "list">("compose");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/manager/newsletter");
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load Flight Crew data.");
    setData(body);
    setWelcome(body.welcome);
    setTestEmail((current) => current || body.managerEmail || "");
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  const filteredSubscribers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data.subscribers;
    return data.subscribers.filter((subscriber) => `${subscriber.name || ""} ${subscriber.email} ${subscriber.source} ${subscriber.status}`.toLowerCase().includes(query));
  }, [data.subscribers, search]);

  function useTemplate(template: (typeof templates)[number]) {
    setDraft(template.draft);
    setMessage(`${template.name} template loaded.`);
  }

  function toggleSection(section: keyof Draft["sections"]) {
    setDraft((current) => ({ ...current, sections: { ...current.sections, [section]: !current.sections[section] } }));
  }

  async function post(payload: object) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/manager/newsletter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) throw new Error(body.error || "Could not process the Flight Crew request.");
    setData(body);
    if (body.welcome) setWelcome(body.welcome);
    return body;
  }

  async function send(action: "send-test" | "send-all") {
    if (action === "send-all" && !window.confirm(`Send "${draft.subject}" to ${data.confirmedCount} confirmed Flight Crew member${data.confirmedCount === 1 ? "" : "s"}?`)) return;
    try {
      const body = await post({ action, draft });
      setMessage(action === "send-test" ? `Test campaign sent to ${data.managerEmail}.` : `Campaign sent to ${body.sent} Flight Crew member${body.sent === 1 ? "" : "s"}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send the campaign.");
    }
  }

  async function saveWelcome() {
    try {
      await post({ action: "save-welcome", welcome });
      setMessage("Flight Crew welcome email saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the welcome email.");
    }
  }

  async function testWelcome() {
    try {
      await post({ action: "test-welcome", welcome, testEmail });
      setMessage(`Welcome email test sent to ${testEmail}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send the welcome email test.");
    }
  }

  async function addSubscriber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      await post({ action: "add", name: values.name, email: values.email });
      form.reset();
      setMessage("Confirmed Flight Crew member added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add the email address.");
    }
  }

  async function importSubscribers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (new FormData(form).get("csv") as File | null);
    if (!file) return setMessage("Choose a CSV file to import.");
    try {
      const subscribers = extractCsvSubscribers(await file.text());
      if (!subscribers.length) return setMessage("No valid email addresses were found in that CSV.");
      const body = await post({ action: "import", subscribers });
      form.reset();
      const result = body.importResult || { added: 0, updated: 0, skipped: 0 };
      setMessage("CSV import complete: " + result.added + " added, " + result.updated + " updated, " + result.skipped + " skipped.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import that CSV file.");
    }
  }

  async function removeSubscriber(email: string) {
    if (!window.confirm(`Remove ${email} from the Flight Crew?`)) return;
    setBusy(true);
    const response = await fetch(`/api/manager/newsletter?email=${encodeURIComponent(email)}`, { method: "DELETE" });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) return setMessage(body.error || "Could not remove the email address.");
    setData(body);
    setMessage("Email address removed from the Flight Crew.");
  }

  function exportSubscribers() {
    const header = ["Name", "Email", "Phone", "Source", "Status", "Joined"];
    const rows = data.subscribers.map((subscriber) => [subscriber.name || "", subscriber.email, subscriber.phone || "", subscriber.source, subscriber.status, subscriber.subscribedAt]);
    const csv = [header, ...rows].map((row) => row.map(csvValue).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `aviator-flight-crew-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const contentSections = [
    { key: "beers" as const, label: "Current beers", count: data.content.beers.length, items: data.content.beers.map((beer) => `${beer.name} - ${beer.style} - ${beer.abv}`) },
    { key: "events" as const, label: "Events", count: data.content.events.length, items: data.content.events.map((event) => `${event.title} - ${event.date} - ${event.location}`) },
    { key: "music" as const, label: "Live music", count: data.content.music.length, items: data.content.music.map((show) => `${show.band?.name || show.title} - ${show.performanceDate} - ${show.venueName}`) },
    { key: "locations" as const, label: "Locations", count: data.content.locations.length, items: data.content.locations.map((location) => `${location.name}${location.comingSoon ? " - Coming soon" : ""} - ${location.address}`) },
  ];

  return <section id="newsletter-manager" className="coupon-manager newsletter-manager">
    <div className="newsletter-manager-heading"><div><p className="eyebrow">Customer communications</p><h2>Flight Crew</h2><p>Manage confirmed members, customize the automatic welcome, and send campaigns built from live website content.</p></div><div className="newsletter-audience-count"><strong>{data.confirmedCount}</strong><span>confirmed members</span><small>{data.pendingCount} pending confirmation</small></div></div>
    <div className="newsletter-tabs" role="tablist" aria-label="Flight Crew workspace">
      <button type="button" role="tab" aria-selected={view === "compose"} className={view === "compose" ? "is-active" : ""} onClick={() => setView("compose")}>Campaigns</button>
      <button type="button" role="tab" aria-selected={view === "welcome"} className={view === "welcome" ? "is-active" : ""} onClick={() => setView("welcome")}>Welcome email</button>
      <button type="button" role="tab" aria-selected={view === "list"} className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}>Member list</button>
    </div>
    {message ? <p className="media-message" role="status">{message}</p> : null}

    {view === "compose" ? <div className="newsletter-compose">
      <div className="newsletter-template-picker"><h3>Choose a template</h3><div>{templates.map((template) => <button type="button" key={template.id} className={draft.template === template.id ? "is-active" : ""} onClick={() => useTemplate(template)}><strong>{template.name}</strong><span>{template.description}</span></button>)}</div></div>
      <div className="newsletter-compose-grid">
        <form className="newsletter-copy-form" onSubmit={(event) => event.preventDefault()}><h3>Email copy</h3><label>Subject<input value={draft.subject} maxLength={150} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} required /></label><label>Headline<input value={draft.heading} maxLength={120} onChange={(event) => setDraft({ ...draft, heading: event.target.value })} required /></label><label>Message<textarea value={draft.message} rows={7} maxLength={5000} onChange={(event) => setDraft({ ...draft, message: event.target.value })} required /></label></form>
        <div className="newsletter-content-selector"><h3>Live website content</h3><p>Selected sections are filled from the current beer list, events calendar, music schedule, and locations when the email is sent.</p>{contentSections.map((section) => <div className="newsletter-content-section" key={section.key}><label><input type="checkbox" checked={draft.sections[section.key]} onChange={() => toggleSection(section.key)} /><span><strong>{section.label}</strong><small>{section.count} available</small></span></label>{draft.sections[section.key] ? <ul>{section.items.length ? section.items.slice(0, 8).map((item) => <li key={item}>{item}</li>) : <li>No current items.</li>}{section.items.length > 8 ? <li>+ {section.items.length - 8} more</li> : null}</ul> : null}</div>)}</div>
      </div>
      <div className="newsletter-send-bar"><div><strong>{data.mailConfigured ? "Email delivery ready" : "Email delivery is not configured"}</strong><span>Campaign tests go to {data.managerEmail || "the configured manager address"}.</span></div><button className="button button-outline" type="button" onClick={() => send("send-test")} disabled={busy || !data.mailConfigured}>{busy ? "Working..." : "Send test"}</button><button className="button" type="button" onClick={() => send("send-all")} disabled={busy || !data.mailConfigured || !data.confirmedCount}>Send to {data.confirmedCount} member{data.confirmedCount === 1 ? "" : "s"}</button></div>
      <div className="newsletter-history"><h3>Campaign history</h3>{data.campaigns.length ? <div>{data.campaigns.map((campaign) => <article key={campaign.id}><strong>{campaign.subject}</strong><span>{new Date(campaign.sentAt).toLocaleString()} - {campaign.recipients} recipients - {campaign.sections.join(", ") || "copy only"}</span></article>)}</div> : <p>No campaigns have been sent yet.</p>}</div>
    </div> : null}

    {view === "welcome" ? <div className="newsletter-compose flight-crew-welcome-editor">
      <div className="newsletter-welcome-note"><h3>Automatic welcome</h3><p>This email is sent once, immediately after a new member confirms their address. Locations and the current music schedule are added automatically when it sends.</p></div>
      <form className="newsletter-copy-form" onSubmit={(event) => event.preventDefault()}>
        <label>Subject<input value={welcome.subject} maxLength={150} onChange={(event) => setWelcome({ ...welcome, subject: event.target.value })} /></label>
        <label>Headline<input value={welcome.heading} maxLength={120} onChange={(event) => setWelcome({ ...welcome, heading: event.target.value })} /></label>
        <label>Introduction<textarea value={welcome.intro} rows={4} maxLength={3000} onChange={(event) => setWelcome({ ...welcome, intro: event.target.value })} /></label>
        <label>Brewery history<textarea value={welcome.history} rows={6} maxLength={5000} onChange={(event) => setWelcome({ ...welcome, history: event.target.value })} /></label>
        <label>Speakeasy Liquor Lounge<textarea value={welcome.speakeasy} rows={4} maxLength={3000} onChange={(event) => setWelcome({ ...welcome, speakeasy: event.target.value })} /></label>
        <label>$10 Buffalo Trace Thursday special<textarea value={welcome.special} rows={3} maxLength={2000} onChange={(event) => setWelcome({ ...welcome, special: event.target.value })} /></label>
      </form>
      <div className="newsletter-send-bar"><label className="newsletter-test-address">Test recipient<input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} /></label><button className="button button-outline" type="button" onClick={testWelcome} disabled={busy || !data.mailConfigured}>{busy ? "Working..." : "Send welcome test"}</button><button className="button" type="button" onClick={saveWelcome} disabled={busy}>Save welcome email</button></div>
    </div> : null}

    {view === "list" ? <div className="newsletter-list">
      <form className="newsletter-add-subscriber" onSubmit={addSubscriber}><label>Member name <small>(optional)</small><input name="name" maxLength={120} /></label><label>Email address<input name="email" type="email" required /></label><button className="button" disabled={busy}>Add confirmed member</button></form>
      <form className="newsletter-import-form" onSubmit={importSubscribers}><label>Import CSV<input name="csv" type="file" accept=".csv,text/csv" required /><small>Looks for email, name, first name, and last name columns. Extra columns are ignored.</small></label><button className="button button-outline" disabled={busy}>{busy ? "Importing..." : "Import members"}</button></form>
      <div className="newsletter-list-toolbar"><label>Search Flight Crew<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, source, or status" /></label><button className="button button-outline" type="button" onClick={exportSubscribers} disabled={!data.subscribers.length}>Export CSV</button></div>
      <div className="newsletter-subscriber-table"><div className="newsletter-subscriber-head"><span>Member</span><span>Status</span><span>Source</span><span>Joined</span><span>Action</span></div>{filteredSubscribers.length ? filteredSubscribers.map((subscriber) => <div className="newsletter-subscriber-row" key={subscriber.email}><span><strong>{subscriber.name || "Flight Crew member"}</strong><a href={`mailto:${subscriber.email}`}>{subscriber.email}</a></span><span className={`flight-crew-status ${subscriber.status}`}>{subscriber.status}</span><span>{subscriber.source}</span><span>{new Date(subscriber.subscribedAt).toLocaleDateString()}</span><span><button type="button" onClick={() => removeSubscriber(subscriber.email)} disabled={busy}>Remove</button></span></div>) : <p className="newsletter-empty-list">{search ? "No Flight Crew members match this search." : "No Flight Crew members yet."}</p>}</div>
    </div> : null}
  </section>;
}
