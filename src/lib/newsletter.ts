import { promises as fs } from "node:fs";
import path from "node:path";

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

async function read(): Promise<{ subscribers: Subscriber[] }> {
  try {
    const parsed = JSON.parse(await fs.readFile(file(), "utf8")) as Partial<Store>;
    const subscribers = Array.isArray(parsed.subscribers) ? parsed.subscribers : [];
    return { subscribers: subscribers.map(normalize) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { subscribers: [] };
    throw error;
  }
}

async function write(store: { subscribers: Subscriber[] }) {
  const destination = file();
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = destination + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(store, null, 2) + "\n", "utf8");
  await fs.rename(temporary, destination);
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
