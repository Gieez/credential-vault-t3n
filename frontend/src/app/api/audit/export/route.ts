import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/t3n-sessions";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const exported = await session.client.exportActivityLog();
    return new NextResponse(exported.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="vaultgate-t3n-audit.csv"',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "CSV export failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
