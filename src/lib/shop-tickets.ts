export type TicketGuest = { firstName: string; lastName: string };
export type TicketGuestLists = Record<string, TicketGuest[]>;
export type TicketStock = { ticketCapacity: number; ticketSoldCount: number; ticketReservedCount: number; ticketAvailableCount: number; ticketEventStartsAt: string; ticketSalesEndAt: string; ticketDoorPriceCents?: number; published?: boolean };

export function ticketName(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`Enter ${label}.`);
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 60 || !/^[\p{L}\p{M}][\p{L}\p{M} .’'-]*$/u.test(name)) throw new Error(`Enter ${label} using letters, spaces, apostrophes or hyphens (up to 60 characters).`);
  return name;
}
export function ticketGuest(value: unknown): TicketGuest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Enter the first and last name of every ticket holder.");
  const v = value as TicketGuest;
  return { firstName: ticketName(v.firstName, "each guest’s first name"), lastName: ticketName(v.lastName, "each guest’s last name") };
}
export function ticketGuestLists(raw: unknown, items: Array<{ productId: number; quantity: number; productType: string }>): TicketGuestLists {
  const counts = new Map<number, number>();
  for (const item of items.filter(i => i.productType === "ticket")) counts.set(item.productId, (counts.get(item.productId) || 0) + item.quantity);
  if (!counts.size) return {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Provide a first and last name for every ticket holder.");
  const lists = raw as Record<string, unknown>;
  if (Object.keys(lists).length !== counts.size || Object.keys(lists).some(k => !counts.has(Number(k)) || String(Number(k)) !== k)) throw new Error("The guest list must match the ticket events in your cart.");
  return Object.fromEntries([...counts].map(([id, count]) => {
    const list = lists[id];
    if (!Array.isArray(list) || list.length !== count) throw new Error(`Enter exactly ${count} guest ${count === 1 ? "name" : "names"} for this event, one name per ticket.`);
    return [id, list.map(ticketGuest)];
  }));
}

export function ticketCutoff(stock: Pick<TicketStock, "ticketEventStartsAt" | "ticketSalesEndAt">) {
  const times = [stock.ticketSalesEndAt, stock.ticketEventStartsAt].filter(Boolean).map(v => new Date(v).getTime()).filter(Number.isFinite);
  return times.length ? Math.min(...times) : null;
}
export function ticketSalesStatus(stock: TicketStock, now = Date.now()) {
  const capacity = Math.max(0, stock.ticketCapacity), sold = Math.max(0, stock.ticketSoldCount), remaining = Math.max(0, stock.ticketAvailableCount);
  if (stock.published === false) return { kind: "unavailable", open: false, message: "Tickets are not currently available online." };
  if (sold >= capacity || capacity < 1) return { kind: "sold-out", open: false, message: "Sold out — no tickets available." };
  const cutoff = ticketCutoff(stock);
  if (cutoff !== null && cutoff <= now) return { kind: "closed", open: false, message: stock.ticketDoorPriceCents ? `Online ticket sales are closed. You must buy a ticket at the door: ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(stock.ticketDoorPriceCents / 100)}, subject to remaining capacity.` : "Online ticket sales are closed." };
  if (!remaining) return { kind: "held", open: false, message: "All remaining tickets are currently in checkout. Check back shortly." };
  const ratio = (sold + Math.max(0,stock.ticketReservedCount)) / capacity;
  return { kind: ratio >= .9 ? "almost-sold-out" : ratio >= .75 ? "going-fast" : "available", open: true, message: `${ratio >= .9 ? "Almost sold out! " : ratio >= .75 ? "Going fast! " : ""}${remaining} ${remaining === 1 ? "ticket" : "tickets"} available.` };
}
export function ticketDateTime(value: string) {
  return value ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "full", timeStyle: "short" }).format(new Date(value)) + " Eastern" : "Date to be announced";
}
