"use client";

import { useState } from "react";
import type { FlightLogPostTargetType } from "@/lib/flight-log-social";
import type { FlightLogUserRole } from "@/lib/flight-log-user-types";

type Props = {
  targetType: FlightLogPostTargetType;
  targetId: string | number;
  authorProfileId?: number;
  authorRole?: FlightLogUserRole;
  currentProfileId?: number;
  currentRole?: FlightLogUserRole;
};

export function FlightLogPostModerationActions({ targetType, targetId, authorProfileId = 0, authorRole = "user", currentProfileId, currentRole = "user" }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ownsPost = targetType === "customer" && Boolean(currentProfileId && currentProfileId === authorProfileId);
  const canModerate = currentRole === "moderator" || currentRole === "admin";
  const canDelete = targetType === "official" ? currentRole === "admin" : ownsPost || canModerate;
  const canBan = targetType === "customer" && canModerate && currentProfileId !== authorProfileId && authorRole !== "admin" && (currentRole === "admin" || authorRole === "user");
  if (!canDelete && !canBan) return null;

  async function remove() {
    if (!window.confirm("Delete this Flight Log post permanently? This cannot be undone.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/flight-log/moderation?targetType=" + encodeURIComponent(targetType) + "&targetId=" + encodeURIComponent(String(targetId)), { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not delete this post.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete this post.");
      setBusy(false);
    }
  }

  async function ban() {
    if (!window.confirm("Ban this Flight Log user? They will be signed out and their posts will be hidden.")) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/flight-log/moderation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId: authorProfileId }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not ban this user.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not ban this user.");
      setBusy(false);
    }
  }

  return <div className="flight-log-post-moderation">
    {canDelete ? <button type="button" onClick={remove} disabled={busy}>{ownsPost ? "Delete my post" : "Delete post"}</button> : null}
    {canBan ? <button type="button" onClick={ban} disabled={busy}>Ban user</button> : null}
    {message ? <span role="alert">{message}</span> : null}
  </div>;
}
