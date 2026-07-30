import { promises as fs } from "node:fs";
import path from "node:path";
import { databaseConfigured, withDatabase } from "@/lib/database";

export type Subscriber = {
  email: string;
  name?: string;
  phone?: string;
  source: string;
  subscribedAt: string;
  status: "pending" | "confirmed";
  confirmationExpiresAt?: string;
  confirmationSentAt?: string;
  confirmedAt?: string;
  welcomeSentAt?: string;
};

type StoredSubscriber = Omit<Subscriber, "status"> & { status?: Subscriber["status"] };
type Store = { subscribers: StoredSubscriber[] };

const file = () => process.env.NEWSLETTER_DATA_FILE || path.join(process.cwd(), "data", "newsletter-subscribers.json");
const validEmail = /^\S+@\S+\.\S+$/;

function normalize(subscriber: StoredSubscriber): Subscriber {
  return { ...subscriber, status: subscriber.status === "pending" ? "pending" : "confirmed" };
}

async function readFileStore(): Promise<{ subscribers: Subscriber[] }> {
  try {
    const parsed = JSON.parse(await fs.readFile(file(), "utf8")) as Partial<Store>;
    const subscribers = Array.isArray(parsed.subscribers) ? parsed.subscribers : [];
    return { subscribers: subscribers.map(normalize) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { subscribers: [] };
    throw error;
  }
}

async function writeFileStore(store: { subscribers: Subscriber[] }) {
  const destination = file();
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = destination + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(store, null, 2) + "\n", "utf8");
  await fs.rename(temporary, destination);
}

function iso(value: unknown) { return value instanceof Date ? value.toISOString() : String(value || ""); }
async function readDatabaseStore(): Promise<{ subscribers: Subscriber[] } | null> {
  if (!databaseConfigured()) return null;
  return withDatabase(async (client) => {
    const result = await client.query("SELECT email,name,phone,source,status,subscribed_at,confirmation_expires_at,confirmation_sent_at,confirmed_at,welcome_sent_at FROM website.newsletter_subscribers ORDER BY subscribed_at DESC");
    if (!result.rowCount) return null;
    return { subscribers: result.rows.map((row): Subscriber => ({ email: row.email, name: row.name || undefined, phone: row.phone || undefined, source: row.source, status: row.status === "pending" ? "pending" : "confirmed", subscribedAt: iso(row.subscribed_at), confirmationExpiresAt: row.confirmation_expires_at ? iso(row.confirmation_expires_at) : undefined, confirmationSentAt: row.confirmation_sent_at ? iso(row.confirmation_sent_at) : undefined, confirmedAt: row.confirmed_at ? iso(row.confirmed_at) : undefined, welcomeSentAt: row.welcome_sent_at ? iso(row.welcome_sent_at) : undefined })) };
  });
}
async function writeDatabaseStore(store: { subscribers: Subscriber[] }) {
  if (!databaseConfigured()) return false;
  await withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM website.newsletter_subscribers");
      for (const subscriber of store.subscribers) await client.query("INSERT INTO website.newsletter_subscribers (email,name,phone,source,status,subscribed_at,confirmation_expires_at,confirmation_sent_at,confirmed_at,welcome_sent_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone, source=EXCLUDED.source, status=EXCLUDED.status, subscribed_at=EXCLUDED.subscribed_at, confirmation_expires_at=EXCLUDED.confirmation_expires_at, confirmation_sent_at=EXCLUDED.confirmation_sent_at, confirmed_at=EXCLUDED.confirmed_at, welcome_sent_at=EXCLUDED.welcome_sent_at", [subscriber.email, subscriber.name || null, subscriber.phone || null, subscriber.source, subscriber.status, subscriber.subscribedAt, subscriber.confirmationExpiresAt || null, subscriber.confirmationSentAt || null, subscriber.confirmedAt || null, subscriber.welcomeSentAt || null]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  });
  return true;
}
async function read(): Promise<{ subscribers: Subscriber[] }> {
  const fileStore = await readFileStore();
  try {
    const dbStore = await readDatabaseStore();
    if (!dbStore) return fileStore;
    const subscribers = new Map(fileStore.subscribers.map((subscriber) => [subscriber.email, subscriber]));
    for (const subscriber of dbStore.subscribers) subscribers.set(subscriber.email, subscriber);
    return { subscribers: [...subscribers.values()] };
  } catch { return fileStore; }
}
async function write(store: { subscribers: Subscriber[] }) {
  if (!(await writeDatabaseStore(store))) await writeFileStore(store);
}

function cleanEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!validEmail.test(email)) throw new Error("Use a valid email address.");
  return email;
}

export async function getNewsletterSubscribers() {
  const store = await read();
  return [...store.subscribers].sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt));
}

export async function getConfirmedNewsletterSubscribers() {
  return (await getNewsletterSubscribers()).filter((subscriber) => subscriber.status === "confirmed");
}

export async function requestNewsletterSubscription(input: { email: string; name?: string; phone?: string; source: string }) {
  const store = await read();
  const email = cleanEmail(input.email);
  const index = store.subscribers.findIndex((subscriber) => subscriber.email === email);
  const existing = index === -1 ? undefined : store.subscribers[index];
  if (existing?.status === "confirmed") return { subscriber: existing, confirmationRequired: false };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const subscriber: Subscriber = {
    ...existing,
    email,
    name: input.name?.trim() || existing?.name,
    phone: input.phone?.trim() || existing?.phone,
    source: input.source,
    subscribedAt: existing?.subscribedAt || now.toISOString(),
    status: "pending",
    confirmationExpiresAt: expiresAt,
    confirmationSentAt: now.toISOString(),
  };
  if (index === -1) store.subscribers.push(subscriber);
  else store.subscribers[index] = subscriber;
  await write(store);
  return { subscriber, confirmationRequired: true };
}

export async function confirmNewsletterSubscription(emailValue: string) {
  const email = cleanEmail(emailValue);
  const store = await read();
  const index = store.subscribers.findIndex((subscriber) => subscriber.email === email);
  if (index === -1) return null;
  const current = store.subscribers[index];
  const newlyConfirmed = current.status !== "confirmed";
  const subscriber: Subscriber = {
    ...current,
    status: "confirmed",
    confirmedAt: current.confirmedAt || new Date().toISOString(),
    confirmationExpiresAt: undefined,
  };
  store.subscribers[index] = subscriber;
  await write(store);
  return { subscriber, newlyConfirmed, shouldSendWelcome: !subscriber.welcomeSentAt };
}

export async function markNewsletterWelcomeSent(emailValue: string) {
  const email = cleanEmail(emailValue);
  const store = await read();
  const index = store.subscribers.findIndex((subscriber) => subscriber.email === email);
  if (index === -1) return false;
  store.subscribers[index] = { ...store.subscribers[index], welcomeSentAt: new Date().toISOString() };
  await write(store);
  return true;
}

export async function subscribeNewsletter(input: { email: string; name?: string; phone?: string; source: string }) {
  const store = await read();
  const email = cleanEmail(input.email);
  const index = store.subscribers.findIndex((subscriber) => subscriber.email === email);
  const existing = index === -1 ? undefined : store.subscribers[index];
  const now = new Date().toISOString();
  const subscriber: Subscriber = {
    ...existing,
    email,
    name: input.name?.trim() || existing?.name,
    phone: input.phone?.trim() || existing?.phone,
    source: input.source,
    subscribedAt: existing?.subscribedAt || now,
    status: "confirmed",
    confirmedAt: existing?.confirmedAt || now,
    confirmationExpiresAt: undefined,
  };
  const added = index === -1;
  if (added) store.subscribers.push(subscriber);
  else store.subscribers[index] = subscriber;
  await write(store);
  return { added, subscriber };
}

export async function unsubscribeNewsletter(emailValue: string) {
  const email = emailValue.trim().toLowerCase();
  const store = await read();
  const found = store.subscribers.some((subscriber) => subscriber.email === email);
  if (found) await write({ subscribers: store.subscribers.filter((subscriber) => subscriber.email !== email) });
  return found;
}
