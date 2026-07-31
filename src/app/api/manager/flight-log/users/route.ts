import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { deleteManagedFlightLogUser, getManagedFlightLogUsers, updateManagedFlightLogUser } from "@/lib/flight-log-users";
import type { ManagedFlightLogUserInput } from "@/lib/flight-log-user-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
}

async function removeLocalMedia(urls: string[]) {
  const directory = path.join(process.cwd(), "public", "media", "flight-log-posts");
  for (const url of urls) {
    if (!url.startsWith("/media/flight-log-posts/")) continue;
    await fs.unlink(path.join(directory, path.basename(url))).catch(() => undefined);
  }
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return unauthorized();
  try {
    return NextResponse.json({ users: await getManagedFlightLogUsers() }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Flight Log users." }, { status: 500, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return unauthorized();
  try {
    const input = await request.json() as ManagedFlightLogUserInput;
    const user = await updateManagedFlightLogUser(input);
    return NextResponse.json({ user, users: await getManagedFlightLogUsers() }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update Flight Log user." }, { status: 400, headers: noStore });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isManager(request)) return unauthorized();
  try {
    const id = Number(request.nextUrl.searchParams.get("id"));
    const deleted = await deleteManagedFlightLogUser(id);
    await removeLocalMedia(deleted.mediaUrls);
    return NextResponse.json({ deleted, users: await getManagedFlightLogUsers() }, { headers: noStore });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete Flight Log user." }, { status: 400, headers: noStore });
  }
}
