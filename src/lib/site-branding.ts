import { promises as fs } from "node:fs";
import path from "node:path";

const logoExtensions = [".png", ".jpg", ".jpeg", ".webp"] as const;
const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export const brandLogoUrl = "/api/branding/logo";

export function brandingDirectory() {
  return process.env.BRANDING_MEDIA_DIRECTORY || path.join(process.cwd(), "public", "media", "branding");
}

export async function findCustomLogo() {
  for (const extension of logoExtensions) {
    const file = path.join(brandingDirectory(), "logo" + extension);
    try {
      const stats = await fs.stat(file);
      if (stats.isFile()) return { file, extension, contentType: contentTypes[extension], updatedAt: stats.mtime.toISOString() };
    } catch {
      // Try the next supported extension.
    }
  }
  return null;
}

export async function removeCustomLogo() {
  await Promise.all(logoExtensions.map(async (extension) => {
    try {
      await fs.unlink(path.join(brandingDirectory(), "logo" + extension));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }));
}

export async function saveCustomLogo(extension: string, bytes: Buffer) {
  if (!logoExtensions.includes(extension as (typeof logoExtensions)[number])) throw new Error("Unsupported logo format.");
  const directory = brandingDirectory();
  await fs.mkdir(directory, { recursive: true });
  const destination = path.join(directory, "logo" + extension);
  const temporary = path.join(directory, ".logo-" + process.pid + "-" + Date.now() + extension);
  await fs.writeFile(temporary, bytes);
  await removeCustomLogo();
  await fs.rename(temporary, destination);
  return destination;
}
