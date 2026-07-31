"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function FlightLogPostComposer({ signedIn, canPost, callsign }: { signedIn: boolean; canPost: boolean; callsign?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const form = event.currentTarget;
    try {
      const response = await fetch("/api/flight-log/posts", { method: "POST", body: new FormData(form) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not publish your post.");
      form.reset();
      setMessage("Post published.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not publish your post."); }
    finally { setBusy(false); }
  }

  if (!signedIn) return <section className="flight-log-composer"><div className="flight-log-avatar">AB</div><div><label htmlFor="flight-log-question" className="sr-only">Ask Aviator a question</label><input id="flight-log-question" placeholder="Ask Aviator a question..." disabled /><p>Sign in to post, comment, and check in.</p></div><Link className="button" href="/flight-log/sign-in">Sign In</Link></section>;

  return <section className="flight-log-composer flight-log-post-composer" aria-label="Create a Flight Log post"><div className="flight-log-avatar">{callsign?.slice(0, 2).toUpperCase() || "AB"}</div><form onSubmit={submit}>
    <label className="sr-only" htmlFor="flight-log-post-body">Create a Flight Log post</label>
    <textarea id="flight-log-post-body" name="body" placeholder="Ask Aviator a question or share what is happening..." rows={3} maxLength={5000} disabled={!canPost || busy} />
    <div className="flight-log-post-composer-tools"><input name="title" placeholder="Optional title" maxLength={120} disabled={!canPost || busy} /><input name="tagHandles" placeholder="Tag friends by callsign" maxLength={300} disabled={!canPost || busy} /><input name="media" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime" multiple disabled={!canPost || busy} /><button className="button" disabled={!canPost || busy}>{busy ? "Posting..." : "Post"}</button></div>
    {!canPost ? <p>Verify your email before posting.</p> : null}
    {message ? <p className="flight-log-auth-message" role="status">{message}</p> : null}
    {error ? <p className="flight-log-auth-message is-error" role="alert">{error}</p> : null}
  </form></section>;
}
