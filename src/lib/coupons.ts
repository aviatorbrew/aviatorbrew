import { promises as fs } from "fs";
import path from "path";

export type CouponOffer = { id: string; title: string; description: string; terms: string; code: string; expiresAt: string; createdAt: string; limit: number; issued?: number; redeemed?: number };
export type CouponClaim = { token: string; offerId: string; claimedAt: string; expiresAt: string; redeemedAt?: string };
export type CouponBlackout = { date: string; label: string };
type CouponStore = { offers: CouponOffer[]; claims: CouponClaim[]; blackouts: CouponBlackout[] };

const file = () => process.env.COUPON_DATA_FILE || path.join(process.cwd(), "data", "coupons.json");
const empty = (): CouponStore => ({ offers: [], claims: [], blackouts: [] });

async function readStore(): Promise<CouponStore> {
  try {
    const data = JSON.parse(await fs.readFile(file(), "utf8")) as Partial<CouponStore>;
    return { offers: Array.isArray(data.offers) ? data.offers : [], claims: Array.isArray(data.claims) ? data.claims : [], blackouts: Array.isArray(data.blackouts) ? data.blackouts : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw error;
  }
}

async function writeStore(store: CouponStore) {
  await fs.mkdir(path.dirname(file()), { recursive: true });
  await fs.writeFile(file(), JSON.stringify(store, null, 2) + "\n", "utf8");
}

function easternDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const value: Record<string, string> = {};
  for (const part of parts) if (part.type !== "literal") value[part.type] = part.value;
  return { date: value.year + "-" + value.month + "-" + value.day, weekday: value.weekday };
}

function specialEventDates() {
  return (process.env.COUPON_SPECIAL_EVENT_DATES || "").split(",").map((value) => value.trim()).filter(Boolean);
}

export async function couponAvailability(now = new Date()) {
  const current = easternDate(now);
  const store = await readStore();
  if (current.weekday === "Fri" || current.weekday === "Sat") return { allowed: false, reason: "Coupons are not valid on Fridays or Saturdays." };
  if (store.blackouts.some((item) => item.date === current.date) || specialEventDates().includes(current.date)) return { allowed: false, reason: "Coupons are not valid during special events." };
  return { allowed: true, reason: "" };
}

export async function getCouponOffers() {
  const store = await readStore();
  const today = easternDate().date;
  return store.offers.filter((offer) => offer.expiresAt >= today && store.claims.filter((claim) => claim.offerId === offer.id).length < (offer.limit || 1)).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

export async function getCouponManagerData() {
  const store = await readStore();
  const offers = store.offers.map((offer) => { const claims = store.claims.filter((claim) => claim.offerId === offer.id); return { ...offer, issued: claims.length, redeemed: claims.filter((claim) => Boolean(claim.redeemedAt)).length }; }).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  return { offers, blackouts: store.blackouts.sort((a, b) => a.date.localeCompare(b.date)) };
}

function clean(value: string, limit: number) { return value.trim().slice(0, limit); }
function identifier(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48); }

export async function addCouponOffer(input: { title: string; description: string; terms: string; code: string; expiresAt: string; limit: string }) {
  const title = clean(input.title, 80);
  const description = clean(input.description, 260);
  const terms = clean(input.terms, 280);
  const code = clean(input.code, 24).toUpperCase() || identifier(title).toUpperCase();
  const expiresAt = clean(input.expiresAt, 10);
  const limit = Math.floor(Number(input.limit));
  if (title.length < 3 || description.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) || !Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error("Provide a title, description, expiration date, and coupon limit.");
  const store = await readStore();
  const offer: CouponOffer = { id: "offer_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7), title, description, terms, code, expiresAt, createdAt: new Date().toISOString(), limit };
  store.offers.push(offer);
  await writeStore(store);
  return offer;
}

export async function addCouponBlackout(input: { date: string; label: string }) {
  const date = clean(input.date, 10);
  const label = clean(input.label, 100);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !label) throw new Error("Provide a special-event date and label.");
  const store = await readStore();
  if (!store.blackouts.some((item) => item.date === date)) store.blackouts.push({ date, label });
  await writeStore(store);
}

export async function removeCoupon(type: "offer" | "blackout", id: string) {
  const store = await readStore();
  if (type === "offer") {
    store.offers = store.offers.filter((offer) => offer.id !== id);
    store.claims = store.claims.filter((claim) => claim.offerId !== id);
  } else store.blackouts = store.blackouts.filter((blackout) => blackout.date !== id);
  await writeStore(store);
}

export async function claimCoupon(offerId: string) {
  const available = await couponAvailability();
  if (!available.allowed) throw new Error(available.reason);
  const store = await readStore();
  const offer = store.offers.find((item) => item.id === offerId);
  if (!offer || offer.expiresAt < easternDate().date || store.claims.filter((claim) => claim.offerId === offer.id).length >= (offer.limit || 1)) throw new Error("That coupon is no longer available.");
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const claim: CouponClaim = { token, offerId, claimedAt: new Date().toISOString(), expiresAt: offer.expiresAt };
  store.claims.push(claim);
  await writeStore(store);
  return { claim, offer };
}

export async function couponForToken(token: string) {
  const store = await readStore();
  const claim = store.claims.find((item) => item.token === token);
  if (!claim) return null;
  const offer = store.offers.find((item) => item.id === claim.offerId);
  return offer ? { claim, offer } : null;
}

export async function redeemCoupon(token: string) {
  const coupon = await couponForToken(token);
  if (!coupon) return { ok: false, error: "Coupon not found." };
  const available = await couponAvailability();
  if (!available.allowed) return { ok: false, error: available.reason };
  if (coupon.claim.expiresAt < easternDate().date) return { ok: false, error: "This coupon has expired." };
  if (coupon.claim.redeemedAt) return { ok: false, error: "This coupon was already redeemed." };
  const store = await readStore();
  const claim = store.claims.find((item) => item.token === token);
  if (!claim) return { ok: false, error: "Coupon not found." };
  claim.redeemedAt = new Date().toISOString();
  await writeStore(store);
  return { ok: true, offer: coupon.offer, redeemedAt: claim.redeemedAt };
}
