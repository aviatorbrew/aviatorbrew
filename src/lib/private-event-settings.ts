import { promises as fs } from "node:fs";
import path from "node:path";
import { databaseConfigured, withDatabase } from "@/lib/database";

export const DEFAULT_PRIVATE_EVENT_BOOKING_FEE_CENTS = 50000;
const SETTINGS_KEY = "private_event_settings";

type PrivateEventSettings = { bookingFeeCents: number };

function runtimeNumber(name: string) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function validPrivateEventBookingFeeCents(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 2000000 ? Number(value) : DEFAULT_PRIVATE_EVENT_BOOKING_FEE_CENTS;
}

function configuredBookingFeeCents() {
  return validPrivateEventBookingFeeCents(runtimeNumber("PRIVATE_EVENT_BOOKING_FEE_CENTS") ?? DEFAULT_PRIVATE_EVENT_BOOKING_FEE_CENTS);
}

function defaultSettings(): PrivateEventSettings {
  return { bookingFeeCents: configuredBookingFeeCents() };
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
    const parsed = JSON.parse(await fs.readFile(settingsFile(), "utf8")) as Partial<PrivateEventSettings>;
    return { bookingFeeCents: parsed.bookingFeeCents === undefined ? configuredBookingFeeCents() : validPrivateEventBookingFeeCents(parsed.bookingFeeCents) };
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
    return { bookingFeeCents: validPrivateEventBookingFeeCents((value as Partial<PrivateEventSettings>).bookingFeeCents) };
  });
}

async function writeDatabaseSettings(settings: PrivateEventSettings) {
  if (!databaseConfigured()) return false;
  await withDatabase(async (client) => {
    await client.query("INSERT INTO website.settings (key,value,description,updated_at) VALUES ($1,$2::jsonb,$3,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, description=EXCLUDED.description, updated_at=now()", [SETTINGS_KEY, JSON.stringify(settings), "Private event room booking fee settings"]);
  });
  return true;
}

export async function getPrivateEventSettings(): Promise<PrivateEventSettings> {
  const databaseSettings = await readDatabaseSettings();
  if (databaseSettings) return databaseSettings;
  return readFileSettings();
}

export async function setPrivateEventSettings(input: { bookingFeeCents: number }) {
  if (!Number.isInteger(input.bookingFeeCents) || input.bookingFeeCents < 100 || input.bookingFeeCents > 2000000) throw new Error("Room booking fee must be between $1.00 and $20,000.00.");
  const settings = { bookingFeeCents: input.bookingFeeCents };
  if (!(await writeDatabaseSettings(settings))) await writeFileSettings(settings);
  return settings;
}

export function formatPrivateEventBookingFee(bookingFeeCents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(bookingFeeCents / 100);
}
