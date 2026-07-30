import { NextRequest, NextResponse } from "next/server";
import { isManager } from "@/lib/manager-auth";
import { databaseConfigured, quoteIdentifier, safeDatabaseSummary, withDatabase } from "@/lib/database";

export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

type DatabaseTable = {
  schema: string;
  name: string;
  type: string;
};

function cleanName(value: string | null) {
  const normalized = (value || "").trim();
  return /^[A-Za-z0-9_]+$/.test(normalized) ? normalized : "";
}

function numberParam(value: string | null, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function cellValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return "<binary " + value.length + " bytes>";
  if (typeof value === "bigint") return value.toString();
  return value;
}

function serializeRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, cellValue(value)])));
}

async function tableExists(schema: string, table: string) {
  return withDatabase(async (client) => {
    const result = await client.query(
      `SELECT table_schema AS schema, table_name AS name, table_type AS type
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
       LIMIT 1`,
      [schema, table],
    );
    return result.rows[0] as DatabaseTable | undefined;
  });
}

async function health() {
  const started = Date.now();
  const result = await withDatabase(async (client) => client.query(
    "SELECT current_database() AS database, current_schema() AS schema, now() AS checked_at, version() AS version",
  ));
  return { connected: true, latencyMs: Date.now() - started, summary: safeDatabaseSummary(), server: serializeRows(result.rows)[0] };
}

async function tables() {
  const result = await withDatabase(async (client) => client.query(
    `SELECT table_schema AS schema, table_name AS name, table_type AS type
     FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
     ORDER BY table_schema, table_name`,
  ));
  return result.rows as DatabaseTable[];
}

async function rows(request: NextRequest) {
  const schema = cleanName(request.nextUrl.searchParams.get("schema")) || "public";
  const table = cleanName(request.nextUrl.searchParams.get("table"));
  const limit = numberParam(request.nextUrl.searchParams.get("limit"), 50, 1, 200);
  const offset = numberParam(request.nextUrl.searchParams.get("offset"), 0, 0, 100000);
  if (!table) return NextResponse.json({ error: "Choose a valid table." }, { status: 400, headers: noStore });
  const found = await tableExists(schema, table);
  if (!found) return NextResponse.json({ error: "Table not found." }, { status: 404, headers: noStore });
  const sql = `SELECT * FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)} LIMIT $1 OFFSET $2`;
  const result = await withDatabase(async (client) => client.query(sql, [limit, offset]));
  return NextResponse.json({
    table: found,
    limit,
    offset,
    columns: result.fields.map((field) => field.name),
    rows: serializeRows(result.rows),
  }, { headers: noStore });
}

export async function GET(request: NextRequest) {
  if (!isManager(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const mode = request.nextUrl.searchParams.get("mode") || "health";
  if (!databaseConfigured()) return NextResponse.json({ configured: false, summary: null, error: "DATABASE_URL is not configured." }, { status: 503, headers: noStore });
  try {
    if (mode === "health") return NextResponse.json({ configured: true, ...(await health()) }, { headers: noStore });
    if (mode === "tables") return NextResponse.json({ configured: true, tables: await tables() }, { headers: noStore });
    if (mode === "rows") return rows(request);
    return NextResponse.json({ error: "Unknown database action." }, { status: 400, headers: noStore });
  } catch (error) {
    return NextResponse.json({ configured: true, summary: safeDatabaseSummary(), error: error instanceof Error ? error.message : "Database request failed." }, { status: 500, headers: noStore });
  }
}
