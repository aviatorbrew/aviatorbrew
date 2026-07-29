import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() { return NextResponse.json({ error: "Keg pricing is imported with keg/package sales inventory." }, { status: 410 }); }
export async function POST() { return NextResponse.json({ error: "Keg pricing is imported with keg/package sales inventory." }, { status: 410 }); }
export async function PATCH() { return NextResponse.json({ error: "Keg pricing is imported with keg/package sales inventory." }, { status: 410 }); }
export async function DELETE() { return NextResponse.json({ error: "Keg pricing is imported with keg/package sales inventory." }, { status: 410 }); }
