import { promises as fs } from "fs";
import path from "path";

type Subscriber = { email: string; name?: string; phone?: string; source: string; subscribedAt: string };
type Store = { subscribers: Subscriber[] };

const file = () => process.env.NEWSLETTER_DATA_FILE || path.join(process.cwd(), "data", "newsletter-subscribers.json");

async function read(): Promise<Store> {
  try {
    const parsed = JSON.parse(await fs.readFile(file(), "utf8")) as Partial<Store>;
    return { subscribers: Array.isArray(parsed.subscribers) ? parsed.subscribers : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { subscribers: [] };
    throw error;
  }
}

export async function subscribeNewsletter(input: { email: string; name?: string; phone?: string; source: string }) {
  const store = await read();
  const email = input.email.trim().toLowerCase();
  const index = store.subscribers.findIndex((subscriber) => subscriber.email === email);
  const subscriber: Subscriber = { email, name: input.name?.trim() || undefined, phone: input.phone?.trim() || undefined, source: input.source, subscribedAt: new Date().toISOString() };
  const added = index === -1;
  if (added) store.subscribers.push(subscriber);
  else store.subscribers[index] = { ...store.subscribers[index], ...subscriber, subscribedAt: store.subscribers[index].subscribedAt };
  await fs.mkdir(path.dirname(file()), { recursive: true });
  await fs.writeFile(file(), JSON.stringify(store, null, 2) + "\n", "utf8");
  return { added, subscriber };
}
