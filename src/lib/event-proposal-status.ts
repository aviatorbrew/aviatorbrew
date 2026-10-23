import type { EventProposal } from "@/lib/event-proposals";

export function proposalStatus(proposal: Pick<EventProposal, "state" | "accepted_at" | "acceptanceMethod" | "sent_at" | "approved_at" | "expires_at">, now = Date.now()) {
  if (proposal.state === "changes_requested") return {label: "Changes Requested", tone: "review"};
  if (["cancelled", "declined", "superseded"].includes(proposal.state)) return {label: {cancelled: "Cancelled", declined: "Declined", superseded: "Superseded"}[proposal.state]!, tone: "closed"};
  if (proposal.accepted_at) return {label: proposal.acceptanceMethod === "manual" ? "Manual Accepted" : "Customer Accepted", tone: "accepted"};
  if (new Date(proposal.expires_at).getTime() <= now) return {label: "Expired", tone: "closed"};
  if (proposal.sent_at) return {label: "Sent", tone: "review"};
  if (proposal.approved_at) return {label: "Approved — Not Sent", tone: "review"};
  return {label: "Draft", tone: "draft"};
}
