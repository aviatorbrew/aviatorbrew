import { promises as fs } from "fs";
import path from "path";

export type RecurrenceFrequency = "none" | "daily" | "weekly" | "biweekly" | "monthly-date" | "monthly-weekday" | "yearly";

export type ManagedRecurrence = {
  frequency: RecurrenceFrequency;
  interval: number;
  weekday?: number;
  ordinal?: number;
  endDate?: string;
};

export type ManagedEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  ticketUrl: string;
  imageUrl?: string;
  galleryImages?: string[];
  published: boolean;
  recurrence?: ManagedRecurrence;
  createdAt: string;
  updatedAt: string;
};

export type ManagedEventInput = Omit<ManagedEvent, "id" | "createdAt" | "updatedAt" | "recurrence"> & {
  recurrence?: ManagedRecurrence;
  recurrenceFrequency?: string;
  recurrenceInterval?: string | number;
  recurrenceWeekday?: string | number;
  recurrenceOrdinal?: string | number;
  recurrenceEndDate?: string;
  imageUrl?: string;
  galleryImages?: string[];
  removeGalleryImages?: string[];
};

const file = () => process.env.MANAGED_EVENTS_DATA_FILE || path.join(process.cwd(), "data", "managed-events.json");

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

function validate(input: Partial<ManagedEventInput>): ManagedEventInput {
  const title = clean(input.title, 120);
  const date = clean(input.date, 10);
  const startTime = clean(input.startTime, 5);
  const endTime = clean(input.endTime, 5);
  const location = clean(input.location, 120);
  const description = clean(input.description, 1200);
  const ticketUrl = clean(input.ticketUrl, 500);
  const imageUrl = clean(input.imageUrl, 500);
  const galleryImages = Array.isArray(input.galleryImages) ? input.galleryImages.map((item) => clean(item, 500)).filter(Boolean).slice(0, 12) : [];
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !location || !description) throw new Error("Add an event title, date, start time, location, and description.");
  if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) throw new Error("Use a valid end time.");
  if (ticketUrl && !/^https?:\/\//i.test(ticketUrl)) throw new Error("Ticket link must begin with http:// or https://.");
  const rawFrequency = input.recurrence?.frequency || clean(input.recurrenceFrequency, 30) || "none";
  const allowedFrequencies: RecurrenceFrequency[] = ["none", "daily", "weekly", "biweekly", "monthly-date", "monthly-weekday", "yearly"];
  if (!allowedFrequencies.includes(rawFrequency as RecurrenceFrequency)) throw new Error("Choose a valid recurrence pattern.");
  const frequency = rawFrequency as RecurrenceFrequency;
  const interval = Math.max(1, Math.min(12, Number(input.recurrence?.interval ?? input.recurrenceInterval ?? 1) || 1));
  const weekday = Number(input.recurrence?.weekday ?? input.recurrenceWeekday);
  const ordinal = Number(input.recurrence?.ordinal ?? input.recurrenceOrdinal);
  const endDate = clean(input.recurrence?.endDate ?? input.recurrenceEndDate, 10);
  if (endDate && endDate.length !== 10) throw new Error("Use a valid recurrence end date.");
  if (frequency === "monthly-weekday" && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || ![1, 2, 3, 4, 5, -1].includes(ordinal))) throw new Error("Choose a weekday and occurrence for monthly recurrence.");
  const recurrence = frequency === "none" ? undefined : { frequency, interval, ...(frequency === "monthly-weekday" ? { weekday, ordinal } : {}), ...(endDate ? { endDate } : {}) };
  return { title, date, startTime, endTime, location, description, ticketUrl, ...(imageUrl ? { imageUrl } : {}), ...(galleryImages.length ? { galleryImages } : {}), published: input.published === true, ...(recurrence ? { recurrence } : {}) };
}

async function readAll(): Promise<ManagedEvent[]> {
  try {
    const stored = JSON.parse(await fs.readFile(file(), "utf8")) as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.filter((event): event is ManagedEvent => Boolean(event && typeof event === "object" && typeof (event as ManagedEvent).id === "string"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function save(events: ManagedEvent[]) {
  await fs.mkdir(path.dirname(file()), { recursive: true });
  const temp = file() + ".tmp";
  await fs.writeFile(temp, JSON.stringify(events, null, 2) + "\n", "utf8");
  await fs.rename(temp, file());
}

function sorted(events: ManagedEvent[]) { return [...events].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)); }

function uniqueImages(images: string[]) {
  return [...new Set(images.map((image) => clean(image, 500)).filter(Boolean))].slice(0, 12);
}

function normalizeEventImages(event: ManagedEvent) {
  const galleryImages = uniqueImages([...(event.imageUrl ? [event.imageUrl] : []), ...(event.galleryImages || [])]);
  return { ...event, imageUrl: event.imageUrl || galleryImages[0], ...(galleryImages.length ? { galleryImages } : { galleryImages: undefined }) };
}

function easternDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function addMonths(date: string, months: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1 + months, day));
  return value.toISOString().slice(0, 10);
}

function dayDiff(from: string, to: string) { return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000); }

function monthDifference(from: string, to: string) { const [fy, fm] = from.split("-").map(Number); const [ty, tm] = to.split("-").map(Number); return (ty - fy) * 12 + tm - fm; }

function nthWeekdayDate(year: number, month: number, weekday: number, ordinal: number) {
  if (ordinal === -1) { const last = new Date(Date.UTC(year, month, 0)); const offset = (last.getUTCDay() - weekday + 7) % 7; return new Date(Date.UTC(year, month - 1, last.getUTCDate() - offset)).toISOString().slice(0, 10); }
  const first = new Date(Date.UTC(year, month - 1, 1)); const offset = (weekday - first.getUTCDay() + 7) % 7; const day = 1 + offset + (ordinal - 1) * 7;
  const value = new Date(Date.UTC(year, month - 1, day)); return value.getUTCMonth() === month - 1 ? value.toISOString().slice(0, 10) : null;
}

function expandEvent(event: ManagedEvent, through: string) {
  const recurrence = event.recurrence;
  if (!recurrence || recurrence.frequency === "none") return [event];
  const results: ManagedEvent[] = [];
  const start = event.date; const limit = recurrence.endDate && recurrence.endDate < through ? recurrence.endDate : through;
  for (let offset = 0; offset <= dayDiff(start, limit); offset += 1) {
    const value = new Date(Date.parse(start + "T00:00:00Z") + offset * 86400000); const date = value.toISOString().slice(0, 10);
    const days = offset; const months = monthDifference(start, date); let matches = false;
    if (recurrence.frequency === "daily") matches = days % recurrence.interval === 0;
    if (recurrence.frequency === "weekly" || recurrence.frequency === "biweekly") matches = value.getUTCDay() === new Date(Date.parse(start + "T00:00:00Z")).getUTCDay() && Math.floor(days / 7) % (recurrence.frequency === "biweekly" ? 2 : recurrence.interval) === 0;
    if (recurrence.frequency === "monthly-date") matches = date.slice(8) === start.slice(8) && months >= 0 && months % recurrence.interval === 0;
    if (recurrence.frequency === "monthly-weekday") matches = months >= 0 && months % recurrence.interval === 0 && date === nthWeekdayDate(value.getUTCFullYear(), value.getUTCMonth() + 1, recurrence.weekday ?? 0, recurrence.ordinal ?? 1);
    if (recurrence.frequency === "yearly") matches = date.slice(5) === start.slice(5) && months >= 0 && months % (12 * recurrence.interval) === 0;
    if (matches) results.push({ ...event, id: event.id + "_" + date, date });
  }
  return results;
}

export async function getManagedEvents() { return sorted((await readAll()).map(normalizeEventImages)); }
export async function getPublishedEvents(options: { monthsAhead?: number } = {}) {
  const today = easternDate();
  const through = addMonths(today, typeof options.monthsAhead === "number" ? options.monthsAhead : 12);
  return sorted((await getManagedEvents())
    .filter((event) => event.published)
    .flatMap((event) => expandEvent(event, through))
    .filter((event) => event.date >= today && event.date <= through));
}

export async function createManagedEvent(input: Partial<ManagedEventInput>) {
  const validated = validate(input);
  const galleryImages = uniqueImages([...(validated.imageUrl ? [validated.imageUrl] : []), ...(validated.galleryImages || [])]);
  const event = { ...validated, imageUrl: validated.imageUrl || galleryImages[0], ...(galleryImages.length ? { galleryImages } : {}), id: "event_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } satisfies ManagedEvent;
  const events = await readAll();
  events.push(event);
  await save(events);
  return event;
}

export async function updateManagedEvent(id: string, input: Partial<ManagedEventInput>) {
  const events = await readAll();
  const index = events.findIndex((event) => event.id === id);
  if (index < 0) throw new Error("Event not found.");
  const existing = normalizeEventImages(events[index]);
  const removeImages = new Set(Array.isArray(input.removeGalleryImages) ? input.removeGalleryImages.map((image) => clean(image, 500)).filter(Boolean) : []);
  const appendedImages = Array.isArray(input.galleryImages) ? input.galleryImages.map((image) => clean(image, 500)).filter(Boolean) : [];
  const mergedGallery = uniqueImages([...(existing.galleryImages || []), ...appendedImages]).filter((image) => !removeImages.has(image));
  const nextImageUrl = removeImages.has(existing.imageUrl || "") ? mergedGallery[0] : existing.imageUrl || mergedGallery[0];
  const validated = validate({ ...existing, ...input, imageUrl: nextImageUrl, galleryImages: mergedGallery });
  const event = { ...existing, ...validated, imageUrl: validated.imageUrl, galleryImages: validated.galleryImages, updatedAt: new Date().toISOString() } satisfies ManagedEvent;
  events[index] = event;
  await save(events);
  return event;
}

export async function deleteManagedEvent(id: string) {
  const events = await readAll();
  if (!events.some((event) => event.id === id)) throw new Error("Event not found.");
  await save(events.filter((event) => event.id !== id));
}
