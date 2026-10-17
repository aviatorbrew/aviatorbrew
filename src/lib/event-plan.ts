export const eventStatuses = ["Draft", "Tentative", "Confirmed", "Completed", "Cancelled"] as const;
export const itemCategories = ["Food", "Drinks", "Room", "Other"] as const;
export type EventOrderItem = { id: string; category: typeof itemCategories[number]; name: string; quantity: number; unitPriceCents: number; taxable: boolean; notes: string };
export const readyRoomPackages = [
  { id: "social", name: "The Brewery Social", priceCents: 3200, appetizers: 2, entrees: 2, sides: 2, salads: 0 },
  { id: "feast", name: "The Aviator Feast", priceCents: 3800, appetizers: 3, entrees: 2, sides: 2, salads: 1 },
  { id: "dinner", name: "The Ready Room Dinner", priceCents: 4400, appetizers: 3, entrees: 2, sides: 2, salads: 1 },
] as const;
export const readyRoomMenu = {
  appetizers: ["Hush Puppies", "Loaded Tots", "Chips & Salsa", "Aviator Chicken Tenders with Aviator Sauce", "Caprese Skewers", "Brisket Crostini", "Shrimp Cocktail"],
  entrees: ["Aviator Pizzeria Pizza Bar", "Aviator Pulled Pork BBQ", "Country Fried Chicken Cutlet", "Bacon-Wrapped Meatloaf", "Aviator Chicken Tenders", "Aviator Smoked Wings", "Aviator Beef Brisket", "Grilled Flat Iron Steak with Collard Green Chimichurri"],
  premiumEntrees: ["Grilled Flat Iron Steak with Collard Green Chimichurri", "Aviator Beef Brisket", "Herb-Roasted Chicken", "Bourbon-Glazed Chicken", "Country Fried Chicken Cutlet", "Aviator Pulled Pork BBQ", "Aviator Pizzeria Pizza Bar"],
  sides: ["Mac & Cheese", "Collard Greens", "Broccoli Salad", "Tomato Cucumber Salad", "Potato Salad", "French Fries", "Tater Tots"],
  salads: ["Caesar Salad", "Greek Salad", "Spinach Caprese Salad", "Chicken Cobb Salad"],
  pizzas: ["Just the Cheese", "Ultimate Pepperoni", "The Aviator", "Veggie", "MadBeach", "Hot Honey", "Buffalo", "Caprese", "Crash & Burn", "Meat-a-Palooza", "MadBeach Heat", "BBQ Chicken"],
  av: ["Big-screen setup", "House sound system", "Microphone"],
};
export type FlightPlan = {
  packageId: string; appetizers: string[]; entrees: string[]; sides: string[]; salads: string[]; pizzas: string[];
  extraAppetizers: string[]; extraEntrees: string[]; extraHours: number; dessert: boolean; coffee: boolean; pizzaExtra: boolean;
  glutenFreeCount: number; pizzaTime: string; pizzaNotes: string; wingSauce: string; dietaryNeeds: string; foodNotes: string;
  eventType: string; organization: string; billingName: string; billingAddress: string; appetizerTime: string; outsideSeating: string;
  barMode: string; barCapCents: number; ticketCount: number; barContact: string;
  decorContact: string; decorPhone: string; decorCompany: string; decorNotes: string; av: string[];
};
export function emptyFlightPlan(): FlightPlan {
  return { packageId: "", appetizers: [], entrees: [], sides: [], salads: [], pizzas: [], extraAppetizers: [], extraEntrees: [], extraHours: 0, dessert: false, coffee: false, pizzaExtra: false, glutenFreeCount: 0, pizzaTime: "", pizzaNotes: "", wingSauce: "", dietaryNeeds: "", foodNotes: "", eventType: "", organization: "", billingName: "", billingAddress: "", appetizerTime: "", outsideSeating: "", barMode: "", barCapCents: 0, ticketCount: 0, barContact: "", decorContact: "", decorPhone: "", decorCompany: "", decorNotes: "", av: [] };
}
export function changeEventPackage(plan: FlightPlan, packageId: string): FlightPlan {
  const pkg = readyRoomPackages.find(p => p.id === packageId);
  const entrees = packageId === "dinner" ? readyRoomMenu.premiumEntrees : readyRoomMenu.entrees;
  return { ...plan, packageId, appetizers: plan.appetizers.filter(Boolean).slice(0, pkg?.appetizers || 0), entrees: plan.entrees.filter(v => entrees.includes(v)).slice(0, pkg?.entrees || 0), sides: plan.sides.filter(Boolean).slice(0, pkg?.sides || 0), salads: plan.salads.filter(Boolean).slice(0, pkg?.salads || 0) };
}
export type EventPlanDetails = {
  title: string; contactName: string; contactEmail: string; phone: string; guestEmails: string[];
  date: string; startTime: string; endTime: string; location: string; guestCount: number;
  status: typeof eventStatuses[number]; setupTime: string; foodTime: string; lastCall: string;
  items: EventOrderItem[]; taxRateBps: number; paidCents: number; barDetails: string; notes: string; internalNotes: string;
  flightPlan?: FlightPlan | null; pfbTaxRateBps?: number; reservationDepositCents?: number;
};
export type EventPlan = { id: string; version: number; createdAt: string; updatedAt: string; sourceInquiryId: string | null; details: EventPlanDetails };
export function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
export function eventOrderItems(plan: EventPlanDetails): EventOrderItem[] {
  const f = plan.flightPlan, pkg = readyRoomPackages.find(p => p.id === f?.packageId);
  if (!f || !pkg) return plan.items;
  const rows: EventOrderItem[] = [];
  const add = (id: string, name: string, quantity: number, price: number, category: EventOrderItem["category"] = "Food") => { if (quantity) rows.push({ id: `package-${id}`, name, quantity, unitPriceCents: price, taxable: true, category, notes: "" }); };
  add("base", pkg.name + " / guest", plan.guestCount, pkg.priceCents);
  for (const [i, name] of f.extraAppetizers.entries()) add(`app-${i}`, `Additional appetizer: ${name}`, plan.guestCount, 500);
  for (const [i, name] of f.extraEntrees.entries()) add(`entree-${i}`, `Additional entree: ${name}`, plan.guestCount, 800);
  if (f.pizzaExtra) add("pizza", "Additional Pizza Bar entree", plan.guestCount, 800);
  if (f.dessert) add("dessert", "Dessert display", plan.guestCount, 600);
  if (f.coffee) add("coffee", "Coffee service", plan.guestCount, 300);
  add("hours", "Additional event hour", f.extraHours, 10000, "Room");
  return [...rows, ...plan.items];
}
function appetizerSelections(selections: string[]) {
  return [...new Set(selections)].map(name => { const count = selections.filter(value => value === name).length; return count > 1 ? `${name} × ${count}` : name; }).join(", ");
}
export function flightPlanSelections(plan: EventPlanDetails): [string, string][] {
  const f = plan.flightPlan;
  if (!f) return [];
  const pkg = readyRoomPackages.find(p => p.id === f.packageId);
  return [
    ["Package", pkg ? `${pkg.name} · ${money(pkg.priceCents)} / guest` : ""],
    ["Appetizers", appetizerSelections(f.appetizers)], ["Entrees", f.entrees.join(", ")], ["Sides", f.sides.join(", ")], ["Salad", f.salads.join(", ")],
    ["Extra appetizers", appetizerSelections(f.extraAppetizers)], ["Extra entrees", f.extraEntrees.join(", ")],
    ["Pizza styles", f.pizzas.join(", ")], ["Pizza service", f.pizzaTime ? timeLabel(f.pizzaTime) : ""], ["Gluten-free pizzas", f.glutenFreeCount ? String(f.glutenFreeCount) : ""], ["Pizza notes", f.pizzaNotes], ["Wing sauce", f.wingSauce], ["Dietary needs", f.dietaryNeeds], ["Food notes", f.foodNotes],
  ].filter(([, value]) => Boolean(value)) as [string, string][];
}
export function eventTotals(plan: EventPlanDetails) {
  const items = eventOrderItems(plan);
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const taxable = items.filter((item) => item.taxable).reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  const salesTax = Math.round(taxable * plan.taxRateBps / 10000), pfbTax = Math.round(taxable * (plan.pfbTaxRateBps || 0) / 10000);
  const tax = salesTax + pfbTax;
  return { subtotal, tax, salesTax, pfbTax, total: subtotal + tax, paid: plan.paidCents, balance: subtotal + tax - plan.paidCents };
}
export function emptyEventPlan(reservationDepositCents = 35000): EventPlanDetails {
  return { title: "", contactName: "", contactEmail: "", phone: "", guestEmails: [], date: "", startTime: "", endTime: "", location: "Ready Room · 688 Brewing Drive, Fuquay-Varina", guestCount: 0, status: "Draft", setupTime: "", foodTime: "", lastCall: "", items: [], taxRateBps: 725, pfbTaxRateBps: 100, reservationDepositCents, paidCents: 0, flightPlan: emptyFlightPlan(), barDetails: "", notes: "", internalNotes: "" };
}
export function eventDateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
}
export function timeLabel(time: string) {
  if (!time) return "Not set";
  const [hour, minute] = time.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}
function parseFlightPlan(value: unknown, guestCount: number): FlightPlan | null {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Check the Flight Plan.");
  const input = value as Record<string, unknown>, f = emptyFlightPlan();
  for (const key of Object.keys(f) as (keyof FlightPlan)[]) {
    const v = input[key] ?? f[key];
    if (typeof f[key] === "string") {
      if (typeof v !== "string" || v.length > 2000) throw new Error(`Check ${key}.`);
      (f as unknown as Record<string, unknown>)[key] = v.trim();
    } else if (typeof f[key] === "boolean") {
      if (typeof v !== "boolean") throw new Error(`Check ${key}.`);
      (f as unknown as Record<string, unknown>)[key] = v;
    } else if (typeof f[key] === "number") {
      const max = key === "barCapCents" ? 100000000 : key === "extraHours" ? 24 : 10000;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > max) throw new Error(`Check ${key}.`);
      (f as unknown as Record<string, unknown>)[key] = v;
    }
  }
  const pkg = readyRoomPackages.find(p => p.id === f.packageId);
  if (f.packageId && !pkg) throw new Error("Choose a Ready Room package.");
  const entrees = f.packageId === "dinner" ? readyRoomMenu.premiumEntrees : readyRoomMenu.entrees;
  const groups = { appetizers: readyRoomMenu.appetizers, entrees, sides: readyRoomMenu.sides, salads: readyRoomMenu.salads, pizzas: readyRoomMenu.pizzas, extraAppetizers: readyRoomMenu.appetizers, extraEntrees: entrees, av: readyRoomMenu.av };
  for (const key of Object.keys(groups) as (keyof typeof groups)[]) {
    const v = input[key] ?? [];
    if (!Array.isArray(v) || v.length > 12 || v.some(s => typeof s !== "string" || !groups[key].includes(s)) || (key !== "appetizers" && key !== "extraAppetizers" && new Set(v).size !== v.length)) throw new Error(`Choose valid ${key}${key === "appetizers" || key === "extraAppetizers" ? "" : " without duplicates"}.`);
    f[key] = v as string[];
  }
  if (pkg) {
    if (guestCount < 30) throw new Error("Ready Room packages require at least 30 guests.");
    for (const key of ["appetizers", "entrees", "sides", "salads"] as const) if (f[key].length !== pkg[key]) throw new Error(`${pkg.name}: choose ${pkg[key]} ${key}.`);
    if (f.extraEntrees.some(s => f.entrees.includes(s))) throw new Error("Choose different foods for the additional entrees.");
    if (f.pizzaExtra && [...f.entrees, ...f.extraEntrees].includes("Aviator Pizzeria Pizza Bar")) throw new Error("Pizza Bar is already selected as an entree; do not add it twice.");
  } else if ([f.appetizers, f.entrees, f.sides, f.salads, f.extraAppetizers, f.extraEntrees].some(v => v.length) || f.extraHours || f.dessert || f.coffee || f.pizzaExtra) throw new Error("Choose a package before its food selections and extras.");
  const pizza = [...f.entrees, ...f.extraEntrees].includes("Aviator Pizzeria Pizza Bar") || f.pizzaExtra;
  if (pizza && (f.pizzas.length < 1 || f.pizzas.length > 3)) throw new Error("Choose 1 to 3 Pizza Bar styles.");
  if (!pizza && (f.pizzas.length || f.glutenFreeCount || f.pizzaTime || f.pizzaNotes)) throw new Error("Select a Pizza Bar entree before adding pizza details.");
  for (const key of ["pizzaTime", "appetizerTime"] as const) if (f[key] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(f[key])) throw new Error(`Check ${key}.`);
  if (!["", "Guest-paid bar", "Hosted tab", "Drink tickets"].includes(f.barMode)) throw new Error("Choose a bar setup.");
  if (!["", "Dry Rub", "Aviator", "Buffalo", "BlackMamba", "Monster"].includes(f.wingSauce)) throw new Error("Choose a wing sauce.");
  return f;
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
  const guestCount = integer("guestCount", 10000);
  const optionalInteger = (key: string, max: number) => input[key] == null ? 0 : integer(key, max);
  return { title: text("title", 200, true), contactName: text("contactName", 200), contactEmail, phone: text("phone", 100), guestEmails, date, startTime, endTime, location: text("location", 300, true), guestCount, status: input.status as EventPlanDetails["status"], setupTime: time("setupTime"), foodTime: time("foodTime"), lastCall: time("lastCall"), items, taxRateBps: integer("taxRateBps", 10000), pfbTaxRateBps: optionalInteger("pfbTaxRateBps", 10000), reservationDepositCents: optionalInteger("reservationDepositCents", 100000000), paidCents: integer("paidCents", 1000000000), flightPlan: parseFlightPlan(input.flightPlan, guestCount), barDetails: text("barDetails", 5000), notes: text("notes", 5000), internalNotes: text("internalNotes", 5000) };
}
