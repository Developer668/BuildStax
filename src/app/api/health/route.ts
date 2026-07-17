import { NextResponse } from "next/server";
import { getDatabaseHealth } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = await getDatabaseHealth();
    return NextResponse.json(
      { status: database ? "ok" : "degraded", database, timestamp: new Date().toISOString() },
      { status: database ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ status: "unavailable", database: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
