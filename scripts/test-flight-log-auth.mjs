import { createHash } from "node:crypto";
import { Client } from "pg";
import { readFile } from "node:fs/promises";

const sourceFiles = [
  "src/lib/flight-log-auth.ts",
  "src/app/api/flight-log/auth/register/route.ts",
  "src/app/api/flight-log/auth/login/route.ts",
  "src/app/api/flight-log/auth/logout/route.ts",
  "src/app/api/flight-log/auth/forgot-password/route.ts",
  "src/app/api/flight-log/auth/reset-password/route.ts",
  "src/app/flight-log/page.tsx",
];
const combined = (await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")))).join("\n");
function assert(value, message) { if (!value) throw new Error(message); }
assert(/registerFlightLogCustomer/.test(combined), "registration helper is wired");
assert(/website\.newsletter_subscribers/.test(combined), "registration enrolls Flight Crew newsletter membership");
assert(/verification_token_hash/.test(combined) && /verifyFlightLogEmail/.test(combined), "email verification tokens are implemented");
assert(/loginFlightLogCustomer/.test(combined) && /flightLogSessionCookie/.test(combined), "login and secure session cookie are implemented");
assert(/destroyFlightLogSession/.test(combined), "logout destroys sessions");
assert(/reset_token_hash/.test(combined) && /resetFlightLogPassword/.test(combined), "password reset tokens are implemented");
assert(/rateLimit\(/.test(combined), "auth endpoints use rate limiting");
assert(/disabled=\{locked\}/.test(combined), "logged-out or unverified users cannot use composer");
assert(/friendships/.test(await readFile("scripts/migrate-database.mjs", "utf8")), "friendship schema foundation exists");

const baseUrl = process.env.FLIGHT_LOG_TEST_BASE_URL;
const databaseUrl = process.env.DATABASE_URL;
if (!baseUrl || !databaseUrl) {
  console.log("flight-log-auth.static-tests.passed");
  process.exit(0);
}

const client = new Client({ connectionString: databaseUrl, ssl: process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : false });
await client.connect();
const stamp = Date.now();
const email = `flightlog-test-${stamp}@example.com`;
const callsign = `pilot_${stamp}`;
const password = "TestPassword12345";
const token = `verify-${stamp}`;
const resetToken = `reset-${stamp}`;
const digest = (value) => createHash("sha256").update(value).digest("hex");
try {
  let response = await fetch(baseUrl + "/api/flight-log/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firstName: "Test", lastName: "Pilot", email, callsign, password, passwordConfirmation: password, agree: true }) });
  assert(response.status === 201, "registration returns 201");
  let profile = await client.query("SELECT * FROM flight_log.profiles WHERE email=$1", [email]);
  assert(profile.rows[0], "profile row created");
  assert(!profile.rows[0].email_verified_at, "profile starts unverified");
  const subscriber = await client.query("SELECT * FROM website.newsletter_subscribers WHERE email=$1", [email]);
  assert(subscriber.rows[0], "Flight Crew enrollment row created");
  await client.query("UPDATE flight_log.profiles SET verification_token_hash=$1, verification_expires_at=now()+interval '1 hour' WHERE email=$2", [digest(token), email]);
  response = await fetch(baseUrl + "/flight-log/verify?token=" + encodeURIComponent(token));
  assert(response.status === 200, "verification page loads");
  profile = await client.query("SELECT * FROM flight_log.profiles WHERE email=$1", [email]);
  assert(profile.rows[0].email_verified_at, "email verification marks profile verified");
  const subscriberVerified = await client.query("SELECT status FROM website.newsletter_subscribers WHERE email=$1", [email]);
  assert(subscriberVerified.rows[0].status === "confirmed", "email verification confirms Flight Crew membership");
  response = await fetch(baseUrl + "/api/flight-log/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ emailOrCallsign: callsign, password, remember: true }) });
  assert(response.status === 200, "login succeeds");
  const cookie = response.headers.get("set-cookie") || "";
  assert(cookie.includes("aviator_flight_log"), "login sets session cookie");
  if (baseUrl.startsWith("http://")) assert(!/;\s*Secure/i.test(cookie), "local HTTP login cookie is not marked Secure");
  response = await fetch(baseUrl + "/flight-log", { headers: { cookie } });
  let html = await response.text();
  assert(/Signed in/.test(html) && /My Profile/.test(html), "signed-in experience shows profile controls");
  response = await fetch(baseUrl + "/api/flight-log/auth/logout", { method: "POST", headers: { cookie } });
  assert(response.status === 200, "logout succeeds");
  response = await fetch(baseUrl + "/api/flight-log/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
  assert(response.status === 200, "forgot password request succeeds");
  await client.query("UPDATE flight_log.profiles SET reset_token_hash=$1, reset_expires_at=now()+interval '30 minutes' WHERE email=$2", [digest(resetToken), email]);
  response = await fetch(baseUrl + "/api/flight-log/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: resetToken, password: "NewTestPassword12345", confirmation: "NewTestPassword12345" }) });
  assert(response.status === 200, "password reset succeeds");
  response = await fetch(baseUrl + "/flight-log");
  html = await response.text();
  assert(/Join Flight Crew/.test(html) && /Sign In/.test(html), "logged-out experience shows join and sign in CTAs");
  console.log("flight-log-auth.integration-tests.passed");
} finally {
  await client.query("DELETE FROM flight_log.sessions WHERE profile_id IN (SELECT id FROM flight_log.profiles WHERE email=$1)", [email]).catch(() => undefined);
  await client.query("DELETE FROM flight_log.friend_invites WHERE invite_email=$1", [email]).catch(() => undefined);
  await client.query("DELETE FROM flight_log.profiles WHERE email=$1", [email]).catch(() => undefined);
  await client.query("DELETE FROM website.newsletter_subscribers WHERE email=$1", [email]).catch(() => undefined);
  await client.end();
}
