import { createHmac, timingSafeEqual } from "crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { managerCredentialSessionSecret } from "@/lib/manager-credentials";

const cookieName = "aviator_manager";

function signature() {
  const secret = managerCredentialSessionSecret();
  return secret ? createHmac("sha256", secret).update("aviator-manager-session-v1").digest("hex") : "";
}

export function managerSessionToken() { return signature(); }

export function isManager(request: NextRequest) {
  const token = request.cookies.get(cookieName)?.value;
  const expected = signature();
  if (!token || !expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function localEnvValue(name: string) {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return "";
  const line = readFileSync(file, "utf8").split(/\r?\n/).find((entry) => entry.trim().startsWith(name + "="));
  if (!line) return "";
  return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
}

export function menuLibraryKey() {
  return process.env.MENU_LIBRARY_KEY || localEnvValue("MENU_LIBRARY_KEY");
}

export function canManageMedia(request: NextRequest) {
  const key = menuLibraryKey();
  return isManager(request) || Boolean(key && request.headers.get("x-menu-library-key") === key);
}

export const managerCookie = cookieName;
