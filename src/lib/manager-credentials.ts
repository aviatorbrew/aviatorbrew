import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

type ManagerCredentialStore = {
  passwordSalt?: string;
  passwordHash?: string;
  passwordUpdatedAt?: string;
  resetTokenHash?: string;
  resetExpiresAt?: string;
};

const bundledDataFile = () => path.join(process.cwd(), "data", "manager-auth.json");
const dataFile = () => process.env.MANAGER_AUTH_DATA_FILE || bundledDataFile();

function parseStore(value: string): ManagerCredentialStore {
  const parsed = JSON.parse(value) as ManagerCredentialStore;
  return parsed && typeof parsed === "object" ? parsed : {};
}

async function readStoreFile(file: string): Promise<ManagerCredentialStore> {
  return parseStore(await fs.readFile(file, "utf8"));
}

async function readStore(): Promise<ManagerCredentialStore> {
  const primary = dataFile();
  try {
    return await readStoreFile(primary);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const fallback = bundledDataFile();
    if (primary === fallback) return {};
    try {
      return await readStoreFile(fallback);
    } catch (fallbackError) {
      if ((fallbackError as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw fallbackError;
    }
  }
}

function readStoreSync(): ManagerCredentialStore {
  const files = Array.from(new Set([dataFile(), bundledDataFile()]));
  for (const file of files) {
    if (!existsSync(file)) continue;
    return parseStore(readFileSync(file, "utf8"));
  }
  return {};
}

async function writeStore(value: ManagerCredentialStore) {
  const file = dataFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + ".tmp";
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + "\n", "utf8");
  await fs.rename(temporary, file);
}

function passwordDigest(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

function tokenDigest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function secureEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function managerCredentialSessionSecret() {
  const configured = process.env.MANAGER_PORTAL_KEY;
  if (configured) return configured;
  const store = readStoreSync();
  return store.passwordHash || "";
}

export async function verifyManagerPassword(password: string) {
  if (!password) return false;
  const store = await readStore();
  if (store.passwordSalt && store.passwordHash) return secureEqual(passwordDigest(password, store.passwordSalt), store.passwordHash);
  const configured = process.env.MANAGER_PORTAL_KEY || "";
  return secureEqual(password, configured);
}

export async function createManagerPasswordReset() {
  const store = await readStore();
  const token = randomBytes(32).toString("base64url");
  await writeStore({
    ...store,
    resetTokenHash: tokenDigest(token),
    resetExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  });
  return token;
}

export async function resetManagerPassword(token: string, password: string) {
  if (password.length < 12 || password.length > 200) throw new Error("Use a password between 12 and 200 characters.");
  const store = await readStore();
  const expiresAt = store.resetExpiresAt ? new Date(store.resetExpiresAt).getTime() : 0;
  if (!store.resetTokenHash || !expiresAt || expiresAt < Date.now() || !secureEqual(tokenDigest(token), store.resetTokenHash)) throw new Error("This reset link is invalid or expired.");
  const salt = randomBytes(16).toString("hex");
  await writeStore({
    passwordSalt: salt,
    passwordHash: passwordDigest(password, salt),
    passwordUpdatedAt: new Date().toISOString(),
  });
}
