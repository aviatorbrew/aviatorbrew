import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentFlightLogCustomer, rateLimit, rateLimitKey } from "@/lib/flight-log-auth";
import { deleteFlightLogPost } from "@/lib/flight-log";
import { deleteCustomerFlightLogPost, deleteFlightLogTargetInteractions, type FlightLogPostTargetType } from "@/lib/flight-log-social";
import { flightLogPostMediaDirectory } from "@/lib/flight-log-upload-storage";
import { setFlightLogUserBanned } from "@/lib/flight-log-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" };

export async function POST(request: NextRequest) {
  const customer = await getCurrentFlightLogCustomer();
  if (!customer) return NextResponse.json({ error: "Sign in to moderate Flight Log." }, { status: 401, headers: noStore });
  if (customer.role !== "moderator" && customer.role !== "admin") return NextResponse.json({ error: "Moderator access is required." }, { status: 403, headers: noStore });
  try {
    rateLimit(rateLimitKey(request, "flight-log-ban", String(customer.id)), 30, 60 * 60 * 1000);
    const body = await request.json() as { profileId?: number };
    const profileId = Number(body.profileId);
    if (!Number.isInteger(profileId) || profileId < 1 || profileId === customer.id) throw new Error("Choose another valid Flight Log user.");
    await setFlightLogUserBanned(customer.role, profileId);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not ban this user." }, { status: 400, headers: noStore });
  }
}

export async function DELETE(request: NextRequest) {
  const customer = await getCurrentFlightLogCustomer();
  if (!customer) return NextResponse.json({ error: "Sign in to moderate Flight Log." }, { status: 401, headers: noStore });
  const targetType = request.nextUrl.searchParams.get("targetType") as FlightLogPostTargetType | null;
  const targetId = request.nextUrl.searchParams.get("targetId") || "";
  try {
    rateLimit(rateLimitKey(request, "flight-log-post-delete", String(customer.id)), 40, 60 * 60 * 1000);
    if (targetType === "official") {
      if (customer.role !== "admin") throw new Error("Admin access is required to delete official Flight Log posts.");
      await deleteFlightLogTargetInteractions("official", targetId);
      const post = await deleteFlightLogPost(targetId);
      revalidatePath("/flight-log");
      if (post.slug) revalidatePath("/flight-log/" + post.slug);
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    if (targetType === "customer") {
      const postId = Number(targetId);
      const deleted = await deleteCustomerFlightLogPost(customer.id, customer.role, postId);
      const directory = flightLogPostMediaDirectory();
      for (const url of deleted.mediaUrls) {
        if (url.startsWith("/media/flight-log-posts/") || url.startsWith("/api/flight-log-post-files/")) await fs.unlink(path.join(directory, path.basename(url))).catch(() => undefined);
      }
      revalidatePath("/flight-log");
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    throw new Error("Choose a valid Flight Log post.");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete this post." }, { status: 400, headers: noStore });
  }
}
