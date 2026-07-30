import { promises as fs } from "node:fs";
import path from "node:path";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { databaseConfigured, withDatabase } from "@/lib/database";

export type PrivateEventCheckoutSession = {
  id: string;
  amount_total?: number | null;
  currency?: string | null;
  client_reference_id?: string | null;
  customer_details?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
  metadata?: Record<string, string>;
  payment_intent?: string | { id?: string } | null;
};

type NotificationRecord = {
  sessionId: string;
  notifiedAt: string;
};

function notificationFile() {
  if (process.env.PRIVATE_EVENT_PAYMENTS_DATA_FILE) return process.env.PRIVATE_EVENT_PAYMENTS_DATA_FILE;
  if (process.env.BEER_OVERRIDES_DATA_FILE) return path.join(path.dirname(process.env.BEER_OVERRIDES_DATA_FILE), "private-event-payments.json");
  return path.join(process.cwd(), "data", "private-event-payments.json");
}

async function readFileNotifications(): Promise<NotificationRecord[]> {
  try {
    const value = JSON.parse(await fs.readFile(notificationFile(), "utf8")) as unknown;
    return Array.isArray(value) ? value.filter((item): item is NotificationRecord => Boolean(
      item && typeof item === "object" && typeof (item as NotificationRecord).sessionId === "string",
    )) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function recordFileNotification(sessionId: string) {
  const records = await readFileNotifications();
  if (records.some((record) => record.sessionId === sessionId)) return;
  records.unshift({ sessionId, notifiedAt: new Date().toISOString() });
  const destination = notificationFile();
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = destination + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(records.slice(0, 1000), null, 2) + "\n", "utf8");
  await fs.rename(temporary, destination);
}

async function readDatabaseNotifications(): Promise<NotificationRecord[] | null> {
  if (!databaseConfigured()) return null;
  return withDatabase(async (client) => {
    const result = await client.query("SELECT session_id, notified_at FROM website.private_event_payment_notifications ORDER BY notified_at DESC LIMIT 1000");
    return result.rows.map((row): NotificationRecord => ({ sessionId: row.session_id, notifiedAt: row.notified_at instanceof Date ? row.notified_at.toISOString() : String(row.notified_at || "") }));
  });
}
async function readNotifications(): Promise<NotificationRecord[]> {
  const fileRecords = await readFileNotifications();
  try {
    const dbRecords = await readDatabaseNotifications();
    if (!dbRecords) return fileRecords;
    const byId = new Map(fileRecords.map((record) => [record.sessionId, record]));
    for (const record of dbRecords) byId.set(record.sessionId, record);
    return [...byId.values()];
  } catch { return fileRecords; }
}
async function recordPaymentNotification(session: PrivateEventCheckoutSession) {
  if (databaseConfigured()) {
    await withDatabase(async (client) => {
      await client.query("INSERT INTO website.private_event_payment_notifications (session_id, payload, notified_at) VALUES ($1,$2::jsonb,now()) ON CONFLICT (session_id) DO UPDATE SET payload=EXCLUDED.payload, notified_at=EXCLUDED.notified_at", [session.id, JSON.stringify(session)]);
    });
    return;
  }
  await recordFileNotification(session.id);
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

export async function notifyPrivateEventPayment(session: PrivateEventCheckoutSession) {
  const records = await readNotifications();
  if (records.some((record) => record.sessionId === session.id)) return true;
  if (!isMailConfigured() && process.env.MAIL_MODE !== "record") return false;

  const details = session.customer_details;
  const amount = formatAmount(session.amount_total || 0, session.currency || "usd");
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const text = [
    "A private event room booking fee has been paid.",
    "",
    "Amount: " + amount,
    "Customer: " + (details?.name || "Not provided"),
    "Email: " + (details?.email || "Not provided"),
    "Phone: " + (details?.phone || "Not provided"),
    "Stripe Checkout Session: " + session.id,
    paymentIntent ? "Stripe Payment Intent: " + paymentIntent : "",
    session.client_reference_id ? "Reference: " + session.client_reference_id : "",
    "",
    "Payment was processed securely through Stripe Checkout on aviatorbrew.com.",
  ].filter(Boolean).join("\n");

  const delivered = await sendMail({
    to: process.env.PRIVATE_EVENT_PAYMENT_RECIPIENT_EMAIL || "events@aviatorbrew.com",
    subject: "Paid: " + amount + " private event room booking fee",
    text,
    replyTo: details?.email || undefined,
  });
  if (!delivered) return false;
  await recordPaymentNotification(session);
  return true;
}
