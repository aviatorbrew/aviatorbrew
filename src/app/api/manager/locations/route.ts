import { NextRequest, NextResponse } from "next/server";
import { getPortalLocations, updateLocation } from "@/lib/managed-locations";
import { isManager } from "@/lib/manager-auth";

export const runtime = "nodejs";

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

function locationInput(body: Record<string, unknown>) {
  const slug = clean(body.slug, 120);
  const name = clean(body.name, 140);
  const shortName = clean(body.shortName, 80);
  const type = clean(body.type, 120);
  const description = clean(body.description, 700);
  const address = clean(body.address, 180);
  const phone = clean(body.phone, 40);
  const hours = clean(body.hours, 220);
  const menu = clean(body.menu, 300);
  const accessibility = clean(body.accessibility, 400);
  const parking = clean(body.parking, 400);
  const history = clean(body.history, 1800);
  if (!slug || !name || !shortName || !type || !description || !address || !phone || !hours || !history || !accessibility || !parking) {
    throw new Error("Complete the location name, short name, type, description, address, phone, hours, history, parking, and accessibility details.");
  }
  if (menu && !menu.startsWith("/") && !/^https?:\/\//i.test(menu)) throw new Error("Menu link must begin with /, http://, or https://.");
  return { slug, value: { name, shortName, type, description, address, phone, hours, menu: menu || undefined, events: body.events === true, comingSoon: body.comingSoon === true, accessibility, parking, history } };
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ locations: await getPortalLocations() });
}

export async function PATCH(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const { slug, value } = locationInput(body);
    await updateLocation(slug, value);
    return NextResponse.json({ ok: true, locations: await getPortalLocations() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update location." }, { status: 400 });
  }
}
