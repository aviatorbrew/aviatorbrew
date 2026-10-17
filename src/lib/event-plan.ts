export const eventStatuses = ["Draft", "Tentative", "Confirmed", "Completed", "Cancelled"] as const;
export const itemCategories = ["Food", "Drinks", "Room", "Other"] as const;
export type EventOrderItem = { id: string; category: typeof itemCategories[number]; name: string; quantity: number; unitPriceCents: number; taxable: boolean; notes: string };
export type EventPlanDetails = {
  title: string; contactName: string; contactEmail: string; phone: string; guestEmails: string[];
  date: string; startTime: string; endTime: string; location: string; guestCount: number;
  status: typeof eventStatuses[number]; setupTime: string; foodTime: string; lastCall: string;
  items: EventOrderItem[]; taxRateBps: number; paidCents: number; barDetails: string; notes: string; internalNotes: string;
};
export type EventPlan = { id: string; version: number; createdAt: string; updatedAt: string; sourceInquiryId: string | null; details: EventPlanDetails };
export function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
export function eventTotals(plan: EventPlanDetails) {
  const subtotal = plan.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const taxable = plan.items.filter((item) => item.taxable).reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const tax = Math.round(taxable * plan.taxRateBps / 10000);
  return { subtotal, tax, total: subtotal + tax, paid: plan.paidCents, balance: subtotal + tax - plan.paidCents };
}
export function emptyEventPlan(roomFeeCents = 0): EventPlanDetails {
  return { title: "", contactName: "", contactEmail: "", phone: "", guestEmails: [], date: "", startTime: "", endTime: "", location: "Ready Room · 688 Brewing Drive, Fuquay-Varina", guestCount: 0, status: "Draft", setupTime: "", foodTime: "", lastCall: "", items: roomFeeCents ? [{ id: "room-fee", category: "Room", name: "Room booking fee", quantity: 1, unitPriceCents: roomFeeCents, taxable: false, notes: "" }] : [], taxRateBps: 0, paidCents: 0, barDetails: "", notes: "", internalNotes: "" };
}
export function eventDateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
}
export function timeLabel(time: string) {
  if (!time) return "Not set";
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
export function parseEventPlan(value: unknown): EventPlanDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provide event details.");
  const input = value as Record<string, unknown>;
  const text = (key: string, max: number, required = false) => {
    const result = typeof input[key] === "string" ? (input[key] as string).trim() : "";
    if ((required && !result) || result.length > max) throw new Error(`Check ${key} (maximum ${max} characters).`);
    return result;
  };
  const integer = (key: string, max: number) => {
    const n = input[key];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > max) throw new Error(`Check ${key}.`);
    return n;
  };
  const date = text("date", 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Choose a valid event date.");
  const time = (key: string) => { const s = text(key, 5); if (s && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new Error(`Check ${key}.`); return s; };
  const startTime = time("startTime"), endTime = time("endTime");
  if (endTime && (!startTime || endTime === startTime)) throw new Error("Choose different start and end times.");
  const emailPattern = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
  const contactEmail = text("contactEmail", 254).toLowerCase();
  if (contactEmail && !emailPattern.test(contactEmail)) throw new Error("Enter a valid contact email.");
  if (!Array.isArray(input.guestEmails) || input.guestEmails.length > 20) throw new Error("Use up to 20 additional guest emails.");
  const guestEmails = [...new Set(input.guestEmails.map((email) => {
    if (typeof email !== "string" || email.length > 254 || !emailPattern.test(email.trim())) throw new Error("Check the guest email addresses.");
    return email.trim().toLowerCase();
  }))];
  if (!eventStatuses.includes(input.status as EventPlanDetails["status"])) throw new Error("Choose an event status.");
  if (!Array.isArray(input.items) || input.items.length > 100) throw new Error("Use up to 100 order rows.");
  const items: EventOrderItem[] = input.items.map((row) => {
    if (!row || typeof row !== "object") throw new Error("Check the order rows.");
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id || r.id.length > 100 || typeof r.name !== "string" || !r.name.trim() || r.name.length > 200 || !itemCategories.includes(r.category as EventOrderItem["category"]) || typeof r.quantity !== "number" || !Number.isInteger(r.quantity) || r.quantity < 1 || r.quantity > 10000 || typeof r.unitPriceCents !== "number" || !Number.isInteger(r.unitPriceCents) || r.unitPriceCents < 0 || r.unitPriceCents > 10000000 || typeof r.taxable !== "boolean" || typeof r.notes !== "string" || r.notes.length > 1000) throw new Error("Each order row needs an item, a whole-number quantity, and a valid price.");
    return { id: r.id, name: r.name.trim(), category: r.category as EventOrderItem["category"], quantity: r.quantity, unitPriceCents: r.unitPriceCents, taxable: r.taxable, notes: r.notes.trim() };
  });
  if (new Set(items.map((r) => r.id)).size !== items.length) throw new Error("Order rows must have distinct IDs.");
  return { title: text("title", 200, true), contactName: text("contactName", 200), contactEmail, phone: text("phone", 100), guestEmails, date, startTime, endTime, location: text("location", 300, true), guestCount: integer("guestCount", 10000), status: input.status as EventPlanDetails["status"], setupTime: time("setupTime"), foodTime: time("foodTime"), lastCall: time("lastCall"), items, taxRateBps: integer("taxRateBps", 10000), paidCents: integer("paidCents", 1000000000), barDetails: text("barDetails", 5000), notes: text("notes", 5000), internalNotes: text("internalNotes", 5000) };
}
