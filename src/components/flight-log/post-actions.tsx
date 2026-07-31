"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { FlightLogComment, FlightLogTargetType } from "@/lib/flight-log-social";
import type { FlightLogUserRole } from "@/lib/flight-log-user-types";

const reactionChoices = [
  { id: "thumbs_up", icon: "👍", label: "Like" },
  { id: "heart", icon: "❤️", label: "Love" },
  { id: "laugh", icon: "😂", label: "Laugh" },
  { id: "beer", icon: "🍺", label: "Beer" },
  { id: "airplane", icon: "✈️", label: "Fly" },
];

type Summary = { reactions: Record<string, number>; comments: FlightLogComment[] };
const emptySummary: Summary = { reactions: {}, comments: [] };
function normalizeSummary(value: unknown): Summary {
  if (!value || typeof value !== "object") return emptySummary;
  const next = value as Partial<Summary>;
  const reactions = next.reactions && typeof next.reactions === "object" && !Array.isArray(next.reactions) ? next.reactions : {};
  const comments = Array.isArray(next.comments) ? next.comments : [];
  return { reactions, comments };
}

type Props = {
  targetType: FlightLogTargetType;
  targetId: string;
  canInteract: boolean;
  signedIn: boolean;
  currentProfileId?: number;
  currentRole?: FlightLogUserRole;
};

export function FlightLogPostActions({ targetType, targetId, canInteract, signedIn, currentProfileId, currentRole = "user" }: Props) {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch(`/api/flight-log/interactions?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`);
    const body = await response.json().catch(() => ({})) as { summary?: Summary };
    if (body.summary) setSummary(normalizeSummary(body.summary));
  }
  useEffect(() => { load().catch(() => undefined); }, [targetType, targetId]);

  async function react(reaction: string, nextTargetType: FlightLogTargetType = targetType, nextTargetId: string = targetId) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/flight-log/interactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reaction", targetType: nextTargetType, targetId: nextTargetId, reaction }) });
      const body = await response.json().catch(() => ({})) as { error?: string; summary?: Summary };
      if (!response.ok) throw new Error(body.error || "Could not save reaction.");
      if (nextTargetType === "comment") {
        const next = normalizeSummary(body.summary);
        setSummary((current) => ({ ...current, comments: current.comments.map((comment) => String(comment.id) === nextTargetId ? { ...comment, reactions: next.reactions } : comment) }));
      } else if (body.summary) setSummary(normalizeSummary(body.summary));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save reaction."); }
    finally { setBusy(false); }
  }

  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = event.currentTarget;
    const bodyText = String(new FormData(form).get("body") || "");
    try {
      const response = await fetch("/api/flight-log/interactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "comment", targetType, targetId, body: bodyText }) });
      const body = await response.json().catch(() => ({})) as { error?: string; summary?: Summary };
      if (!response.ok) throw new Error(body.error || "Could not add comment.");
      if (body.summary) setSummary(normalizeSummary(body.summary));
      form.reset();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add comment."); }
    finally { setBusy(false); }
  }

  async function deleteComment(commentId: number) {
    if (!window.confirm("Delete this comment permanently? This cannot be undone.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/flight-log/interactions?commentId=" + encodeURIComponent(String(commentId)), { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: string; summary?: Summary };
      if (!response.ok) throw new Error(body.error || "Could not delete comment.");
      if (body.summary) setSummary(normalizeSummary(body.summary));
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete comment."); }
    finally { setBusy(false); }
  }

  function canDeleteComment(item: FlightLogComment) {
    return Boolean(currentProfileId && currentProfileId === item.authorProfileId) || currentRole === "moderator" || currentRole === "admin";
  }

  function reactionRow(reactions: Record<string, number>, label: string, nextTargetType: FlightLogTargetType = targetType, nextTargetId: string = targetId, compact = false) {
    return <div className={compact ? "flight-log-reaction-row flight-log-comment-reaction-row" : "flight-log-reaction-row"} aria-label={label}>
      {reactionChoices.map((reaction) => <button key={reaction.id} type="button" onClick={() => react(reaction.id, nextTargetType, nextTargetId)} disabled={busy || !canInteract} title={!canInteract ? "Verify your email first" : reaction.label} aria-label={reaction.label}><span className="flight-log-reaction-icon" aria-hidden="true">{reaction.icon}</span><span className="flight-log-reaction-label">{reaction.label}</span><small>{reactions?.[reaction.id] || 0}</small></button>)}
    </div>;
  }

  if (!signedIn) return <div className="flight-log-post-actions"><Link className="flight-log-mini-button" href="/flight-log/sign-in">Sign in to react or comment</Link></div>;

  return <div className="flight-log-post-actions">
    {reactionRow(summary.reactions, "Post reactions")}
    {summary.comments?.length ? <div className="flight-log-comments">{summary.comments.map((item) => <article key={item.id}><header><strong>{item.authorName}</strong>{canDeleteComment(item) ? <button className="flight-log-comment-delete" type="button" onClick={() => deleteComment(item.id)} disabled={busy}>Delete comment</button> : null}</header><p>{item.body}</p>{reactionRow(item.reactions || {}, "Comment reactions", "comment", String(item.id), true)}</article>)}</div> : null}
    {canInteract ? <form className="flight-log-comment-form" onSubmit={comment}><input name="body" placeholder="Write a comment..." maxLength={1000} required /><button type="submit" disabled={busy}>Comment</button></form> : <p className="flight-log-action-note">Verify your email before commenting.</p>}
    {error ? <p className="flight-log-auth-message is-error" role="alert">{error}</p> : null}
  </div>;
}
