import path from "node:path";

export function flightLogAvatarDirectory() {
  return process.env.FLIGHT_LOG_AVATAR_DIRECTORY || path.join(process.cwd(), "public", "media", "flight-log-avatars");
}

export function flightLogPostMediaDirectory() {
  return process.env.FLIGHT_LOG_POST_MEDIA_DIRECTORY || path.join(process.cwd(), "public", "media", "flight-log-posts");
}

export function flightLogPostMediaUrl(filename: string) {
  return "/api/flight-log-post-files/" + encodeURIComponent(filename);
}

export function normalizeFlightLogPostMediaUrl(url: string) {
  const legacyPrefix = "/media/flight-log-posts/";
  if (!url.startsWith(legacyPrefix)) return url;
  return flightLogPostMediaUrl(path.basename(url));
}
