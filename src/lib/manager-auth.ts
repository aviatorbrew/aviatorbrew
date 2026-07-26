import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

const cookieName = "aviator_manager";

function signature() {
  const secret = process.env.MANAGER_PORTAL_KEY;
  return secret ? createHmac("sha256", secret).update("aviator-manager-session-v1").digest("hex") : "";
}

export function managerSessionToken() { return signature(); }

export function isManager(request: NextRequest) {
  const token = request.cookies.get(cookieName)?.value;
  const expected = signature();
  if (!token || !expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function canManageMedia(request: NextRequest) {
  return isManager(request) || Boolean(process.env.MENU_LIBRARY_KEY && request.headers.get("x-menu-library-key") === process.env.MENU_LIBRARY_KEY);
}

export const managerCookie = cookieName;
