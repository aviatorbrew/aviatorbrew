const FALLBACK_PUBLIC_SITE_URL = "https://aviatorbrew.onrender.com";

function normalizeUrl(value?: string | null) {
  const trimmed = value?.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const invalid =
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "127.0.0.1" ||
      host.startsWith("127.") ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.includes("your-render-domain") ||
      host.includes("example.com");
    if (invalid) return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function publicSiteUrl(requestOrigin?: string | null) {
  return (
    normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
    normalizeUrl(process.env.SITE_URL) ||
    normalizeUrl(process.env.RENDER_EXTERNAL_URL) ||
    normalizeUrl(requestOrigin) ||
    FALLBACK_PUBLIC_SITE_URL
  );
}
