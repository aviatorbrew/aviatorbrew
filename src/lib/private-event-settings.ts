import { promises as fs } from "node:fs";
import path from "node:path";
import { databaseConfigured, withDatabase } from "@/lib/database";

export const DEFAULT_PRIVATE_EVENT_BOOKING_FEE_CENTS = 50000;
export const DEFAULT_PRIVATE_EVENT_AVIATOR_WAY_COPY = [
  "The Ready Room is built for rehearsal dinners, business meetings, birthdays, retirements, reunions, graduations, and private celebrations for up to 70 guests inside, with extra outside seating sometimes available when weather permits. Your event can include a full bar with 10 Aviator beers on tap, liquor, wine, sound, and a big-screen TV for presentations, slideshows, or game-day gatherings.",
  "For food, choose from Ready Room packages built around shareable appetizers, salads, entrees, and sides. Crowd favorites include Aviator Smoked Wings, Pulled Pork BBQ, Beef Brisket, Country Fried Chicken Cutlet, Bacon Wrapped Meatloaf, and Grilled Flat Iron Steak. Bar service can be set up as open bar, capped open bar, drink tickets, or guest-paid tabs.",
];
export const DEFAULT_PRIVATE_EVENT_INQUIRY_COPY = [
  "Tell us the date, time, guest count, event style, and any food or bar plans you already know. The Aviator events team will review the request and follow up with availability, package details, and next steps.",
  "The Ready Room seats up to 70 guests inside. For larger groups, extra seating may be available outside, weather permitting.",
];
const SETTINGS_KEY = "private_event_settings";

type PrivateEventSettingsInput = { bookingFeeCents?: number; aviatorWayCopy?: unknown; aviatorWayCopyText?: unknown; inquiryCopy?: unknown; inquiryCopyText?: unknown };
export type PrivateEventSettings = { bookingFeeCents: number; aviatorWayCopy: string[]; inquiryCopy: string[] };

function runtimeNumber(name: string) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function validPrivateEventBookingFeeCents(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 2000000 ? Number(value) : DEFAULT_PRIVATE_EVENT_BOOKING_FEE_CENTS;
}

function cleanCopyParagraph(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 700);
}

function validPrivateEventCopy(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return [...fallback];
  const paragraphs = value.map(cleanCopyParagraph).filter(Boolean).slice(0, 6);
  return paragraphs.length ? paragraphs : [...fallback];
}

function parsePrivateEventCopyText(value: unknown, fallback: string[]) {
  return validPrivateEventCopy(String(value || "").split(/\n{2,}/), fallback);
}

export function validPrivateEventAviatorWayCopy(value: unknown) {
  return validPrivateEventCopy(value, DEFAULT_PRIVATE_EVENT_AVIATOR_WAY_COPY);
}

export function parsePrivateEventAviatorWayCopyText(value: unknown) {
  return parsePrivateEventCopyText(value, DEFAULT_PRIVATE_EVENT_AVIATOR_WAY_COPY);
}

export function validPrivateEventInquiryCopy(value: unknown) {
  return validPrivateEventCopy(value, DEFAULT_PRIVATE_EVENT_INQUIRY_COPY);
}

export function parsePrivateEventInquiryCopyText(value: unknown) {
  return parsePrivateEventCopyText(value, DEFAULT_PRIVATE_EVENT_INQUIRY_COPY);
}

function configuredBookingFeeCents() {
  return validPrivateEventBookingFeeCents(runtimeNumber("PRIVATE_EVENT_BOOKING_FEE_CENTS") ?? DEFAULT_PRIVATE_EVENT_BOOKING_FEE_CENTS);
}

function settingsWithDefaults(value?: Partial<PrivateEventSettings>): PrivateEventSettings {
  return {
    bookingFeeCents: value?.bookingFeeCents === undefined ? configuredBookingFeeCents() : validPrivateEventBookingFeeCents(value.bookingFeeCents),
    aviatorWayCopy: value?.aviatorWayCopy === undefined ? [...DEFAULT_PRIVATE_EVENT_AVIATOR_WAY_COPY] : validPrivateEventAviatorWayCopy(value.aviatorWayCopy),
    inquiryCopy: value?.inquiryCopy === undefined ? [...DEFAULT_PRIVATE_EVENT_INQUIRY_COPY] : validPrivateEventInquiryCopy(value.inquiryCopy),
  };
}

function defaultSettings(): PrivateEventSettings {
  return settingsWithDefaults();
}

function settingsFile() {
  return process.env.PRIVATE_EVENT_SETTINGS_DATA_FILE || path.join(process.cwd(), "data", "private-event-settings.json");
}

function storageUnavailable(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT" || code === "ENOSYS" || code === "EROFS") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /not implemented|not supported|not available|unsupported|readFile.*function|mkdir.*function|writeFile.*function/i.test(message);
}

async function readFileSettings() {
  try {
    return settingsWithDefaults(JSON.parse(await fs.readFile(settingsFile(), "utf8")) as Partial<PrivateEventSettings>);
  } catch (error) {
    if (storageUnavailable(error)) return defaultSettings();
    throw error;
  }
}

async function writeFileSettings(settings: PrivateEventSettings) {
  const destination = settingsFile();
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

async function readDatabaseSettings() {
  if (!databaseConfigured()) return null;
  return withDatabase(async (client) => {
    const result = await client.query("SELECT value FROM website.settings WHERE key = $1", [SETTINGS_KEY]);
    const value = result.rows[0]?.value;
    if (!value || typeof value !== "object") return defaultSettings();
    return settingsWithDefaults(value as Partial<PrivateEventSettings>);
  });
}

async function writeDatabaseSettings(settings: PrivateEventSettings) {
  if (!databaseConfigured()) return false;
  await withDatabase(async (client) => {
    await client.query("INSERT INTO website.settings (key,value,description,updated_at) VALUES ($1,$2::jsonb,$3,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, description=EXCLUDED.description, updated_at=now()", [SETTINGS_KEY, JSON.stringify(settings), "Private event page settings"]);
  });
  return true;
}

export async function getPrivateEventSettings(): Promise<PrivateEventSettings> {
  const databaseSettings = await readDatabaseSettings();
  if (databaseSettings) return databaseSettings;
  return readFileSettings();
}

export async function setPrivateEventSettings(input: PrivateEventSettingsInput) {
  const settings = await getPrivateEventSettings();
  if (input.bookingFeeCents !== undefined) {
    if (!Number.isInteger(input.bookingFeeCents) || input.bookingFeeCents < 100 || input.bookingFeeCents > 2000000) throw new Error("Room booking fee must be between $1.00 and $20,000.00.");
    settings.bookingFeeCents = input.bookingFeeCents;
  }
  if (input.aviatorWayCopyText !== undefined) settings.aviatorWayCopy = parsePrivateEventAviatorWayCopyText(input.aviatorWayCopyText);
  else if (input.aviatorWayCopy !== undefined) settings.aviatorWayCopy = validPrivateEventAviatorWayCopy(input.aviatorWayCopy);
  if (input.inquiryCopyText !== undefined) settings.inquiryCopy = parsePrivateEventInquiryCopyText(input.inquiryCopyText);
  else if (input.inquiryCopy !== undefined) settings.inquiryCopy = validPrivateEventInquiryCopy(input.inquiryCopy);
  if (!(await writeDatabaseSettings(settings))) await writeFileSettings(settings);
  return settings;
}

export function formatPrivateEventBookingFee(bookingFeeCents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(bookingFeeCents / 100);
}
