import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PreparedShopCart } from "@/lib/shop";

const FREE_SHIPPING_THRESHOLD_CENTS = 7500;

export type ShopShippingAddress = {
  name: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  county: string;
  zip: string;
  country: string;
  phone: string;
};

export type ShopShippingRate = {
  id: string;
  carrier: string;
  service: string;
  amountCents: number;
  deliveryDays: number | null;
  token: string;
  isEstimate?: boolean;
};

type ShippingTokenPayload = {
  v: 1;
  exp: number;
  cart: string;
  address: ShopShippingAddress;
  rateId: string;
  carrier: string;
  service: string;
  amountCents: number;
};

function signingSecret() {
  const secret = process.env.SHOP_CHECKOUT_SIGNING_SECRET || process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Shop checkout signing is not configured.");
  return secret;
}

export function normalizeShippingAddress(input: Partial<ShopShippingAddress>) {
  const address: ShopShippingAddress = {
    name: String(input.name || "").trim().slice(0, 120),
    street1: String(input.street1 || "").trim().slice(0, 160),
    street2: String(input.street2 || "").trim().slice(0, 160),
    city: String(input.city || "").trim().slice(0, 100),
    state: String(input.state || "").trim().toUpperCase().slice(0, 30),
    county: String(input.county || "").trim().slice(0, 80),
    zip: String(input.zip || "").trim().slice(0, 20),
    country: String(input.country || "US").trim().toUpperCase().slice(0, 2),
    phone: String(input.phone || "").trim().slice(0, 30),
  };
  if (!address.name || !address.street1 || !address.city || !address.state || !address.zip) throw new Error("Enter a complete shipping address.");
  if (address.country !== "US") throw new Error("ShopNew currently ships to United States addresses only.");
  return address;
}

export function shopCartFingerprint(cart: PreparedShopCart) {
  const value = cart.items.map((item) => [item.variantId, item.quantity, item.unitPriceCents, item.isBonus ? 1 : 0].join(":")).sort().join("|");
  return createHash("sha256").update(value + "|" + cart.subtotalCents).digest("hex");
}

function encodeToken(payload: ShippingTokenPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  return encoded + "." + signature;
}

export function verifyShippingToken(token: string, cart: PreparedShopCart, addressInput: Partial<ShopShippingAddress>) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new Error("Choose a valid shipping rate.");
  const expected = createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new Error("The shipping quote is invalid.");
  let payload: ShippingTokenPayload;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ShippingTokenPayload; }
  catch { throw new Error("The shipping quote is invalid."); }
  const address = normalizeShippingAddress(addressInput);
  if (payload.v !== 1 || payload.exp < Date.now() || payload.cart !== shopCartFingerprint(cart) || JSON.stringify(payload.address) !== JSON.stringify(address)) throw new Error("The cart or address changed. Calculate shipping again.");
  return payload;
}

function easyPostError(body: unknown) {
  if (!body || typeof body !== "object") return "USPS rates are unavailable.";
  const error = (body as { error?: { message?: string; errors?: Array<{ message?: string }> } }).error;
  return error?.errors?.map((item) => item.message).filter(Boolean).join(" ") || error?.message || "USPS rates are unavailable.";
}

const zipRegionCenters: Record<string, [number, number]> = {
  "0": [42.5, -73.8], "1": [41.0, -72.5], "2": [38.5, -77.0], "3": [34.0, -81.0], "4": [39.0, -82.0],
  "5": [42.0, -90.0], "6": [39.0, -96.0], "7": [33.0, -96.0], "8": [40.0, -111.0], "9": [37.0, -121.0],
};

function zipCoordinates(zip: string) {
  const digits = zip.replace(/[^0-9]/g, "").slice(0, 5);
  if (digits.length !== 5 || !zipRegionCenters[digits[0]]) throw new Error("Enter a valid five-digit US ZIP code.");
  const center = zipRegionCenters[digits[0]];
  return { latitude: center[0], longitude: center[1], prefix: Number(digits.slice(0, 3)) };
}

function distanceMiles(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const radians = (value: number) => value * Math.PI / 180;
  const latitude = radians(to.latitude - from.latitude);
  const longitude = radians(to.longitude - from.longitude);
  const a = Math.sin(latitude / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitude / 2) ** 2;
  return 3959 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateUspsRate(cart: PreparedShopCart, address: ShopShippingAddress): ShopShippingRate {
  const origin = zipCoordinates(cart.settings.originZip);
  const destination = zipCoordinates(address.zip);
  const miles = distanceMiles(origin, destination);
  const zone = miles <= 50 ? 1 : miles <= 150 ? 2 : miles <= 300 ? 3 : miles <= 600 ? 4 : miles <= 1000 ? 5 : miles <= 1400 ? 6 : miles <= 1800 ? 7 : 8;
  const weight = cart.shippingWeightOunces;
  const base = weight <= 4 ? 550 : weight <= 8 ? 650 : weight <= 16 ? 750 : weight <= 32 ? 925 : weight <= 48 ? 1125 : 1325;
  const postageCents = Math.round((base + Math.max(0, zone - 3) * 45) / 25) * 25;
  const amountCents = postageCents;
  const payload: ShippingTokenPayload = { v: 1, exp: Date.now() + 15 * 60_000, cart: shopCartFingerprint(cart), address, rateId: "zip-estimate-" + destination.prefix, carrier: "USPS estimate", service: "Ground Advantage estimate", amountCents };
  return { id: payload.rateId, carrier: payload.carrier, service: payload.service, amountCents, deliveryDays: zone <= 3 ? 3 : zone <= 5 ? 5 : 7, token: encodeToken(payload), isEstimate: true };
}

export async function calculateUspsRates(cart: PreparedShopCart, addressInput: Partial<ShopShippingAddress>): Promise<ShopShippingRate[]> {
  const address = normalizeShippingAddress(addressInput);
  if (!cart.requiresShipping) {
    const payload: ShippingTokenPayload = { v: 1, exp: Date.now() + 15 * 60_000, cart: shopCartFingerprint(cart), address, rateId: "no-shipping", carrier: "Aviator", service: "No shipping required", amountCents: 0 };
    return [{ id: payload.rateId, carrier: payload.carrier, service: payload.service, amountCents: 0, deliveryDays: null, token: encodeToken(payload) }];
  }
  if (cart.subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS) {
    const payload: ShippingTokenPayload = { v: 1, exp: Date.now() + 15 * 60_000, cart: shopCartFingerprint(cart), address, rateId: "free-shipping-75", carrier: "Aviator", service: "Free shipping over $75", amountCents: 0 };
    return [{ id: payload.rateId, carrier: payload.carrier, service: payload.service, amountCents: 0, deliveryDays: null, token: encodeToken(payload) }];
  }
  const apiKey = process.env.EASYPOST_API_KEY;
  if (!apiKey) return [estimateUspsRate(cart, address)];
  const carrierAccount = process.env.EASYPOST_USPS_CARRIER_ACCOUNT_ID;
  const shipment: Record<string, unknown> = {
    to_address: { name: address.name, street1: address.street1, street2: address.street2 || undefined, city: address.city, state: address.state, zip: address.zip, country: address.country, phone: address.phone || undefined, verify: true },
    from_address: { company: cart.settings.originName, street1: cart.settings.originStreet1, street2: cart.settings.originStreet2 || undefined, city: cart.settings.originCity, state: cart.settings.originState, zip: cart.settings.originZip, country: cart.settings.originCountry, phone: cart.settings.originPhone },
    parcel: { length: cart.settings.parcelLength, width: cart.settings.parcelWidth, height: cart.settings.parcelHeight, weight: cart.shippingWeightOunces },
    options: { currency: "USD" },
  };
  if (carrierAccount) shipment.carrier_accounts = [carrierAccount];
  const response = await fetch("https://api.easypost.com/v2/shipments", {
    method: "POST",
    headers: { authorization: "Basic " + Buffer.from(apiKey + ":").toString("base64"), "content-type": "application/json" },
    body: JSON.stringify({ shipment }),
    cache: "no-store",
  });
  const body = await response.json() as { rates?: Array<{ id?: string; carrier?: string; service?: string; rate?: string; delivery_days?: number | null }> };
  if (!response.ok) throw new Error(easyPostError(body));
  const unique = new Map<string, ShopShippingRate>();
  const rates = (body.rates || []).filter((rate) => String(rate.carrier || "").toUpperCase().includes("USPS")).sort((a, b) => Number(a.rate || 0) - Number(b.rate || 0));
  for (const rate of rates) {
    const amountCents = Math.round(Number(rate.rate || 0) * 100);
    if (!rate.id || !rate.service || !Number.isInteger(amountCents) || amountCents < 0) continue;
    const key = rate.service + ":" + amountCents;
    if (unique.has(key)) continue;
    const service = rate.service;
    const payload: ShippingTokenPayload = { v: 1, exp: Date.now() + 15 * 60_000, cart: shopCartFingerprint(cart), address, rateId: rate.id, carrier: "USPS", service, amountCents };
    unique.set(key, { id: rate.id, carrier: "USPS", service, amountCents, deliveryDays: rate.delivery_days ?? null, token: encodeToken(payload) });
  }
  const result = [...unique.values()].slice(0, 5);
  if (!result.length) throw new Error("USPS did not return a shipping rate for that address.");
  return result;
}
