import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { getAllBeers } from "@/lib/managed-beers";
import { getAllBeyondBeer } from "@/lib/managed-beyond-beer";
import { getAllLocations } from "@/lib/managed-locations";
import { databaseConfigured, withDatabase } from "@/lib/database";
import { isMailConfigured, sendMail } from "@/lib/mail";

export type FlightLogCustomer = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  callsign: string;
  displayName: string;
  emailVerified: boolean;
  flightCrewJoinedAt?: string;
  avatarUrl?: string;
  bio?: string;
};

export const flightLogSessionCookie = "aviator_flight_log";
const sessionDays = 14;
const rememberDays = 60;
const verificationMinutes = 60 * 24;
const resetMinutes = 30;
const callsignPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,30}$/;
const emailPattern = /^\S+@\S+\.\S+$/;
const rateBuckets = new Map<string, number[]>();

function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function email(value: unknown) {
  const next = clean(value, 180).toLowerCase();
  if (!emailPattern.test(next)) throw new Error("Use a valid email address.");
  return next;
}
function callsign(value: unknown) {
  const next = clean(value, 32);
  if (!callsignPattern.test(next)) throw new Error("Use a callsign using 3-31 letters, numbers, underscores, or dashes.");
  return next;
}
function password(value: unknown) {
  const next = typeof value === "string" ? value : "";
  if (next.length < 10 || next.length > 200) throw new Error("Use a password between 10 and 200 characters.");
  return next;
}
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function passwordDigest(value: string, salt: string) { return scryptSync(value, salt, 64).toString("hex"); }
function secureEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
function publicBaseUrl(request?: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (request) return new URL(request.url).origin;
  return "http://localhost:4173";
}
function normalizeFlightLogAvatarUrl(value: string) {
  if (value.startsWith("/media/flight-log-avatars/")) return "/api/flight-log-avatar-files/" + encodeURIComponent(path.basename(value));
  return value;
}

function customerFromRow(row: Record<string, unknown>): FlightLogCustomer {
  return {
    id: Number(row.id),
    firstName: String(row.first_name || ""),
    lastName: String(row.last_name || ""),
    email: String(row.email || ""),
    callsign: String(row.handle || ""),
    displayName: String(row.display_name || row.handle || ""),
    emailVerified: Boolean(row.email_verified_at),
    avatarUrl: normalizeFlightLogAvatarUrl(String(row.avatar_url || "")) || undefined,
    bio: String(row.bio || "") || undefined,
    flightCrewJoinedAt: row.flight_crew_joined_at instanceof Date ? row.flight_crew_joined_at.toISOString() : row.flight_crew_joined_at ? String(row.flight_crew_joined_at) : undefined,
  };
}

export function requireDatabaseForFlightLogAuth() {
  if (!databaseConfigured()) throw new Error("Flight Log accounts require DATABASE_URL.");
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (rateBuckets.get(key) || []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) throw new Error("Too many attempts. Try again shortly.");
  recent.push(now);
  rateBuckets.set(key, recent);
}

async function deliverAuthEmail(message: { to: string; subject: string; text: string; html: string }) {
  if (process.env.FLIGHT_LOG_AUTH_SKIP_EMAIL === "true") return;
  if (!isMailConfigured() && process.env.MAIL_MODE !== "record") return;
  try {
    await sendMail(message);
  } catch (error) {
    console.error("flight_log.auth_email_failed", error instanceof Error ? error.message : "unknown error");
    if (process.env.FLIGHT_LOG_REQUIRE_EMAIL === "true") throw error;
  }
}

async function sendVerificationEmail(customer: FlightLogCustomer, token: string, request?: Request) {
  const url = `${publicBaseUrl(request)}/flight-log/verify?token=${encodeURIComponent(token)}`;
  const subject = "Verify your Aviator Flight Log account";
  const text = `Welcome to Aviator Flight Log.\n\nVerify your email: ${url}\n\nThis link expires in 24 hours.`;
  const html = `<p>Welcome to Aviator Flight Log.</p><p><a href="${url}">Verify your email</a></p><p>This link expires in 24 hours.</p>`;
  await deliverAuthEmail({ to: customer.email, subject, text, html });
}
async function sendResetEmail(customer: FlightLogCustomer, token: string, request?: Request) {
  const url = `${publicBaseUrl(request)}/flight-log/reset-password?token=${encodeURIComponent(token)}`;
  const subject = "Reset your Aviator Flight Log password";
  const text = `Reset your Aviator Flight Log password: ${url}\n\nThis link expires in 30 minutes.`;
  const html = `<p>Reset your Aviator Flight Log password.</p><p><a href="${url}">Reset password</a></p><p>This link expires in 30 minutes.</p>`;
  await deliverAuthEmail({ to: customer.email, subject, text, html });
}

export async function registerFlightLogCustomer(input: Record<string, unknown>, request?: Request) {
  requireDatabaseForFlightLogAuth();
  const firstName = clean(input.firstName, 80);
  const lastName = clean(input.lastName, 80);
  const nextEmail = email(input.email);
  const nextCallsign = callsign(input.callsign || input.username);
  const nextPassword = password(input.password);
  if (!firstName || !lastName) throw new Error("Add your first and last name.");
  if (nextPassword !== input.passwordConfirmation) throw new Error("Passwords do not match.");
  if (input.agree !== true) throw new Error("You must agree to the community rules and privacy policy.");
  const salt = randomBytes(16).toString("hex");
  const verificationToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const customer = await withDatabase(async (client) => {
    const duplicate = await client.query(
      "SELECT id, email, handle, email_verified_at FROM flight_log.profiles WHERE lower(email) = lower($1) OR lower(handle) = lower($2)",
      [nextEmail, nextCallsign],
    );
    const duplicateEmail = duplicate.rows.find((row) => String(row.email || "").toLowerCase() === nextEmail);
    const duplicateCallsign = duplicate.rows.find((row) => String(row.handle || "").toLowerCase() === nextCallsign.toLowerCase());
    if (duplicateCallsign && (!duplicateEmail || Number(duplicateCallsign.id) !== Number(duplicateEmail.id))) throw new Error("That callsign is already taken. Try another one.");
    if (duplicateEmail?.email_verified_at) throw new Error("An account already exists with that email. Sign in or reset your password.");
    const displayName = firstName + " " + lastName;
    const profileValues = [nextCallsign, displayName, nextEmail, digest(nextEmail), firstName, lastName, salt, passwordDigest(nextPassword, salt), digest(verificationToken), new Date(now.getTime() + verificationMinutes * 60 * 1000).toISOString(), JSON.stringify({ flightCrewSource: "flight-log-registration" })];
    const result = duplicateEmail ? await client.query(
      `UPDATE flight_log.profiles
       SET handle=$1, display_name=$2, email=$3, email_hash=$4, first_name=$5, last_name=$6, password_salt=$7, password_hash=$8, verification_token_hash=$9, verification_expires_at=$10, role='member', status='pending_verification', flight_crew_joined_at=COALESCE(flight_crew_joined_at, now()), metadata=COALESCE(metadata, '{}'::jsonb) || $11::jsonb, updated_at=now()
       WHERE id=$12
       RETURNING *`,
      [...profileValues, duplicateEmail.id],
    ) : await client.query(
      `INSERT INTO flight_log.profiles (handle, display_name, email, email_hash, first_name, last_name, password_salt, password_hash, verification_token_hash, verification_expires_at, role, status, flight_crew_joined_at, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'member','pending_verification',now(),$11::jsonb)
       RETURNING *`,
      profileValues,
    );
    await client.query(
      `INSERT INTO website.newsletter_subscribers (email,name,source,status,subscribed_at,confirmation_expires_at,confirmation_sent_at)
       VALUES ($1,$2,'flight-log-registration','pending',now(),$3,now())
       ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, source='flight-log-registration', status=CASE WHEN website.newsletter_subscribers.status='confirmed' THEN 'confirmed' ELSE 'pending' END, confirmation_expires_at=EXCLUDED.confirmation_expires_at, confirmation_sent_at=now()`,
      [nextEmail, `${firstName} ${lastName}`, new Date(now.getTime() + verificationMinutes * 60 * 1000).toISOString()],
    );
    return customerFromRow(result.rows[0]);
  });
  await sendVerificationEmail(customer, verificationToken, request);
  return customer;
}

export async function verifyFlightLogEmail(token: string) {
  requireDatabaseForFlightLogAuth();
  const tokenHash = digest(clean(token, 200));
  return withDatabase(async (client) => {
    const result = await client.query("SELECT * FROM flight_log.profiles WHERE verification_token_hash = $1 AND verification_expires_at > now() LIMIT 1", [tokenHash]);
    if (!result.rows[0]) return null;
    const profile = result.rows[0];
    const updated = await client.query("UPDATE flight_log.profiles SET email_verified_at = COALESCE(email_verified_at, now()), verification_token_hash = null, verification_expires_at = null, status = 'active', updated_at = now() WHERE id = $1 RETURNING *", [profile.id]);
    await client.query("UPDATE website.newsletter_subscribers SET status='confirmed', confirmed_at=COALESCE(confirmed_at, now()), confirmation_expires_at=null WHERE email=$1", [profile.email]);
    return customerFromRow(updated.rows[0]);
  });
}

export async function resendFlightLogVerification(inputEmail: string, request?: Request) {
  requireDatabaseForFlightLogAuth();
  const nextEmail = email(inputEmail);
  const token = randomBytes(32).toString("base64url");
  const result = await withDatabase(async (client) => client.query("UPDATE flight_log.profiles SET verification_token_hash=$1, verification_expires_at=$2, updated_at=now() WHERE lower(email)=lower($3) AND email_verified_at IS NULL RETURNING *", [digest(token), new Date(Date.now() + verificationMinutes * 60 * 1000).toISOString(), nextEmail]));
  if (result.rows[0]) await sendVerificationEmail(customerFromRow(result.rows[0]), token, request);
  return true;
}

export async function loginFlightLogCustomer(input: Record<string, unknown>, remember: boolean) {
  requireDatabaseForFlightLogAuth();
  const login = clean(input.emailOrCallsign || input.email, 180).toLowerCase();
  const nextPassword = password(input.password);
  const result = await withDatabase(async (client) => client.query("SELECT * FROM flight_log.profiles WHERE lower(email)=lower($1) OR lower(handle)=lower($1) LIMIT 1", [login]));
  const row = result.rows[0];
  if (!row?.password_salt || !row?.password_hash || !secureEqual(passwordDigest(nextPassword, row.password_salt), row.password_hash)) throw new Error("Invalid email/callsign or password.");
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (remember ? rememberDays : sessionDays) * 24 * 60 * 60 * 1000);
  await withDatabase(async (client) => {
    await client.query("INSERT INTO flight_log.sessions (profile_id, token_hash, expires_at) VALUES ($1,$2,$3)", [row.id, digest(rawToken), expiresAt.toISOString()]);
    await client.query("UPDATE flight_log.profiles SET last_login_at=now() WHERE id=$1", [row.id]);
  });
  return { customer: customerFromRow(row), token: rawToken, expiresAt };
}

export async function requestFlightLogPasswordReset(inputEmail: string, request?: Request) {
  requireDatabaseForFlightLogAuth();
  const nextEmail = email(inputEmail);
  const token = randomBytes(32).toString("base64url");
  const result = await withDatabase(async (client) => client.query("UPDATE flight_log.profiles SET reset_token_hash=$1, reset_expires_at=$2, updated_at=now() WHERE lower(email)=lower($3) RETURNING *", [digest(token), new Date(Date.now() + resetMinutes * 60 * 1000).toISOString(), nextEmail]));
  if (result.rows[0]) await sendResetEmail(customerFromRow(result.rows[0]), token, request);
  return true;
}

export async function resetFlightLogPassword(token: string, newPassword: string, confirmation: string) {
  requireDatabaseForFlightLogAuth();
  const nextPassword = password(newPassword);
  if (nextPassword !== confirmation) throw new Error("Passwords do not match.");
  const salt = randomBytes(16).toString("hex");
  const result = await withDatabase(async (client) => client.query("UPDATE flight_log.profiles SET password_salt=$1, password_hash=$2, reset_token_hash=null, reset_expires_at=null, updated_at=now() WHERE reset_token_hash=$3 AND reset_expires_at > now() RETURNING *", [salt, passwordDigest(nextPassword, salt), digest(clean(token, 200))]));
  if (!result.rows[0]) throw new Error("This reset link is invalid or expired.");
  return customerFromRow(result.rows[0]);
}

export async function getFlightLogCustomerForToken(token?: string): Promise<FlightLogCustomer | null> {
  if (!token || !databaseConfigured()) return null;
  try {
    return await withDatabase(async (client) => {
      const result = await client.query("SELECT p.* FROM flight_log.sessions s JOIN flight_log.profiles p ON p.id=s.profile_id WHERE s.token_hash=$1 AND s.expires_at > now() LIMIT 1", [digest(token)]);
      if (!result.rows[0]) return null;
      await client.query("UPDATE flight_log.sessions SET last_seen_at=now() WHERE token_hash=$1", [digest(token)]);
      return customerFromRow(result.rows[0]);
    });
  } catch { return null; }
}
export async function getCurrentFlightLogCustomer() {
  const store = await cookies();
  return getFlightLogCustomerForToken(store.get(flightLogSessionCookie)?.value);
}
export async function destroyFlightLogSession(token?: string) {
  if (!token || !databaseConfigured()) return;
  await withDatabase(async (client) => { await client.query("DELETE FROM flight_log.sessions WHERE token_hash=$1", [digest(token)]); });
}
function secureFlightLogCookie() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.APP_URL;
  if (configured) {
    try { return new URL(configured).protocol === "https:"; } catch { return false; }
  }
  return process.env.NODE_ENV === "production";
}

export async function updateFlightLogProfile(profileId: number, input: { avatarUrl?: string; bio?: string }) {
  requireDatabaseForFlightLogAuth();
  const avatarUrl = clean(input.avatarUrl, 500);
  const bio = clean(input.bio, 500);
  const result = await withDatabase(async (client) => client.query(
    "UPDATE flight_log.profiles SET avatar_url=COALESCE(NULLIF($1,''), avatar_url), bio=CASE WHEN $2 = '' THEN bio ELSE $2 END, updated_at=now() WHERE id=$3 RETURNING *",
    [avatarUrl, bio, profileId],
  ));
  if (!result.rows[0]) throw new Error("Profile not found.");
  return customerFromRow(result.rows[0]);
}

export type FlightLogCheckInKind = "beer" | "location" | "food" | "event";
export type FlightLogCheckIn = { id: number; kind: FlightLogCheckInKind; label: string; slug: string; notes: string; checkedInAt: string };

function checkInFromRow(row: Record<string, unknown>): FlightLogCheckIn {
  return {
    id: Number(row.id),
    kind: String(row.checkin_type || "") as FlightLogCheckInKind,
    label: String(row.target_label || ""),
    slug: String(row.target_slug || ""),
    notes: String(row.notes || ""),
    checkedInAt: row.checked_in_at instanceof Date ? row.checked_in_at.toISOString() : String(row.checked_in_at || ""),
  };
}

export async function createFlightLogCheckIn(profileId: number, input: { kind: FlightLogCheckInKind; targetSlug?: string; targetLabel: string; notes?: string }) {
  requireDatabaseForFlightLogAuth();
  const allowed = new Set<FlightLogCheckInKind>(["beer", "location", "food", "event"]);
  const kind = input.kind;
  const targetSlug = clean(input.targetSlug, 180);
  const targetLabel = clean(input.targetLabel, 180);
  const notes = clean(input.notes, 500);
  if (!allowed.has(kind) || !targetLabel) throw new Error("Choose a valid check-in.");
  const result = await withDatabase(async (client) => client.query(
    "INSERT INTO flight_log.check_ins (profile_id, checkin_type, target_slug, target_label, notes) VALUES ($1,$2,$3,$4,$5) RETURNING id, checkin_type, target_label, target_slug, notes, checked_in_at",
    [profileId, kind, targetSlug, targetLabel, notes],
  ));
  return checkInFromRow(result.rows[0]);
}

export async function getFlightLogProfileSummary(profileId: number) {
  if (!databaseConfigured()) return { beer: [], locations: [], food: [], events: [] } as Record<string, FlightLogCheckIn[]>;
  const result = await withDatabase(async (client) => client.query(
    "SELECT id, checkin_type, target_label, target_slug, notes, checked_in_at FROM flight_log.check_ins WHERE profile_id=$1 ORDER BY checked_in_at DESC LIMIT 100",
    [profileId],
  ));
  const [beers, beverages, locations] = await Promise.all([
    getAllBeers().catch(() => []),
    getAllBeyondBeer().catch(() => []),
    getAllLocations().catch(() => []),
  ]);
  const beerLabels = new Map([...beers, ...beverages].map((item) => [item.slug, item.name]));
  const locationLabels = new Map(locations.map((item) => [item.slug, item.name]));
  const groups: Record<string, FlightLogCheckIn[]> = { beer: [], locations: [], food: [], events: [] };
  for (const row of result.rows) {
    const item = checkInFromRow(row);
    const fallback = item.kind === "beer" ? beerLabels.get(item.slug) : item.kind === "location" ? locationLabels.get(item.slug) : undefined;
    const displayItem = fallback && (!item.label || item.label === item.slug) ? { ...item, label: fallback } : item;
    if (displayItem.kind === "beer") groups.beer.push(displayItem);
    else if (displayItem.kind === "location") groups.locations.push(displayItem);
    else if (displayItem.kind === "food") groups.food.push(displayItem);
    else if (displayItem.kind === "event") groups.events.push(displayItem);
  }
  return groups;
}
export function setFlightLogSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set({ name: flightLogSessionCookie, value: token, httpOnly: true, sameSite: "lax", secure: secureFlightLogCookie(), path: "/", expires: expiresAt });
}
export function clearFlightLogSessionCookie(response: NextResponse) {
  response.cookies.set({ name: flightLogSessionCookie, value: "", httpOnly: true, sameSite: "lax", secure: secureFlightLogCookie(), path: "/", maxAge: 0 });
}
export function rateLimitKey(request: NextRequest, action: string, subject = "") {
  return [action, request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local", subject.toLowerCase()].join(":");
}
