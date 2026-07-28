import { DEFAULT_TOUR_MINIMUM, DEFAULT_TOUR_PRICE_CENTS, TOUR_CAPACITY } from "@/lib/tour-config";

export { DEFAULT_TOUR_MINIMUM, DEFAULT_TOUR_PRICE_CENTS, TOUR_CAPACITY, TOUR_MINIMUM } from "@/lib/tour-config";
export type TourSlot = "4:00 PM" | "6:00 PM";

export type TourSignup = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  tickets: number;
  message: string;
  tourDate: string;
  tourTime: TourSlot;
  paymentStatus?: "pending" | "paid";
  stripeSessionId?: string;
};

type TourNotification = { key: string; sentAt: string };
type TourStore = { signups: TourSignup[]; notifications: TourNotification[]; minimum: number; priceCents: number; cancelledTours: string[] };

export type TourSummary = {
  date: string;
  fourPm: { booked: number; remaining: number; confirmed: boolean };
  sixPm: { booked: number; remaining: number; confirmed: boolean };
  confirmedTours: Array<{ date: string; time: TourSlot }>;
  minimum: number;
  priceCents: number;
};

const smtpConfigured = () => process.env.MAIL_MODE === "smtp" && Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.MAIL_FROM_EMAIL);

const validMinimum = (value: unknown) => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= TOUR_CAPACITY ? Number(value) : DEFAULT_TOUR_MINIMUM;
const validPriceCents = (value: unknown) => Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 100000 ? Number(value) : DEFAULT_TOUR_PRICE_CENTS;
const runtimeNumber = (name: string) => { const raw = process.env[name]; if (raw === undefined || raw === "") return undefined; const value = Number(raw); return Number.isFinite(value) ? value : undefined; };
const configuredMinimum = () => validMinimum(runtimeNumber("TOUR_MINIMUM") ?? runtimeNumber("NEXT_PUBLIC_TOUR_MINIMUM") ?? DEFAULT_TOUR_MINIMUM);
const configuredPriceCents = () => validPriceCents(runtimeNumber("TOUR_PRICE_CENTS") ?? runtimeNumber("NEXT_PUBLIC_TOUR_PRICE_CENTS") ?? DEFAULT_TOUR_PRICE_CENTS);
const emptyStore = (): TourStore => ({ signups: [], notifications: [], minimum: configuredMinimum(), priceCents: configuredPriceCents(), cancelledTours: [] });
const dataFile = () => process.env.TOUR_DATA_FILE || "data/tour-signups.json";
const dataDirectory = (file: string) => { const index = file.lastIndexOf("/"); return index > -1 ? file.slice(0, index) || "." : "."; };
const storageUnavailable = (error: unknown) => {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT" || code === "ENOSYS" || code === "EROFS") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /not implemented|not supported|not available|unsupported|Cannot find module|readFile.*function|mkdir.*function|writeFile.*function/i.test(message);
};

async function readStore(): Promise<TourStore> {
  try {
    const { promises: fs } = await import("fs");
    const parsed = JSON.parse(await fs.readFile(dataFile(), "utf8")) as Partial<TourStore>;
    const fallback = emptyStore();
    return { signups: Array.isArray(parsed.signups) ? parsed.signups : [], notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [], minimum: parsed.minimum === undefined ? fallback.minimum : validMinimum(parsed.minimum), priceCents: parsed.priceCents === undefined ? fallback.priceCents : validPriceCents(parsed.priceCents), cancelledTours: Array.isArray(parsed.cancelledTours) ? parsed.cancelledTours.filter((key): key is string => typeof key === "string") : [] };
  } catch (error) {
    if (storageUnavailable(error)) return emptyStore();
    throw error;
  }
}

async function writeStore(store: TourStore) {
  try {
    const { promises: fs } = await import("fs");
    const file = dataFile();
    await fs.mkdir(dataDirectory(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(store, null, 2) + "\n", "utf8");
  } catch (error) {
    if (storageUnavailable(error)) throw new Error("Tour signup storage is not writable in this environment. Update hosted tour settings with TOUR_MINIMUM and TOUR_PRICE_CENTS, or configure writable storage.");
    throw error;
  }
}

function easternParts(value: Date) {
  const pieces = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const result: Record<string, number> = {};
  for (const part of pieces) if (part.type !== "literal") result[part.type] = Number(part.value);
  return { year: result.year, month: result.month, day: result.day, hour: result.hour, minute: result.minute };
}

function dateKey(year: number, month: number, day: number) {
  return [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

function addDays(key: string, days: number) {
  const [year, month, day] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return dateKey(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function tourStart(date: string, slot: TourSlot) {
  const [year, month, day] = date.split("-").map(Number);
  const hour = slot === "4:00 PM" ? 16 : 18;
  const localAsUtc = Date.UTC(year, month - 1, day, hour, 0, 0);
  const probe = new Date(localAsUtc);
  const parts = easternParts(probe);
  const observedLocalAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  return new Date(localAsUtc - (observedLocalAsUtc - probe.getTime()));
}

export function nextEligibleTourDate(now = new Date()) {
  const local = easternParts(now);
  const today = dateKey(local.year, local.month, local.day);
  const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();
  let daysUntilSaturday = (6 - weekday + 7) % 7;
  let candidate = addDays(today, daysUntilSaturday);
  if (tourStart(candidate, "4:00 PM").getTime() - now.getTime() < 24 * 60 * 60 * 1000) candidate = addDays(candidate, 7);
  return candidate;
}

function booked(signups: TourSignup[], date: string, slot: TourSlot) {
  return signups.filter((signup) => signup.tourDate === date && signup.tourTime === slot).reduce((total, signup) => total + signup.tickets, 0);
}

function pickSlot(signups: TourSignup[], tickets: number, now: Date) {
  let date = nextEligibleTourDate(now);
  for (let attempts = 0; attempts < 40; attempts += 1) {
    if (booked(signups, date, "4:00 PM") + tickets <= TOUR_CAPACITY) return { date, slot: "4:00 PM" as TourSlot };
    if (booked(signups, date, "6:00 PM") + tickets <= TOUR_CAPACITY) return { date, slot: "6:00 PM" as TourSlot };
    date = addDays(date, 7);
  }
  throw new Error("No tour capacity is currently available.");
}

function pickSlotFromDate(signups: TourSignup[], tickets: number, startDate: string) {
  let date = startDate;
  for (let attempts = 0; attempts < 40; attempts += 1) {
    if (booked(signups, date, "4:00 PM") + tickets <= TOUR_CAPACITY) return { date, slot: "4:00 PM" as TourSlot };
    if (booked(signups, date, "6:00 PM") + tickets <= TOUR_CAPACITY) return { date, slot: "6:00 PM" as TourSlot };
    date = addDays(date, 7);
  }
  throw new Error("No future tour capacity is available.");
}

function details(signups: TourSignup[], date: string, minimum: number) {
  const fourBooked = booked(signups, date, "4:00 PM");
  const sixBooked = booked(signups, date, "6:00 PM");
  return {
    date,
    fourPm: { booked: fourBooked, remaining: Math.max(TOUR_CAPACITY - fourBooked, 0), confirmed: fourBooked >= minimum },
    sixPm: { booked: sixBooked, remaining: Math.max(TOUR_CAPACITY - sixBooked, 0), confirmed: sixBooked >= minimum },
  };
}

export async function getTourSummary(now = new Date()): Promise<TourSummary> {
  const store = await readStore();
  const candidate = pickSlot(store.signups, 1, now);
  const upcomingDate = nextEligibleTourDate(now);
  const minimum = store.minimum;
  const confirmedTours = [...new Set(store.signups.map((signup) => signup.tourDate))].filter((date) => date >= upcomingDate).flatMap((date) => (["4:00 PM", "6:00 PM"] as TourSlot[]).filter((time) => !store.cancelledTours.includes(date + "|" + time) && booked(store.signups, date, time) >= minimum).map((time) => ({ date, time }))).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { ...details(store.signups, candidate.date, minimum), confirmedTours, minimum, priceCents: store.priceCents };
}

export async function createTourSignup(input: { name: string; email: string; tickets: number; message?: string }, now = new Date()) {
  const store = await readStore();
  const assignment = pickSlot(store.signups, input.tickets, now);
  const minimum = store.minimum;
  const signup: TourSignup = {
    id: "tour_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
    createdAt: now.toISOString(),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    tickets: input.tickets,
    message: input.message?.trim() || "",
    tourDate: assignment.date,
    tourTime: assignment.slot,
    paymentStatus: "pending",
  };
  store.signups.push(signup);
  await writeStore(store);
  const summary = details(store.signups, assignment.date, minimum);
  const slot = assignment.slot === "4:00 PM" ? summary.fourPm : summary.sixPm;
  return { signup, summary, currentTotal: slot.booked, qualified: slot.confirmed, minimum, priceCents: store.priceCents };
}

export function formatTourPrice(priceCents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(priceCents / 100); }

export function formatTourDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, day, 17, 0, 0)));
}

export function isTourEmailConfigured() {
  return smtpConfigured() || Boolean(process.env.TOUR_EMAIL_WEBHOOK_URL || (process.env.RESEND_API_KEY && process.env.TOUR_FROM_EMAIL));
}

type TourMail = { to: string; subject: string; text: string; html: string; category: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] || character));
}

function tourEmailHtml(input: { title: string; status: string; date: string; time: string; body: string; attendee?: string; tickets?: number; total?: number; minimum?: number; priceCents?: number }) {
  const statusOn = input.status === "TOUR IS ON";
  const total = input.total === undefined ? "" : '<tr><td style="padding:10px 0;color:#68879a;font-size:12px;text-transform:uppercase;letter-spacing:1px">Flight progress</td><td style="padding:10px 0;color:#102d46;font-weight:800;text-align:right">' + input.total + ' of ' + TOUR_CAPACITY + ' seats · ' + (input.minimum ?? DEFAULT_TOUR_MINIMUM) + ' needed to launch</td></tr>';
  const price = formatTourPrice(input.priceCents ?? DEFAULT_TOUR_PRICE_CENTS);
  const attendee = input.attendee ? '<tr><td style="padding:10px 0;color:#68879a;font-size:12px;text-transform:uppercase;letter-spacing:1px">Guest</td><td style="padding:10px 0;color:#102d46;font-weight:800;text-align:right">' + escapeHtml(input.attendee) + (input.tickets ? ' · ' + input.tickets + ' ticket(s)' : "") + '</td></tr>' : "";
  return '<!doctype html><html><body style="margin:0;background:#e7f0f4;font-family:Arial,Helvetica,sans-serif;color:#102d46"><div style="max-width:620px;margin:0 auto;padding:28px 16px"><div style="padding:22px 26px;background:#082842;color:#fff;border-bottom:5px solid #efae58"><div style="font-family:monospace;color:#efb45f;font-size:12px;letter-spacing:2px">AVIATOR BREWING COMPANY · TOUR OPERATIONS</div><h1 style="margin:12px 0 0;font-size:32px;line-height:1.05">' + escapeHtml(input.title) + '</h1></div><div style="padding:26px;background:#fff"><div style="display:inline-block;padding:8px 11px;background:' + (statusOn ? "#125779" : "#e8a94d") + ';color:' + (statusOn ? "#f4fbff" : "#102d46") + ';font-family:monospace;font-size:12px;font-weight:800;letter-spacing:1px">' + escapeHtml(input.status) + '</div><p style="margin:20px 0 14px;font-size:17px;line-height:1.55">' + escapeHtml(input.body) + '</p><table style="width:100%;border-collapse:collapse;border-top:1px solid #c9dbe5;border-bottom:1px solid #c9dbe5"><tr><td style="padding:10px 0;color:#68879a;font-size:12px;text-transform:uppercase;letter-spacing:1px">Tentative tour date</td><td style="padding:10px 0;color:#102d46;font-weight:800;text-align:right">' + escapeHtml(input.date) + '</td></tr><tr><td style="padding:10px 0;color:#68879a;font-size:12px;text-transform:uppercase;letter-spacing:1px">Tour time</td><td style="padding:10px 0;color:#102d46;font-weight:800;text-align:right">' + escapeHtml(input.time) + '</td></tr>' + attendee + total + '</table><p style="margin:20px 0 0;color:#446578;font-size:14px;line-height:1.55">Tours are approximately 30 minutes. Each ' + price + ' ticket includes an Aviator pint glass, one beer pour, and one flight of four pours.</p></div><div style="padding:16px 22px;background:#103953;color:#d4e5ed;font-size:12px;line-height:1.5">Questions? Reply to this email or contact tours@aviatorbrew.com.</div></div></body></html>';
}

async function deliverTourEmail(message: TourMail) {
  if (smtpConfigured()) {
    const { sendMail } = await import("@/lib/mail");
    return sendMail({ to: message.to, subject: message.subject, text: message.text, html: message.html, replyTo: "tours@aviatorbrew.com" });
  }
  const webhook = process.env.TOUR_EMAIL_WEBHOOK_URL;
  if (webhook) {
    const response = await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...message, replyTo: "tours@aviatorbrew.com", source: "aviatorbrew.com" }) });
    return response.ok;
  }
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.TOUR_FROM_EMAIL;
  if (resendKey && from) {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + resendKey, "content-type": "application/json" }, body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html, reply_to: "tours@aviatorbrew.com" }) });
    return response.ok;
  }
  return false;
}

export async function notifyManagerOfSignup(result: Awaited<ReturnType<typeof createTourSignup>>) {
  const { signup, currentTotal, qualified, minimum, priceCents } = result;
  const date = formatTourDate(signup.tourDate);
  const status = qualified ? "TOUR IS ON" : "TENTATIVELY SET";
  const waiting = Math.max(minimum - currentTotal, 0);
  const body = qualified ? "This flight has reached the " + minimum + "-person launch minimum and is on." : "This flight is tentatively set for " + date + " at " + signup.tourTime + " and is waiting for " + waiting + " more signup(s) to launch.";
  const text = ["New brewery tour signup", "Status: " + status, body, "Guest: " + signup.name + " (" + signup.email + ")", "Tickets: " + signup.tickets, "Flight: " + date + " at " + signup.tourTime, "Flight progress: " + currentTotal + " of " + TOUR_CAPACITY + " seats (" + minimum + " required to launch)", signup.message ? "Note: " + signup.message : ""].filter(Boolean).join("\n");
  return deliverTourEmail({ to: "tours@aviatorbrew.com", subject: "Tour " + (qualified ? "is on" : "tentatively set") + " - " + date + " at " + signup.tourTime, text, html: tourEmailHtml({ title: "New tour signup", status, date, time: signup.tourTime, body, attendee: signup.name, tickets: signup.tickets, total: currentTotal, minimum, priceCents }), category: "tour-signup" });
}

export async function notifyQualifiedTours(now = new Date()) {
  const store = await readStore();
  const minimum = store.minimum;
  const groups = new Map<string, TourSignup[]>();
  for (const signup of store.signups) { const key = signup.tourDate + "|" + signup.tourTime; groups.set(key, [...(groups.get(key) || []), signup]); }
  const notified: string[] = [];
  for (const [key, signups] of groups) {
    const [date, slot] = key.split("|") as [string, TourSlot];
    const total = signups.reduce((sum, signup) => sum + signup.tickets, 0);
    const hoursAway = (tourStart(date, slot).getTime() - now.getTime()) / 3600000;
    if (total < minimum || hoursAway < 48 || hoursAway > 120 || store.notifications.some((notification) => notification.key === key)) continue;
    const tourDate = formatTourDate(date);
    const body = "Your Aviator brewery tour is on. Your flight has met the " + minimum + "-person launch minimum.";
    const attendeeResults = await Promise.all(signups.map((signup) => deliverTourEmail({
      to: signup.email,
      subject: "Your Aviator brewery tour is on - " + tourDate,
      text: [body, "When: " + tourDate + " at " + slot, "Your registration: " + signup.tickets + " ticket(s).", "Each " + formatTourPrice(store.priceCents) + " ticket includes a pint glass, one beer pour, and one flight of four pours.", "Please arrive a few minutes early. Questions? tours@aviatorbrew.com"].join("\n"),
      html: tourEmailHtml({ title: "Your brewery tour is on!", status: "TOUR IS ON", date: tourDate, time: slot, body, attendee: signup.name, tickets: signup.tickets, total, minimum, priceCents: store.priceCents }),
      category: "tour-confirmation",
    })));
    const managerSent = await deliverTourEmail({ to: "tours@aviatorbrew.com", subject: "Tour confirmation sent - " + tourDate + " at " + slot, text: "The " + slot + " brewery tour is on with " + total + " registered guests. Confirmation was sent to " + signups.length + " signup contact(s).", html: tourEmailHtml({ title: "Tour confirmation sent", status: "TOUR IS ON", date: tourDate, time: slot, body: "Confirmation was sent to " + signups.length + " signup contact(s).", total, minimum, priceCents: store.priceCents }), category: "tour-weekly-summary" });
    if (attendeeResults.every(Boolean) && managerSent) { store.notifications.push({ key, sentAt: now.toISOString() }); notified.push(key); }
  }
  if (notified.length) await writeStore(store);
  return { notified, emailConfigured: isTourEmailConfigured() };
}

export async function notifyGuestOfSignup(result: Awaited<ReturnType<typeof createTourSignup>>) {
  const { signup, currentTotal, qualified, minimum, priceCents } = result;
  const date = formatTourDate(signup.tourDate);
  const remaining = Math.max(minimum - currentTotal, 0);
  const status = qualified ? "TOUR IS ON" : "TENTATIVELY SET";
  const body = qualified ? "Great news - your tour is on! This flight has reached the " + minimum + "-person launch minimum." : "Your tour is tentatively set for " + date + " at " + signup.tourTime + ". It is waiting for " + remaining + " more signup(s) before it is officially on.";
  const text = ["Thanks for joining the Aviator brewery tour list.", body, "Tentative flight: " + date + " at " + signup.tourTime, "Current flight total: " + currentTotal + " of " + TOUR_CAPACITY + " seats (" + minimum + " required to launch).", "Your registration: " + signup.tickets + " ticket(s).", "The tour is approximately 30 minutes. Each " + formatTourPrice(priceCents) + " ticket includes a pint glass, one beer pour, and one flight of four pours.", "Signups made within 24 hours of a Saturday are assigned to the following Saturday.", "Questions? tours@aviatorbrew.com"].join("\n");
  return deliverTourEmail({ to: signup.email, subject: qualified ? "Your Aviator brewery tour is on" : "Your Aviator tour is tentatively set", text, html: tourEmailHtml({ title: qualified ? "Your tour is on!" : "Your tour is tentatively set", status, date, time: signup.tourTime, body, attendee: signup.name, tickets: signup.tickets, total: currentTotal, minimum, priceCents }), category: "tour-signup-status" });
}

export async function getTourManagerData() {
  const store = await readStore();
  const minimum = store.minimum;
  const signups = [...store.signups].sort((a, b) => (a.tourDate + a.tourTime + a.createdAt).localeCompare(b.tourDate + b.tourTime + b.createdAt));
  const groups = new Map<string, TourSignup[]>();
  for (const signup of signups) {
    const key = signup.tourDate + "|" + signup.tourTime;
    groups.set(key, [...(groups.get(key) || []), signup]);
  }
  const scheduledTours = [...groups.entries()].filter(([key]) => !store.cancelledTours.includes(key)).map(([key, guests]) => {
    const [date, time] = key.split("|") as [string, TourSlot];
    const tickets = guests.reduce((total, guest) => total + guest.tickets, 0);
    return { date, displayDate: formatTourDate(date), time, guests: guests.length, tickets, confirmed: tickets >= minimum };
  }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { signups, scheduledTours, summary: await getTourSummary(), minimum, priceCents: store.priceCents };
}

export async function setTourSettings(input: { minimum?: number; priceCents?: number }) {
  const store = await readStore();
  if (input.minimum !== undefined) {
    if (!Number.isInteger(input.minimum) || input.minimum < 1 || input.minimum > TOUR_CAPACITY) throw new Error("Tour launch minimum must be between 1 and " + TOUR_CAPACITY + ".");
    store.minimum = input.minimum;
    store.notifications = [];
  }
  if (input.priceCents !== undefined) {
    if (!Number.isInteger(input.priceCents) || input.priceCents < 100 || input.priceCents > 100000) throw new Error("Tour ticket price must be between $1.00 and $1,000.00.");
    store.priceCents = input.priceCents;
  }
  await writeStore(store);
  return getTourManagerData();
}

export async function cancelTourAndReschedule(input: { date: string; time: TourSlot; message: string }) {
  const store = await readStore();
  const minimum = store.minimum;
  const affected = store.signups.filter((signup) => signup.tourDate === input.date && signup.tourTime === input.time);
  if (!affected.length) throw new Error("That scheduled tour could not be found.");
  const active = store.signups.filter((signup) => signup.tourDate !== input.date || signup.tourTime !== input.time);
  const startDate = addDays(input.date, 7);
  const reassigned: Array<{ signup: TourSignup; date: string; time: TourSlot }> = [];
  for (const signup of affected.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const assignment = pickSlotFromDate(active, signup.tickets, startDate);
    signup.tourDate = assignment.date;
    signup.tourTime = assignment.slot;
    signup.message = [signup.message, "Rescheduled after cancelled " + formatTourDate(input.date) + " " + input.time + " tour."].filter(Boolean).join(" ");
    active.push(signup);
    reassigned.push({ signup, date: assignment.date, time: assignment.slot });
  }
  store.signups = active;
  const cancelledKey = input.date + "|" + input.time;
  store.cancelledTours = [...new Set([...store.cancelledTours, cancelledKey])];
  store.notifications = store.notifications.filter((notification) => notification.key !== cancelledKey);
  await writeStore(store);

  const sent = await Promise.allSettled(reassigned.map(({ signup, date, time }) => {
    const newDate = formatTourDate(date);
    const body = "Your " + formatTourDate(input.date) + " at " + input.time + " brewery tour has been cancelled. " + input.message.trim() + " We have moved you to " + newDate + " at " + time + ".";
    const text = ["Aviator brewery tour update", body, "Your new tentative flight: " + newDate + " at " + time, "Your registration: " + signup.tickets + " ticket(s).", "Tours become official once the flight reaches " + minimum + " guests.", "Questions? tours@aviatorbrew.com"].join("\n");
    return deliverTourEmail({ to: signup.email, subject: "Aviator brewery tour rescheduled - " + newDate, text, html: tourEmailHtml({ title: "Your tour was rescheduled", status: "TOUR RESCHEDULED", date: newDate, time, body, attendee: signup.name, tickets: signup.tickets, minimum, priceCents: store.priceCents }), category: "tour-cancellation" });
  }));
  const notified = sent.filter((result) => result.status === "fulfilled" && result.value).length;
  const managerText = "Cancelled " + formatTourDate(input.date) + " at " + input.time + ". " + affected.length + " guest registration(s) were moved to future flights; " + notified + " guest email(s) sent.";
  await deliverTourEmail({ to: "tours@aviatorbrew.com", subject: "Tour cancelled and guests rescheduled - " + formatTourDate(input.date), text: managerText, html: tourEmailHtml({ title: "Tour cancelled and rescheduled", status: "TOUR RESCHEDULED", date: formatTourDate(input.date), time: input.time, body: managerText, total: affected.reduce((sum, guest) => sum + guest.tickets, 0), minimum, priceCents: store.priceCents }), category: "tour-cancellation-summary" });
  return { affected: affected.length, notified, managerText, ...(await getTourManagerData()) };
}

export async function removeTourSignup(id: string) {
  const store = await readStore();
  const before = store.signups.length;
  store.signups = store.signups.filter((signup) => signup.id !== id);
  if (before === store.signups.length) throw new Error("Signup not found.");
  await writeStore(store);
  return getTourManagerData();
}

/** Marks an existing tour reservation paid after Stripe signs a completed Checkout event. */
export async function markTourPaid(id: string, stripeSessionId: string) {
  const store = await readStore();
  const signup = store.signups.find((item) => item.id === id);
  if (!signup) throw new Error("Tour signup not found.");
  signup.paymentStatus = "paid";
  signup.stripeSessionId = stripeSessionId;
  await writeStore(store);
  return signup;
}
