import { createHash } from "node:crypto";
import { databaseConfigured, withDatabase } from "@/lib/database";
import { flightLogUserRoles, flightLogUserStatuses, type FlightLogUserRole, type FlightLogUserStatus, type ManagedFlightLogUser, type ManagedFlightLogUserInput } from "@/lib/flight-log-user-types";

const callsignPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,30}$/;
const emailPattern = /^\S+@\S+\.\S+$/;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\0/g, "").trim().slice(0, max) : "";
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : value ? String(value) : "";
}

function normalizedRole(value: unknown): FlightLogUserRole {
  return value === "moderator" || value === "admin" ? value : "user";
}

function normalizedStatus(value: unknown): FlightLogUserStatus {
  return value === "pending_verification" || value === "banned" ? value : "active";
}

function userFromRow(row: Record<string, unknown>): ManagedFlightLogUser {
  return {
    id: Number(row.id),
    callsign: String(row.handle || ""),
    displayName: String(row.display_name || row.handle || ""),
    firstName: String(row.first_name || ""),
    lastName: String(row.last_name || ""),
    email: String(row.email || ""),
    phone: String(row.phone || ""),
    bio: String(row.bio || ""),
    avatarUrl: String(row.avatar_url || ""),
    role: normalizedRole(row.role),
    status: normalizedStatus(row.status),
    emailVerified: Boolean(row.email_verified_at),
    joinedAt: iso(row.flight_crew_joined_at || row.created_at),
    lastLoginAt: iso(row.last_login_at),
    updatedAt: iso(row.updated_at),
    postCount: Number(row.post_count || 0),
    commentCount: Number(row.comment_count || 0),
    checkInCount: Number(row.check_in_count || 0),
    friendCount: Number(row.friend_count || 0),
  };
}

function requireDatabase() {
  if (!databaseConfigured()) throw new Error("Flight Log user management requires DATABASE_URL.");
}

function validateInput(input: ManagedFlightLogUserInput) {
  const id = Number(input.id);
  const callsign = clean(input.callsign, 32);
  const firstName = clean(input.firstName, 80);
  const lastName = clean(input.lastName, 80);
  const displayName = clean(input.displayName, 160) || [firstName, lastName].filter(Boolean).join(" ") || callsign;
  const email = clean(input.email, 180).toLowerCase();
  const phone = clean(input.phone, 40);
  const bio = clean(input.bio, 500);
  if (!Number.isInteger(id) || id < 1) throw new Error("Choose a valid Flight Log user.");
  if (!callsignPattern.test(callsign)) throw new Error("Use a callsign with 3-31 letters, numbers, underscores, or dashes.");
  if (!firstName || !lastName) throw new Error("First and last name are required.");
  if (!emailPattern.test(email)) throw new Error("Use a valid email address.");
  if (!flightLogUserRoles.includes(input.role)) throw new Error("Choose a valid user role.");
  if (!flightLogUserStatuses.includes(input.status)) throw new Error("Choose a valid account status.");
  if (input.role === "admin" && input.status === "banned") throw new Error("An administrator cannot be banned.");
  return { id, callsign, firstName, lastName, displayName, email, phone, bio, role: input.role, status: input.status, emailVerified: Boolean(input.emailVerified) };
}

export async function getManagedFlightLogUsers() {
  requireDatabase();
  return withDatabase(async (client) => {
    const result = await client.query(
      `SELECT p.*,
        (SELECT count(*)::int FROM flight_log.posts fp WHERE fp.profile_id=p.id) AS post_count,
        (SELECT count(*)::int FROM flight_log.post_comments pc WHERE pc.profile_id=p.id) AS comment_count,
        (SELECT count(*)::int FROM flight_log.check_ins ci WHERE ci.profile_id=p.id) AS check_in_count,
        (SELECT count(*)::int FROM flight_log.friendships f WHERE f.status='accepted' AND p.id IN (f.requester_profile_id, f.addressee_profile_id)) AS friend_count
       FROM flight_log.profiles p
       ORDER BY CASE p.role WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END, lower(p.display_name), p.id
       LIMIT 1000`,
    );
    return result.rows.map(userFromRow);
  });
}

export async function updateManagedFlightLogUser(input: ManagedFlightLogUserInput) {
  requireDatabase();
  const value = validateInput(input);
  return withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      const currentResult = await client.query("SELECT id, role, status FROM flight_log.profiles WHERE id=$1 FOR UPDATE", [value.id]);
      const current = currentResult.rows[0];
      if (!current) throw new Error("Flight Log user not found.");
      const currentRole = normalizedRole(current.role);
      if (currentRole === "admin" && (value.role !== "admin" || value.status === "banned")) {
        const admins = await client.query("SELECT count(*)::int AS count FROM flight_log.profiles WHERE role='admin' AND status<>'banned'");
        if (Number(admins.rows[0]?.count || 0) <= 1) throw new Error("Assign another administrator before changing the last admin.");
      }
      const result = await client.query(
        `UPDATE flight_log.profiles
         SET handle=$1, display_name=$2, first_name=$3, last_name=$4, email=$5, email_hash=$6,
             phone=NULLIF($7,''), bio=NULLIF($8,''), role=$9, status=$10,
             email_verified_at=CASE WHEN $11 THEN COALESCE(email_verified_at, now()) ELSE NULL END,
             verification_token_hash=CASE WHEN $11 THEN NULL ELSE verification_token_hash END,
             verification_expires_at=CASE WHEN $11 THEN NULL ELSE verification_expires_at END,
             updated_at=now()
         WHERE id=$12
         RETURNING *`,
        [value.callsign, value.displayName, value.firstName, value.lastName, value.email, digest(value.email), value.phone, value.bio, value.role, value.status, value.emailVerified, value.id],
      );
      if (value.status === "banned") await client.query("DELETE FROM flight_log.sessions WHERE profile_id=$1", [value.id]);
      await client.query("COMMIT");
      return userFromRow(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if ((error as { code?: string }).code === "23505") throw new Error("That email address or callsign is already assigned to another user.");
      throw error;
    }
  });
}

export async function setFlightLogUserBanned(actorRole: FlightLogUserRole, targetId: number) {
  requireDatabase();
  if (actorRole !== "moderator" && actorRole !== "admin") throw new Error("Moderator access is required.");
  return withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await client.query("SELECT id, role, status FROM flight_log.profiles WHERE id=$1 FOR UPDATE", [targetId]);
      const target = result.rows[0];
      if (!target) throw new Error("Flight Log user not found.");
      const targetRole = normalizedRole(target.role);
      if (targetRole === "admin") throw new Error("Administrators cannot be banned.");
      if (actorRole === "moderator" && targetRole !== "user") throw new Error("Moderators can only ban regular users.");
      await client.query("UPDATE flight_log.profiles SET status='banned', updated_at=now() WHERE id=$1", [targetId]);
      await client.query("DELETE FROM flight_log.sessions WHERE profile_id=$1", [targetId]);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}

export async function deleteManagedFlightLogUser(id: number) {
  requireDatabase();
  if (!Number.isInteger(id) || id < 1) throw new Error("Choose a valid Flight Log user.");
  return withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await client.query("SELECT id, handle, display_name, role FROM flight_log.profiles WHERE id=$1 FOR UPDATE", [id]);
      const target = result.rows[0];
      if (!target) throw new Error("Flight Log user not found.");
      if (normalizedRole(target.role) === "admin") {
        const admins = await client.query("SELECT count(*)::int AS count FROM flight_log.profiles WHERE role='admin' AND status<>'banned'");
        if (Number(admins.rows[0]?.count || 0) <= 1) throw new Error("The last administrator cannot be deleted.");
      }
      const posts = await client.query("SELECT p.id::text, media.url FROM flight_log.posts p LEFT JOIN flight_log.media_assets media ON media.post_id=p.id WHERE p.profile_id=$1", [id]);
      const postIds = [...new Set(posts.rows.map((row) => String(row.id)))];
      if (postIds.length) {
        await client.query("DELETE FROM flight_log.post_comments WHERE target_type='customer' AND target_id=ANY($1::text[])", [postIds]);
        await client.query("DELETE FROM flight_log.post_reactions WHERE target_type='customer' AND target_id=ANY($1::text[])", [postIds]);
      }
      await client.query("DELETE FROM flight_log.post_comments WHERE profile_id=$1", [id]);
      await client.query("DELETE FROM flight_log.comments WHERE profile_id=$1", [id]);
      await client.query("DELETE FROM flight_log.friend_invites WHERE inviter_profile_id=$1", [id]);
      await client.query("DELETE FROM flight_log.posts WHERE profile_id=$1", [id]);
      await client.query("DELETE FROM flight_log.profiles WHERE id=$1", [id]);
      await client.query("COMMIT");
      return {
        id,
        callsign: String(target.handle || ""),
        displayName: String(target.display_name || target.handle || ""),
        mediaUrls: posts.rows.map((row) => String(row.url || "")).filter(Boolean),
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}
