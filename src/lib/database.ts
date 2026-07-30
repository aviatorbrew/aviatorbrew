import { Pool, type PoolClient } from "pg";

type DatabaseConfig = {
  connectionString: string;
  ssl?: { rejectUnauthorized: boolean };
};

let pool: Pool | undefined;

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

function sslRequired(url: string) {
  return /sslmode=require/i.test(url) || process.env.POSTGRES_SSL === "true";
}

function config(): DatabaseConfig | null {
  const connectionString = databaseUrl();
  if (!connectionString) return null;
  return {
    connectionString,
    ...(sslRequired(connectionString) ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export function databaseConfigured() {
  return Boolean(config());
}

export function safeDatabaseSummary() {
  const url = databaseUrl();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port || "5432",
      database: parsed.pathname.replace(/^\//, "") || null,
      ssl: sslRequired(url),
    };
  } catch {
    return { host: "Configured", port: null, database: null, ssl: sslRequired(url) };
  }
}

function getPool() {
  const current = config();
  if (!current) throw new Error("DATABASE_URL is not configured.");
  if (!pool) pool = new Pool({ ...current, max: 3, idleTimeoutMillis: 30000, connectionTimeoutMillis: 7000 });
  return pool;
}

export async function withDatabase<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export function quoteIdentifier(value: string) {
  return '"' + value.replace(/"/g, '""') + '"';
}
