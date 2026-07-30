import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
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
function customerFromRow(row: Record<string, unknown>): FlightLogCustomer {
  return {
    id: Number(row.id),
    firstName: String(row.first_name || ""),
    lastName: String(row.last_name || ""),
    email: String(row.email || ""),
    callsign: String(row.handle || ""),
    displayName: String(row.display_name || row.handle || ""),
    emailVerified: Boolean(row.email_verified_at),
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
    const duplicate = await client.query("SELECT id FROM flight_log.profiles WHERE lower(email) = lower($1) OR lower(handle) = lower($2) LIMIT 1", [nextEmail, nextCallsign]);
    if ((duplicate.rowCount || 0) > 0) throw new Error("An account already exists with that email or callsign.");
    const result = await client.query(
      `INSERT INTO flight_log.profiles (handle, display_name, email, email_hash, first_name, last_name, password_salt, password_hash, verification_token_hash, verification_expires_at, role, status, flight_crew_joined_at, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'member','pending_verification',now(),$11::jsonb)
       RETURNING *`,
      [nextCallsign, `${firstName} ${lastName}`, nextEmail, digest(nextEmail), firstName, lastName, salt, passwordDigest(nextPassword, salt), digest(verificationToken), new Date(now.getTime() + verificationMinutes * 60 * 1000).toISOString(), JSON.stringify({ flightCrewSource: "flight-log-registration" })],
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
export function setFlightLogSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set({ name: flightLogSessionCookie, value: token, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
}
export function clearFlightLogSessionCookie(response: NextResponse) {
  response.cookies.set({ name: flightLogSessionCookie, value: "", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}
export function rateLimitKey(request: NextRequest, action: string, subject = "") {
  return [action, request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local", subject.toLowerCase()].join(":");
}
