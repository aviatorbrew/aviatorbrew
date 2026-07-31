"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { FlightLogTargetType } from "@/lib/flight-log-social";

const reactionChoices = [
  { id: "thumbs_up", label: "👍" },
  { id: "heart", label: "❤️" },
  { id: "laugh", label: "😂" },
  { id: "beer", label: "🍺" },
  { id: "airplane", label: "✈️" },
];

type Comment = { id: number; authorName: string; authorHandle: string; body: string; createdAt: string };
type Summary = { reactions: Record<string, number>; comments: Comment[] };

export function FlightLogPostActions({ targetType, targetId, canInteract, signedIn }: { targetType: FlightLogTargetType; targetId: string; canInteract: boolean; signedIn: boolean }) {
  const [summary, setSummary] = useState<Summary>({ reactions: {}, comments: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch(`/api/flight-log/interactions?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`);
    const body = await response.json().catch(() => ({})) as { summary?: Summary };
    if (body.summary) setSummary(body.summary);
  }
  useEffect(() => { load().catch(() => undefined); }, [targetType, targetId]);

  async function react(reaction: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/flight-log/interactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "reaction", targetType, targetId, reaction }) });
      const body = await response.json().catch(() => ({})) as { error?: string; summary?: Summary };
      if (!response.ok) throw new Error(body.error || "Could not save reaction.");
      if (body.summary) setSummary(body.summary);
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
      if (body.summary) setSummary(body.summary);
      form.reset();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add comment."); }
    finally { setBusy(false); }
  }

  if (!signedIn) return <div className="flight-log-post-actions"><Link className="flight-log-mini-button" href="/flight-log/sign-in">Sign in to react or comment</Link></div>;

  return <div className="flight-log-post-actions">
    <div className="flight-log-reaction-row" aria-label="Post reactions">
      {reactionChoices.map((reaction) => <button key={reaction.id} type="button" onClick={() => react(reaction.id)} disabled={busy || !canInteract} title={!canInteract ? "Verify your email first" : reaction.id.replace("_", " ")}><span aria-hidden="true">{reaction.label}</span><small>{summary.reactions[reaction.id] || 0}</small></button>)}
    </div>
    {summary.comments.length ? <div className="flight-log-comments">{summary.comments.map((item) => <article key={item.id}><strong>{item.authorName}</strong><p>{item.body}</p></article>)}</div> : null}
    {canInteract ? <form className="flight-log-comment-form" onSubmit={comment}><input name="body" placeholder="Write a comment..." maxLength={1000} required /><button type="submit" disabled={busy}>Comment</button></form> : <p className="flight-log-action-note">Verify your email before commenting.</p>}
    {error ? <p className="flight-log-auth-message is-error" role="alert">{error}</p> : null}
  </div>;
}
