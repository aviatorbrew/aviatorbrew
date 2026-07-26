import { NextRequest, NextResponse } from "next/server";
import { managerCookie, managerSessionToken } from "@/lib/manager-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(managerCookie)?.value;
  return NextResponse.json({ authenticated: Boolean(token && token === managerSessionToken()) });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { password?: string };
  if (!process.env.MANAGER_PORTAL_KEY || body.password !== process.env.MANAGER_PORTAL_KEY) return NextResponse.json({ error: "Invalid manager password." }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: managerCookie, value: managerSessionToken(), httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: managerCookie, value: "", path: "/", maxAge: 0 });
  return response;
}
