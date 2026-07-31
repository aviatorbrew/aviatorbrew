import { randomBytes, createHash } from "node:crypto";
import { databaseConfigured, withDatabase } from "@/lib/database";
import { isMailConfigured, sendMail } from "@/lib/mail";

export type FlightLogTargetType = "official" | "customer";
export type FlightLogReaction = "thumbs_up" | "heart" | "laugh" | "beer" | "airplane";
export type FlightLogCustomerPost = {
  id: number;
  targetType: "customer";
  title: string;
  body: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl: string;
  media: { url: string; mediaType: string }[];
  taggedHandles: string[];
  createdAt: string;
};
export type FlightLogComment = { id: number; authorName: string; authorHandle: string; body: string; createdAt: string };
export type FlightLogFriend = { id: number; callsign: string; displayName: string; avatarUrl: string };
export type FlightLogFriendRequest = FlightLogFriend & { requestedAt: string };
export type FlightLogFriendInvite = { id: number; inviteEmail: string; invitePhone: string; status: string; createdAt: string };
export type FlightLogFriendSummary = { friends: FlightLogFriend[]; sentRequests: FlightLogFriendRequest[]; receivedRequests: FlightLogFriendRequest[]; invites: FlightLogFriendInvite[] };

const clean = (value: unknown, max: number) => typeof value === "string" ? value.replace(/\0/g, "").replace(/<\/?script\b[^>]*>/gi, "").trim().slice(0, max) : "";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const emailPattern = /^\S+@\S+\.\S+$/;
const phonePattern = /^\+?[0-9 .()-]{7,24}$/;
const reactions = new Set<FlightLogReaction>(["thumbs_up", "heart", "laugh", "beer", "airplane"]);
const targets = new Set<FlightLogTargetType>(["official", "customer"]);

function requireDb() { if (!databaseConfigured()) throw new Error("Flight Log social features require DATABASE_URL."); }
function iso(value: unknown) { return value instanceof Date ? value.toISOString() : String(value || ""); }
function postFromRow(row: Record<string, unknown>): FlightLogCustomerPost {
  const media = Array.isArray(row.media) ? row.media as { url: string; mediaType: string }[] : [];
  return {
    id: Number(row.id),
    targetType: "customer",
    title: String(row.title || ""),
    body: String(row.body || ""),
    authorName: String(row.display_name || row.handle || "Flight Crew"),
    authorHandle: String(row.handle || ""),
    authorAvatarUrl: String(row.avatar_url || ""),
    media,
    taggedHandles: Array.isArray(row.tagged_handles) ? row.tagged_handles.map(String).filter(Boolean) : [],
    createdAt: iso(row.created_at),
  };
}

export async function getPublishedCustomerFlightLogPosts(limit = 30) {
  if (!databaseConfigured()) return [] as FlightLogCustomerPost[];
  return withDatabase(async (client) => {
    const result = await client.query(
      `SELECT p.id, p.title, p.body, p.created_at, profile.handle, profile.display_name, profile.avatar_url,
        COALESCE(jsonb_agg(DISTINCT jsonb_build_object('url', media.url, 'mediaType', media.media_type)) FILTER (WHERE media.url IS NOT NULL), '[]'::jsonb) AS media,
        COALESCE(array_agg(DISTINCT tagged.handle) FILTER (WHERE tagged.handle IS NOT NULL), '{}') AS tagged_handles
       FROM flight_log.posts p
       LEFT JOIN flight_log.profiles profile ON profile.id = p.profile_id
       LEFT JOIN flight_log.media_assets media ON media.post_id = p.id
       LEFT JOIN flight_log.post_tags tags ON tags.post_id = p.id
       LEFT JOIN flight_log.profiles tagged ON tagged.id = tags.tagged_profile_id
       WHERE p.status = 'published' AND p.visibility = 'public'
       GROUP BY p.id, profile.handle, profile.display_name, profile.avatar_url
       ORDER BY p.created_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(postFromRow);
  });
}

export async function createCustomerFlightLogPost(profileId: number, input: { title?: string; body?: string; media?: { url: string; mediaType: string }[]; tagHandles?: string[] }) {
  requireDb();
  const body = clean(input.body, 5000);
  const title = clean(input.title, 120);
  if (!body && !input.media?.length) throw new Error("Add a note or media before posting.");
  return withDatabase(async (client) => {
    const post = await client.query(
      "INSERT INTO flight_log.posts (profile_id, post_type, title, body, visibility, status, published_at) VALUES ($1,'post',$2,$3,'public','published',now()) RETURNING id",
      [profileId, title || null, body],
    );
    const postId = Number(post.rows[0].id);
    for (const item of (input.media || []).slice(0, 6)) {
      const url = clean(item.url, 500);
      const mediaType = clean(item.mediaType, 80);
      if (url && mediaType) await client.query("INSERT INTO flight_log.media_assets (post_id, profile_id, url, media_type) VALUES ($1,$2,$3,$4)", [postId, profileId, url, mediaType]);
    }
    const handles = [...new Set((input.tagHandles || []).map((handle) => clean(handle.replace(/^@/, ""), 32).toLowerCase()).filter(Boolean))].slice(0, 10);
    if (handles.length) {
      const tagged = await client.query(
        `SELECT p.id FROM flight_log.profiles p
         WHERE lower(p.handle) = ANY($1::text[])
           AND EXISTS (
             SELECT 1 FROM flight_log.friendships f
             WHERE f.status='accepted'
               AND ((f.requester_profile_id=$2 AND f.addressee_profile_id=p.id) OR (f.addressee_profile_id=$2 AND f.requester_profile_id=p.id))
           )`,
        [handles, profileId],
      );
      for (const row of tagged.rows) await client.query("INSERT INTO flight_log.post_tags (post_id, tagged_profile_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [postId, row.id]);
    }
    return postId;
  });
}

export async function addFlightLogReaction(profileId: number, input: { targetType: FlightLogTargetType; targetId: string; reaction: FlightLogReaction }) {
  requireDb();
  const targetId = clean(input.targetId, 120);
  if (!targets.has(input.targetType) || !targetId || !reactions.has(input.reaction)) throw new Error("Choose a valid reaction.");
  await withDatabase(async (client) => client.query(
    "INSERT INTO flight_log.post_reactions (target_type, target_id, profile_id, reaction) VALUES ($1,$2,$3,$4) ON CONFLICT (target_type, target_id, profile_id) DO UPDATE SET reaction=EXCLUDED.reaction, created_at=now()",
    [input.targetType, targetId, profileId, input.reaction],
  ));
}

export async function addFlightLogComment(profileId: number, input: { targetType: FlightLogTargetType; targetId: string; body: string }) {
  requireDb();
  const targetId = clean(input.targetId, 120);
  const body = clean(input.body, 1000);
  if (!targets.has(input.targetType) || !targetId || !body) throw new Error("Add a comment first.");
  const result = await withDatabase(async (client) => client.query(
    `INSERT INTO flight_log.post_comments (target_type, target_id, profile_id, body) VALUES ($1,$2,$3,$4)
     RETURNING id, body, created_at`,
    [input.targetType, targetId, profileId, body],
  ));
  return result.rows[0];
}

export async function getFlightLogInteractionSummary(targetType: FlightLogTargetType, targetId: string) {
  if (!databaseConfigured()) return { reactions: {}, comments: [] as FlightLogComment[] };
  return withDatabase(async (client) => {
    const [reactionRows, commentRows] = await Promise.all([
      client.query("SELECT reaction, count(*)::int AS count FROM flight_log.post_reactions WHERE target_type=$1 AND target_id=$2 GROUP BY reaction", [targetType, targetId]),
      client.query(
        `SELECT c.id, c.body, c.created_at, p.display_name, p.handle
         FROM flight_log.post_comments c
         LEFT JOIN flight_log.profiles p ON p.id = c.profile_id
         WHERE c.target_type=$1 AND c.target_id=$2 AND c.status='visible'
         ORDER BY c.created_at ASC LIMIT 100`,
        [targetType, targetId],
      ),
    ]);
    const summary: Record<string, number> = {};
    for (const row of reactionRows.rows) summary[String(row.reaction)] = Number(row.count || 0);
    const comments = commentRows.rows.map((row): FlightLogComment => ({ id: Number(row.id), body: String(row.body || ""), authorName: String(row.display_name || row.handle || "Flight Crew"), authorHandle: String(row.handle || ""), createdAt: iso(row.created_at) }));
    return { reactions: summary, comments };
  });
}

function friendFromRow(row: Record<string, unknown>): FlightLogFriend {
  return { id: Number(row.id), callsign: String(row.handle || ""), displayName: String(row.display_name || row.handle || "Flight Crew"), avatarUrl: String(row.avatar_url || "") };
}

export async function getFlightLogFriendSummary(profileId: number): Promise<FlightLogFriendSummary> {
  if (!databaseConfigured()) return { friends: [], sentRequests: [], receivedRequests: [], invites: [] };
  return withDatabase(async (client) => {
    const [friends, sent, received, invites] = await Promise.all([
      client.query(
        `SELECT p.id, p.handle, p.display_name, p.avatar_url FROM flight_log.friendships f JOIN flight_log.profiles p ON p.id = CASE WHEN f.requester_profile_id=$1 THEN f.addressee_profile_id ELSE f.requester_profile_id END WHERE f.status='accepted' AND ($1 IN (f.requester_profile_id, f.addressee_profile_id)) ORDER BY p.display_name`,
        [profileId],
      ),
      client.query("SELECT p.id, p.handle, p.display_name, p.avatar_url, f.requested_at FROM flight_log.friendships f JOIN flight_log.profiles p ON p.id=f.addressee_profile_id WHERE f.requester_profile_id=$1 AND f.status='pending' ORDER BY f.requested_at DESC", [profileId]),
      client.query("SELECT p.id, p.handle, p.display_name, p.avatar_url, f.requested_at FROM flight_log.friendships f JOIN flight_log.profiles p ON p.id=f.requester_profile_id WHERE f.addressee_profile_id=$1 AND f.status='pending' ORDER BY f.requested_at DESC", [profileId]),
      client.query("SELECT id, invite_email, invite_phone, status, created_at FROM flight_log.friend_invites WHERE inviter_profile_id=$1 ORDER BY created_at DESC LIMIT 20", [profileId]),
    ]);
    const request = (row: Record<string, unknown>): FlightLogFriendRequest => ({ ...friendFromRow(row), requestedAt: iso(row.requested_at) });
    return {
      friends: friends.rows.map(friendFromRow),
      sentRequests: sent.rows.map(request),
      receivedRequests: received.rows.map(request),
      invites: invites.rows.map((row): FlightLogFriendInvite => ({ id: Number(row.id), inviteEmail: String(row.invite_email || ""), invitePhone: String(row.invite_phone || ""), status: String(row.status || "pending"), createdAt: iso(row.created_at) })),
    };
  });
}

export async function requestFlightLogFriend(profileId: number, input: { identifier: string; request?: Request }) {
  requireDb();
  const identifier = clean(input.identifier, 180);
  if (!identifier) throw new Error("Enter a callsign, email, or phone number.");
  return withDatabase(async (client) => {
    const me = await client.query("SELECT email, display_name, handle FROM flight_log.profiles WHERE id=$1", [profileId]);
    const mine = me.rows[0];
    const existing = await client.query("SELECT id, handle, display_name, avatar_url FROM flight_log.profiles WHERE lower(handle)=lower($1) OR lower(email)=lower($1) LIMIT 1", [identifier]);
    if (existing.rows[0]) {
      const target = existing.rows[0];
      if (Number(target.id) === profileId) throw new Error("You cannot friend yourself.");
      await client.query("INSERT INTO flight_log.friendships (requester_profile_id, addressee_profile_id, status) VALUES ($1,$2,'pending') ON CONFLICT (requester_profile_id, addressee_profile_id) DO NOTHING", [profileId, Number(target.id)]);
      return { type: "request", friend: friendFromRow(target) };
    }
    const token = randomBytes(32).toString("base64url");
    const inviteEmail = emailPattern.test(identifier) ? identifier.toLowerCase() : "";
    const invitePhone = !inviteEmail && phonePattern.test(identifier) ? identifier : "";
    if (!inviteEmail && !invitePhone) throw new Error("No Flight Log user found. Enter an email or phone number to invite them.");
    await client.query(
      "INSERT INTO flight_log.friend_invites (inviter_profile_id, invite_email, invite_phone, token_hash, status, invite_channel, carrier_lookup_status, expires_at, message) VALUES ($1,$2,$3,$4,$5,$6,$7,now()+interval '30 days',$8)",
      [profileId, inviteEmail || null, invitePhone || null, digest(token), inviteEmail ? "sent" : "pending_lookup", inviteEmail ? "email" : "sms", invitePhone ? "twilio_required" : "not_requested", `${mine?.display_name || mine?.handle || "A friend"} invited you to join Aviator Flight Log.`],
    );
    if (inviteEmail && (isMailConfigured() || process.env.MAIL_MODE === "record")) {
      const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.APP_URL || (input.request ? new URL(input.request.url).origin : "http://localhost:4173");
      const url = base.replace(/\/$/, "") + "/flight-log/join?invite=" + encodeURIComponent(token);
      await sendMail({ to: inviteEmail, subject: "Join Aviator Flight Log", text: `${mine?.display_name || mine?.handle || "A friend"} invited you to join Aviator Flight Log. ${url}`, html: `<p>${mine?.display_name || mine?.handle || "A friend"} invited you to join Aviator Flight Log.</p><p><a href="${url}">Create your account</a></p>` });
    }
    return { type: inviteEmail ? "email_invite" : "phone_pending" };
  });
}

export async function respondToFlightLogFriendRequest(profileId: number, requesterId: number, action: "accept" | "decline") {
  requireDb();
  await withDatabase(async (client) => {
    if (action === "accept") await client.query("UPDATE flight_log.friendships SET status='accepted', responded_at=now() WHERE requester_profile_id=$1 AND addressee_profile_id=$2 AND status='pending'", [requesterId, profileId]);
    else await client.query("DELETE FROM flight_log.friendships WHERE requester_profile_id=$1 AND addressee_profile_id=$2 AND status='pending'", [requesterId, profileId]);
  });
}
