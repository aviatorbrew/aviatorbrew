"use client";

import { Fragment, type FormEvent, useEffect, useMemo, useState } from "react";
import { flightLogUserRoles, flightLogUserStatuses, type FlightLogUserRole, type FlightLogUserStatus, type ManagedFlightLogUser, type ManagedFlightLogUserInput } from "@/lib/flight-log-user-types";

type RoleFilter = FlightLogUserRole | "all";
type StatusFilter = FlightLogUserStatus | "all";

function label(value: string) {
  return value.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function stamp(value: string) {
  if (!value) return "Never";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "2-digit" }).format(date);
}

function editable(user: ManagedFlightLogUser): ManagedFlightLogUserInput {
  return {
    id: user.id,
    callsign: user.callsign,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    bio: user.bio,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
  };
}

function searchable(user: ManagedFlightLogUser) {
  return [user.displayName, user.firstName, user.lastName, user.callsign, user.email, user.phone, user.role, user.status].join(" ").toLowerCase();
}

export function FlightLogUsersAdmin() {
  const [users, setUsers] = useState<ManagedFlightLogUser[]>([]);
  const [editing, setEditing] = useState<ManagedFlightLogUserInput | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [message, setMessage] = useState("Loading Flight Log users...");
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => (roleFilter === "all" || user.role === roleFilter) && (statusFilter === "all" || user.status === statusFilter) && (!needle || searchable(user).includes(needle)));
  }, [users, query, roleFilter, statusFilter]);

  const counts = useMemo(() => ({
    users: users.filter((user) => user.role === "user").length,
    moderators: users.filter((user) => user.role === "moderator").length,
    admins: users.filter((user) => user.role === "admin").length,
    banned: users.filter((user) => user.status === "banned").length,
  }), [users]);

  async function load() {
    const response = await fetch("/api/manager/flight-log/users", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load Flight Log users.");
    setUsers(body.users || []);
    setMessage("");
  }

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, []);

  function setValue<K extends keyof ManagedFlightLogUserInput>(key: K, value: ManagedFlightLogUserInput[K]) {
    setEditing((current) => current ? { ...current, [key]: value } : current);
  }

  async function updateUser(input: ManagedFlightLogUserInput, success: string) {
    setBusy(true);
    setMessage("Updating Flight Log user...");
    try {
      const response = await fetch("/api/manager/flight-log/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update Flight Log user.");
      setUsers(body.users || []);
      setEditing(null);
      setMessage(success);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update Flight Log user.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editing) await updateUser(editing, "User updated.");
  }

  async function toggleBan(user: ManagedFlightLogUser) {
    const banning = user.status !== "banned";
    if (banning && !window.confirm("Ban @" + user.callsign + "? They will be signed out immediately and their posts will be hidden.")) return;
    await updateUser({ ...editable(user), status: banning ? "banned" : (user.emailVerified ? "active" : "pending_verification") }, banning ? "User banned." : "User restored.");
  }

  async function remove(user: ManagedFlightLogUser) {
    if (!window.confirm("Delete @" + user.callsign + " permanently? Their account, customer posts, media records, comments, reactions, friendships, and check-ins will be removed. This cannot be undone.")) return;
    setBusy(true);
    setMessage("Deleting Flight Log user...");
    try {
      const response = await fetch("/api/manager/flight-log/users?id=" + encodeURIComponent(String(user.id)), { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not delete Flight Log user.");
      setUsers(body.users || []);
      if (editing?.id === user.id) setEditing(null);
      setMessage("User deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete Flight Log user.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="flight-log-users-admin">
    <div className="flight-log-user-summary" aria-label="Flight Log user totals">
      <span><strong>{counts.users}</strong> Users</span>
      <span><strong>{counts.moderators}</strong> Moderators</span>
      <span><strong>{counts.admins}</strong> Admins</span>
      <span className={counts.banned ? "has-banned" : ""}><strong>{counts.banned}</strong> Banned</span>
    </div>
    <div className="flight-log-user-tools">
      <label>Search users<input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Name, callsign, email, phone" /></label>
      <label>Role<select value={roleFilter} onChange={(event) => setRoleFilter(event.currentTarget.value as RoleFilter)}><option value="all">All roles</option>{flightLogUserRoles.map((role) => <option value={role} key={role}>{label(role)}</option>)}</select></label>
      <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value as StatusFilter)}><option value="all">All statuses</option>{flightLogUserStatuses.map((status) => <option value={status} key={status}>{label(status)}</option>)}</select></label>
      <button type="button" onClick={() => load().catch((error) => setMessage(error.message))} disabled={busy}>Refresh</button>
    </div>
    <p className="media-message" role="status">{message}</p>
    <div className="flight-log-user-table-wrap">
      <table className="flight-log-user-table">
        <thead><tr><th>Name / callsign</th><th>Contact</th><th>Role</th><th>Status</th><th>Verified</th><th>Activity</th><th>Joined</th><th>Last login</th><th>Actions</th></tr></thead>
        <tbody>
          {filtered.map((user) => <Fragment key={user.id}>
            <tr className={user.status === "banned" ? "is-banned" : ""} key={"user-" + user.id}>
              <td><strong>{user.displayName}</strong><small>@{user.callsign} / #{user.id}</small></td>
              <td><span>{user.email}</span>{user.phone ? <small>{user.phone}</small> : null}</td>
              <td><span className={"flight-log-user-chip is-" + user.role}>{label(user.role)}</span></td>
              <td><span className={"flight-log-user-chip is-" + user.status}>{label(user.status)}</span></td>
              <td>{user.emailVerified ? "Yes" : "No"}</td>
              <td><span className="flight-log-user-activity" title="Posts / comments / check-ins / friends">{user.postCount}P / {user.commentCount}C / {user.checkInCount}I / {user.friendCount}F</span></td>
              <td><time dateTime={user.joinedAt}>{stamp(user.joinedAt)}</time></td>
              <td><time dateTime={user.lastLoginAt}>{stamp(user.lastLoginAt)}</time></td>
              <td><div className="flight-log-user-row-actions"><button type="button" onClick={() => setEditing(editable(user))} disabled={busy}>Edit</button>{user.role !== "admin" ? <button type="button" onClick={() => toggleBan(user)} disabled={busy}>{user.status === "banned" ? "Restore" : "Ban"}</button> : null}<button className="is-danger" type="button" onClick={() => remove(user)} disabled={busy}>Delete</button></div></td>
            </tr>
            {editing?.id === user.id ? <tr className="flight-log-user-edit-row" key={"edit-" + user.id}><td colSpan={9}>
              <form onSubmit={save}>
                <div className="flight-log-user-edit-heading"><div><span>Editing account</span><strong>@{editing.callsign}</strong></div><button type="button" onClick={() => setEditing(null)} disabled={busy}>Close</button></div>
                <div className="flight-log-user-edit-grid">
                  <label>First name<input value={editing.firstName} onChange={(event) => setValue("firstName", event.currentTarget.value)} required /></label>
                  <label>Last name<input value={editing.lastName} onChange={(event) => setValue("lastName", event.currentTarget.value)} required /></label>
                  <label>Display name<input value={editing.displayName} onChange={(event) => setValue("displayName", event.currentTarget.value)} required /></label>
                  <label>Callsign<input value={editing.callsign} onChange={(event) => setValue("callsign", event.currentTarget.value)} required /></label>
                  <label>Email<input type="email" value={editing.email} onChange={(event) => setValue("email", event.currentTarget.value)} required /></label>
                  <label>Phone<input type="tel" value={editing.phone || ""} onChange={(event) => setValue("phone", event.currentTarget.value)} /></label>
                  <label>Role<select value={editing.role} onChange={(event) => setValue("role", event.currentTarget.value as FlightLogUserRole)}>{flightLogUserRoles.map((role) => <option value={role} key={role}>{label(role)}</option>)}</select><small>Moderators can delete community posts and ban regular users. Admins control all Flight Log users.</small></label>
                  <label>Status<select value={editing.status} onChange={(event) => setValue("status", event.currentTarget.value as FlightLogUserStatus)}>{flightLogUserStatuses.map((status) => <option value={status} key={status}>{label(status)}</option>)}</select><small>Banning signs the user out and hides their posts.</small></label>
                  <label className="flight-log-user-edit-wide">Bio<textarea rows={3} value={editing.bio || ""} onChange={(event) => setValue("bio", event.currentTarget.value)} maxLength={500} /></label>
                  <label className="flight-log-user-verified"><input type="checkbox" checked={editing.emailVerified} onChange={(event) => setValue("emailVerified", event.currentTarget.checked)} /> Email verified</label>
                </div>
                <div className="flight-log-user-edit-actions"><button className="button" disabled={busy}>{busy ? "Saving..." : "Save user"}</button><button className="button button-outline" type="button" onClick={() => setEditing(null)} disabled={busy}>Cancel</button></div>
              </form>
            </td></tr> : null}
          </Fragment>)}
          {!filtered.length ? <tr><td colSpan={9} className="flight-log-user-empty">No users match this search.</td></tr> : null}
        </tbody>
      </table>
    </div>
  </section>;
}
