import { promises as fs } from "fs";
import path from "path";

export type ManagedEvent = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  ticketUrl: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ManagedEventInput = Omit<ManagedEvent, "id" | "createdAt" | "updatedAt">;

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
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !location || !description) throw new Error("Add an event title, date, start time, location, and description.");
  if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) throw new Error("Use a valid end time.");
  if (ticketUrl && !/^https?:\/\//i.test(ticketUrl)) throw new Error("Ticket link must begin with http:// or https://.");
  return { title, date, startTime, endTime, location, description, ticketUrl, published: input.published === true };
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

export async function getManagedEvents() { return sorted(await readAll()); }
export async function getPublishedEvents(options: { monthsAhead?: number } = {}) {
  const today = easternDate();
  const through = typeof options.monthsAhead === "number" ? addMonths(today, options.monthsAhead) : null;
  return (await getManagedEvents()).filter((event) => event.published && event.date >= today && (!through || event.date <= through));
}

export async function createManagedEvent(input: Partial<ManagedEventInput>) {
  const event = { ...validate(input), id: "event_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } satisfies ManagedEvent;
  const events = await readAll();
  events.push(event);
  await save(events);
  return event;
}

export async function updateManagedEvent(id: string, input: Partial<ManagedEventInput>) {
  const events = await readAll();
  const index = events.findIndex((event) => event.id === id);
  if (index < 0) throw new Error("Event not found.");
  const event = { ...events[index], ...validate({ ...events[index], ...input }), updatedAt: new Date().toISOString() } satisfies ManagedEvent;
  events[index] = event;
  await save(events);
  return event;
}

export async function deleteManagedEvent(id: string) {
  const events = await readAll();
  if (!events.some((event) => event.id === id)) throw new Error("Event not found.");
  await save(events.filter((event) => event.id !== id));
}
